package core

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"time"
)

// PolicyAction is the result of evaluating a policy.
type PolicyAction string

const (
	ActionAllow PolicyAction = "allow"
	ActionBlock PolicyAction = "block"
	ActionDefer PolicyAction = "defer"
)

// Policy represents a named policy rule.
type Policy struct {
	ID      int64
	Name    string
	Enabled bool
	Config  map[string]any
}

// PolicyEngine evaluates actions against configured policies.
type PolicyEngine interface {
	Evaluate(ctx context.Context, action string, target string) (PolicyAction, error)
	ListPolicies(ctx context.Context) ([]Policy, error)
	SetPolicy(ctx context.Context, name string, enabled bool, config map[string]any) error
}

// DBPolicyEngine is a SQLite-backed PolicyEngine.
type DBPolicyEngine struct {
	db  *sql.DB
	bus EventBus
}

// NewPolicyEngine creates a PolicyEngine backed by the given database.
func NewPolicyEngine(db *sql.DB, bus EventBus) PolicyEngine {
	return &DBPolicyEngine{db: db, bus: bus}
}

// Evaluate checks whether an action on a target is permitted by active policies.
func (e *DBPolicyEngine) Evaluate(ctx context.Context, action, target string) (PolicyAction, error) {
	policies, err := e.ListPolicies(ctx)
	if err != nil {
		return ActionAllow, fmt.Errorf("evaluate policy: %w", err)
	}

	now := time.Now()

	for _, p := range policies {
		if !p.Enabled {
			continue
		}

		switch p.Name {
		case "max_stability_mode":
			blocked := toStringSlice(p.Config["block"])
			for _, b := range blocked {
				if b == action {
					return ActionBlock, nil
				}
			}

		case "quiet_hours":
			start, _ := p.Config["start"].(string)
			end, _ := p.Config["end"].(string)
			blocked := toStringSlice(p.Config["block"])

			if inQuietHours(now, start, end) {
				for _, b := range blocked {
					if b == action {
						return ActionDefer, nil
					}
				}
			}
		}
	}

	return ActionAllow, nil
}

// ListPolicies returns all policies from the database.
func (e *DBPolicyEngine) ListPolicies(ctx context.Context) ([]Policy, error) {
	rows, err := e.db.QueryContext(ctx, `SELECT id, name, enabled, config FROM policies`)
	if err != nil {
		return nil, fmt.Errorf("list policies: %w", err)
	}
	defer rows.Close()

	var result []Policy
	for rows.Next() {
		var p Policy
		var configJSON string
		var enabled int
		if err := rows.Scan(&p.ID, &p.Name, &enabled, &configJSON); err != nil {
			return nil, fmt.Errorf("scan policy: %w", err)
		}
		p.Enabled = enabled != 0
		if err := json.Unmarshal([]byte(configJSON), &p.Config); err != nil {
			p.Config = make(map[string]any)
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

// SetPolicy enables/disables a policy and updates its config.
func (e *DBPolicyEngine) SetPolicy(ctx context.Context, name string, enabled bool, config map[string]any) error {
	configJSON, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("marshal policy config: %w", err)
	}

	enabledInt := 0
	if enabled {
		enabledInt = 1
	}

	_, err = e.db.ExecContext(ctx,
		`INSERT INTO policies (name, enabled, config, updated_at)
		 VALUES (?, ?, ?, datetime('now'))
		 ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled, config = excluded.config, updated_at = excluded.updated_at`,
		name, enabledInt, string(configJSON))
	if err != nil {
		return fmt.Errorf("set policy %q: %w", name, err)
	}

	if e.bus != nil {
		evtType := PolicyDeactivated
		if enabled {
			evtType = PolicyActivated
		}
		e.bus.Publish(ctx, Event{
			Type:    evtType,
			Source:  "policy_engine",
			Payload: map[string]string{"policy": name},
		})
	}

	return nil
}

// helper: convert interface{} (from JSON) to []string
func toStringSlice(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(arr))
	for _, item := range arr {
		if s, ok := item.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

// inQuietHours returns true if now is between startTime and endTime (HH:MM format).
func inQuietHours(now time.Time, startTime, endTime string) bool {
	start := parseHHMM(startTime)
	end := parseHHMM(endTime)

	nowMinutes := now.Hour()*60 + now.Minute()
	if start <= end {
		return nowMinutes >= start && nowMinutes < end
	}
	// Wraps midnight.
	return nowMinutes >= start || nowMinutes < end
}

func parseHHMM(s string) int {
	parts := splitTwo(s, ':')
	if len(parts) != 2 {
		return 0
	}
	h, _ := strconv.Atoi(parts[0])
	m, _ := strconv.Atoi(parts[1])
	return h*60 + m
}

func splitTwo(s string, sep rune) []string {
	for i, c := range s {
		if c == sep {
			return []string{s[:i], s[i+1:]}
		}
	}
	return []string{s}
}
