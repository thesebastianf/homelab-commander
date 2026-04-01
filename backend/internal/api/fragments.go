package api

// fragments.go — Server-side HTML fragment renderers for HTMX swap targets.
// All /ui/* routes return HTML snippets (not JSON) so HTMX can innerHTML them.

import (
	"fmt"
	"html"
	"net/http"
	"strconv"
	"time"

	"github.com/thesebastianf/hlc/internal/audit"
	"github.com/thesebastianf/hlc/internal/backup"
	"github.com/thesebastianf/hlc/internal/labels"
	"github.com/thesebastianf/hlc/internal/stacks"
)

func writeHTML(w http.ResponseWriter, html string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, html)
}

func esc(s string) string { return html.EscapeString(s) }

// ── Containers ─────────────────────────────────────────────────────────────

func (s *Server) HandleContainersFragment(w http.ResponseWriter, r *http.Request) {
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeHTML(w, `<div class="badge badge-red">Failed to load containers</div>`)
		return
	}
	classified := labels.ClassifyAll(containers)
	if len(classified) == 0 {
		writeHTML(w, `<div style="color:var(--text2);padding:1rem;text-align:center">No containers found.</div>`)
		return
	}

	out := ""
	for _, c := range classified {
		stateClass := "badge-red"
		stateLabel := c.State
		switch c.State {
		case "running":
			stateClass = "badge-green"
		case "paused":
			stateClass = "badge-yellow"
		case "exited", "dead":
			stateClass, stateLabel = "badge-red", "stopped"
		}

		initials := "?"
		if len(c.Name) >= 2 {
			initials = c.Name[:2]
		} else if len(c.Name) == 1 {
			initials = c.Name[:1]
		}

		portCount := fmt.Sprintf("%d port(s)", len(c.Ports))
		if len(c.Ports) == 0 {
			portCount = "no ports"
		}

		role := c.Classification.Role
		if role == "" {
			role = "app"
		}

		out += fmt.Sprintf(`
<div class="container-row">
  <div class="container-icon">%s</div>
  <div style="flex:1;min-width:0">
    <div class="container-name">%s</div>
    <div class="container-image">%s &bull; %s &bull; %s</div>
  </div>
  <span class="badge %s" style="flex-shrink:0">%s</span>
</div>`,
			esc(initials),
			esc(c.Name),
			esc(c.Image),
			esc(portCount),
			esc(role),
			stateClass,
			esc(stateLabel),
		)
	}
	writeHTML(w, out)
}

// ── Stacks ────────────────────────────────────────────────────────────────

func (s *Server) HandleStacksFragment(w http.ResponseWriter, r *http.Request) {
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeHTML(w, `<div class="badge badge-red">Failed to load containers</div>`)
		return
	}
	list, err := stacks.ScanStacks(r.Context(), s.deps.StackOperator.BaseDir(), containers)
	if err != nil {
		writeHTML(w, fmt.Sprintf(`<div style="color:var(--text2);padding:1rem">No stacks directory found. Set HLC_STACK_DIR or mount stacks. <small>(%s)</small></div>`, esc(err.Error())))
		return
	}
	if len(list) == 0 {
		writeHTML(w, `<div style="color:var(--text2);padding:1rem;text-align:center">No stacks found in the configured directory.</div>`)
		return
	}

	out := ""
	for _, st := range list {
		statusClass := "badge-red"
		switch st.Status {
		case stacks.StackRunning:
			statusClass = "badge-green"
		case stacks.StackPartial:
			statusClass = "badge-yellow"
		case stacks.StackStopped:
			statusClass = "badge-red"
		}
		containerCount := fmt.Sprintf("%d container(s)", len(st.Containers))

		out += fmt.Sprintf(`
<div class="container-row">
  <div class="container-icon" style="font-size:.6rem;font-weight:700;color:var(--purple)">ST</div>
  <div style="flex:1;min-width:0">
    <div class="container-name">%s</div>
    <div class="container-image">%s &bull; %s</div>
  </div>
  <span class="badge %s" style="flex-shrink:0">%s</span>
  <div class="container-actions">
    <button class="btn btn-xs btn-ghost" onclick="openEditor('%s')">Edit</button>
    <button class="btn btn-xs" hx-post="/api/v1/stacks/%s/up" hx-swap="none"
      hx-on::after-request="htmx.trigger('#stacks-list','load')">Up</button>
    <button class="btn btn-xs btn-red" hx-post="/api/v1/stacks/%s/down" hx-swap="none"
      hx-on::after-request="htmx.trigger('#stacks-list','load')">Down</button>
  </div>
</div>`,
			esc(st.Name),
			esc(st.Dir),
			containerCount,
			statusClass,
			esc(string(st.Status)),
			esc(st.Name),
			esc(st.Name),
			esc(st.Name),
		)
	}
	writeHTML(w, out)
}

// ── Backups ───────────────────────────────────────────────────────────────

func (s *Server) HandleBackupsFragment(w http.ResponseWriter, r *http.Request) {
	metas, err := backup.ListAllMetadata(r.Context(), s.deps.Settings.DB(), 100)
	if err != nil {
		writeHTML(w, `<div class="badge badge-red">Failed to load backups</div>`)
		return
	}
	if len(metas) == 0 {
		writeHTML(w, `<div style="color:var(--text2);padding:1rem;text-align:center">No backups yet. Trigger a backup to see them here.</div>`)
		return
	}

	out := `<table class="data-table"><thead><tr>
  <th>Container</th><th>Strategy</th><th>Date</th><th>Archive</th><th></th>
</tr></thead><tbody>`

	for _, m := range metas {
		stratClass := "badge-blue"
		if m.Strategy == "db-dump" {
			stratClass = "badge-yellow"
		}
		restoredBadge := ""
		if m.Restored {
			restoredBadge = `<span class="badge badge-yellow" style="margin-left:.4rem">restored</span>`
		}

		out += fmt.Sprintf(`<tr>
  <td><strong>%s</strong>%s</td>
  <td><span class="badge %s">%s</span></td>
  <td style="color:var(--text2)">%s</td>
  <td style="font-family:monospace;font-size:.72rem;color:var(--text2)">%s</td>
  <td><button class="btn btn-xs btn-ghost" onclick="openRestoreModal('%s', %d)">Restore</button></td>
</tr>`,
			esc(m.ContainerName),
			restoredBadge,
			stratClass,
			esc(m.Strategy),
			esc(m.CreatedAt.Format("2006-01-02 15:04")),
			esc(m.ArchivePath),
			esc(m.ContainerName),
			m.ID,
		)
	}
	out += `</tbody></table>`
	writeHTML(w, out)
}

// ── Audit ─────────────────────────────────────────────────────────────────

func (s *Server) HandleAuditFragment(w http.ResponseWriter, r *http.Request) {
	offsetStr := r.URL.Query().Get("offset")
	offset := 0
	if offsetStr != "" {
		offset, _ = strconv.Atoi(offsetStr)
	}
	_ = offset // used below via Filter.Limit+offset logic
	cat := audit.Category(r.URL.Query().Get("category"))

	f := audit.Filter{
		Category: cat,
		Limit:    100,
	}
	entries, err := s.deps.AuditLogger.Query(r.Context(), f)
	if err != nil {
		writeHTML(w, `<div class="badge badge-red">Failed to load audit log</div>`)
		return
	}
	if len(entries) == 0 {
		writeHTML(w, `<div style="color:var(--text2);padding:1rem;text-align:center">No audit events yet.</div>`)
		return
	}

	out := ""
	for _, e := range entries {
		dotColor := "var(--accent)"
		switch string(e.Category) {
		case "backup":
			dotColor = "var(--green)"
		case "update":
			dotColor = "var(--yellow)"
		case "auth":
			dotColor = "var(--red)"
		case "mount":
			dotColor = "var(--orange)"
		}

		detail := e.Detail
		if len(detail) > 120 {
			detail = detail[:120] + "…"
		}
		target := ""
		if e.Target != "" {
			target = fmt.Sprintf(` &rarr; <code>%s</code>`, esc(e.Target))
		}

		out += fmt.Sprintf(`
<div class="timeline-item">
  <div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding-top:2px">
    <div style="width:8px;height:8px;border-radius:50%%;background:%s;flex-shrink:0"></div>
    <div style="width:1px;flex:1;background:var(--glass-border)"></div>
  </div>
  <div style="flex:1;min-width:0;padding-bottom:.6rem">
    <div style="font-size:.8rem;font-weight:500">%s%s</div>
    <div style="font-size:.72rem;color:var(--text2);margin-top:.15rem">%s</div>
    <div style="font-size:.7rem;color:var(--text3);margin-top:.15rem">%s</div>
  </div>
  <div style="font-size:.68rem;color:var(--text3);white-space:nowrap">%s</div>
</div>`,
			dotColor,
			esc(e.EventType),
			target,
			esc(detail),
			esc(string(e.Category)),
			esc(e.OccurredAt.Format("Jan 02 15:04")),
		)
	}
	writeHTML(w, out)
}

// ── Settings ──────────────────────────────────────────────────────────────

func (s *Server) HandleSettingsFragment(w http.ResponseWriter, r *http.Request) {
	all, err := s.deps.Settings.GetAll(r.Context())
	if err != nil {
		writeHTML(w, `<div class="badge badge-red">Failed to load settings</div>`)
		return
	}

	labels := map[string]string{
		"instance_name":            "Instance Name",
		"homepage_url":             "Homepage URL",
		"base_stack_path":          "Base Stack Path",
		"base_volume_path":         "Base Volume Path",
		"nas.anchor_file":          "NAS Anchor File",
		"nas.boot_timeout":         "NAS Boot Timeout (s)",
		"nas.poll_interval_boot":   "NAS Poll Interval — Boot (s)",
		"nas.poll_interval_steady": "NAS Poll Interval — Steady (s)",
	}

	// Ordered keys
	order := []string{
		"instance_name", "homepage_url",
		"base_stack_path", "base_volume_path",
		"nas.anchor_file", "nas.boot_timeout",
		"nas.poll_interval_boot", "nas.poll_interval_steady",
	}

	out := `<form id="settings-form-inner">`
	for _, key := range order {
		val := all[key]
		label, ok := labels[key]
		if !ok {
			label = key
		}
		out += fmt.Sprintf(`
<div class="toggle-row">
  <div class="toggle-info">
    <div class="toggle-label">%s</div>
    <div class="toggle-desc">%s</div>
  </div>
  <input type="text" class="form-input" style="width:240px"
    value="%s"
    onchange="saveSetting('%s', this.value)">
</div>`, esc(label), esc(key), esc(val), esc(key))
	}
	out += `</form>
<script>
function saveSetting(key, val) {
  fetch('/api/v1/settings/' + encodeURIComponent(key), {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({value: val})
  });
}
</script>`
	writeHTML(w, out)
}

// ── Policies ──────────────────────────────────────────────────────────────

func (s *Server) HandlePoliciesFragment(w http.ResponseWriter, r *http.Request) {
	policies, err := s.deps.PolicyEngine.ListPolicies(r.Context())
	if err != nil {
		writeHTML(w, `<div class="badge badge-red">Failed to load policies</div>`)
		return
	}
	if len(policies) == 0 {
		writeHTML(w, `<div style="color:var(--text2);padding:1rem">No policies configured.</div>`)
		return
	}

	out := ""
	for _, p := range policies {
		desc := map[string]string{
			"max_stability_mode": "Blocks updates, restarts, and config changes system-wide",
			"quiet_hours":        "Defers disruptive operations during configured time window",
		}[p.Name]

		onClass := ""
		if p.Enabled {
			onClass = " on"
		}

		out += fmt.Sprintf(`
<div class="toggle-row">
  <div class="toggle-info">
    <div class="toggle-label">%s</div>
    <div class="toggle-desc">%s</div>
  </div>
  <div class="toggle%s" id="policy-%s" onclick="togglePolicy('%s', %t)">
    <div class="knob"></div>
  </div>
</div>`,
			esc(p.Name),
			esc(desc),
			onClass,
			esc(p.Name),
			esc(p.Name),
			p.Enabled,
		)
	}

	out += `
<script>
function togglePolicy(name, currentlyEnabled) {
  fetch('/api/v1/policies/' + encodeURIComponent(name), {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({enabled: !currentlyEnabled})
  }).then(() => htmx.trigger('#policies-list', 'load'));
}
</script>`
	writeHTML(w, out)
}

// ── Env Hub ───────────────────────────────────────────────────────────────

func (s *Server) HandleEnvHubFragment(w http.ResponseWriter, r *http.Request) {
	list, err := s.deps.EnvStore.List(r.Context())
	if err != nil {
		writeHTML(w, `<div class="badge badge-red">Failed to load env vars</div>`)
		return
	}
	if len(list) == 0 {
		writeHTML(w, `<div style="color:var(--text2);padding:1rem;text-align:center">No global env vars set.</div>`)
		return
	}

	out := `<table class="data-table"><thead><tr>
  <th>Key</th><th>Value</th><th>Category</th><th></th>
</tr></thead><tbody>`

	for _, e := range list {
		cat := e.Category
		catClass := "badge-blue"
		switch cat {
		case "path":
			catClass = "badge-yellow"
		case "secret":
			catClass = "badge-red"
		}
		displayVal := e.Value
		if cat == "secret" && len(displayVal) > 4 {
			displayVal = displayVal[:2] + "****"
		}
		out += fmt.Sprintf(`<tr>
  <td><code style="font-size:.8rem">%s</code></td>
  <td style="font-family:monospace;font-size:.78rem">%s</td>
  <td><span class="badge %s">%s</span></td>
  <td style="text-align:right">
    <button class="btn btn-xs btn-ghost"
      hx-delete="/api/v1/env-hub/%s"
      hx-confirm="Delete %s?"
      hx-swap="none"
      hx-on::after-request="htmx.trigger('#env-list','load')">Delete</button>
  </td>
</tr>`,
			esc(e.Key),
			esc(displayVal),
			catClass,
			esc(cat),
			esc(e.Key),
			esc(e.Key),
		)
	}
	out += `</tbody></table>`
	writeHTML(w, out)
}

// ── Notification Channels ─────────────────────────────────────────────────

func (s *Server) HandleChannelsFragment(w http.ResponseWriter, r *http.Request) {
	db := s.deps.Settings.DB()
	rows, err := db.QueryContext(r.Context(),
		`SELECT id, type, name, enabled, min_level FROM notification_channels ORDER BY id`)
	if err != nil {
		writeHTML(w, `<div class="badge badge-red">Failed to load channels</div>`)
		return
	}
	defer rows.Close()

	type ch struct {
		ID       int64
		Type     string
		Name     string
		Enabled  bool
		MinLevel string
	}
	var channels []ch
	for rows.Next() {
		var c ch
		if err := rows.Scan(&c.ID, &c.Type, &c.Name, &c.Enabled, &c.MinLevel); err != nil {
			continue
		}
		channels = append(channels, c)
	}

	if len(channels) == 0 {
		writeHTML(w, `<div style="color:var(--text2);padding:1rem;text-align:center">No channels configured. Add one to receive notifications.</div>`)
		return
	}

	out := `<table class="data-table"><thead><tr>
  <th>Name</th><th>Type</th><th>Status</th><th>Min Level</th><th></th>
</tr></thead><tbody>`

	for _, c := range channels {
		enabledBadge := `<span class="badge badge-green">enabled</span>`
		if !c.Enabled {
			enabledBadge = `<span class="badge badge-red">disabled</span>`
		}
		out += fmt.Sprintf(`<tr>
  <td><strong>%s</strong></td>
  <td><span class="badge badge-blue">%s</span></td>
  <td>%s</td>
  <td style="color:var(--text2)">%s</td>
  <td style="text-align:right;display:flex;gap:.3rem;justify-content:flex-end">
    <button class="btn btn-xs btn-ghost"
      hx-post="/api/v1/notifications/channels/%d/test"
      hx-swap="none">Test</button>
    <button class="btn btn-xs btn-red"
      hx-delete="/api/v1/notifications/channels/%d"
      hx-confirm="Delete channel %s?"
      hx-swap="none"
      hx-on::after-request="htmx.trigger('#channels-list','load')">Delete</button>
  </td>
</tr>`,
			esc(c.Name),
			esc(c.Type),
			enabledBadge,
			esc(c.MinLevel),
			c.ID,
			c.ID,
			esc(c.Name),
		)
	}
	out += `</tbody></table>`
	writeHTML(w, out)
}

// ── Notification History ──────────────────────────────────────────────────

func (s *Server) HandleNotificationHistoryFragment(w http.ResponseWriter, r *http.Request) {
	db := s.deps.Settings.DB()
	rows, err := db.QueryContext(r.Context(),
		`SELECT event_type, success, error_message, sent_at FROM notification_log ORDER BY sent_at DESC LIMIT 50`)
	if err != nil {
		writeHTML(w, `<div class="badge badge-red">Failed to load history</div>`)
		return
	}
	defer rows.Close()

	type entry struct {
		EventType    string
		Success      bool
		ErrorMessage string
		SentAt       string
	}
	var entries []entry
	for rows.Next() {
		var e entry
		var errMsg *string
		if err := rows.Scan(&e.EventType, &e.Success, &errMsg, &e.SentAt); err != nil {
			continue
		}
		if errMsg != nil {
			e.ErrorMessage = *errMsg
		}
		entries = append(entries, e)
	}

	if len(entries) == 0 {
		writeHTML(w, `<div style="color:var(--text2);padding:1rem;text-align:center">No notification history yet.</div>`)
		return
	}

	out := `<table class="data-table"><thead><tr>
  <th>Event</th><th>Status</th><th>Error</th><th>Time</th>
</tr></thead><tbody>`

	for _, e := range entries {
		statusBadge := `<span class="badge badge-green">ok</span>`
		if !e.Success {
			statusBadge = `<span class="badge badge-red">failed</span>`
		}
		errCell := `<span style="color:var(--text3)">—</span>`
		if e.ErrorMessage != "" {
			errCell = fmt.Sprintf(`<span style="color:var(--red);font-size:.72rem">%s</span>`, esc(e.ErrorMessage))
		}

		ts := e.SentAt
		if t, err := time.Parse(time.RFC3339, e.SentAt); err == nil {
			ts = t.Format("Jan 02 15:04")
		}

		out += fmt.Sprintf(`<tr>
  <td>%s</td>
  <td>%s</td>
  <td>%s</td>
  <td style="color:var(--text2)">%s</td>
</tr>`, esc(e.EventType), statusBadge, errCell, esc(ts))
	}
	out += `</tbody></table>`
	writeHTML(w, out)
}
