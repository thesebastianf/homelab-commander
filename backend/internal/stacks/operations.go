package stacks

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/thesebastianf/hlc/internal/core"
	"github.com/thesebastianf/hlc/internal/docker"
	"github.com/thesebastianf/hlc/internal/envhub"
)

// Operator performs stack-level operations using docker compose CLI.
type Operator struct {
	baseDir     string
	dockerClient *docker.Client
	envInjector *envhub.Injector
	eventBus    core.EventBus
	policyEngine core.PolicyEngine
}

// NewOperator creates a new Operator.
func NewOperator(baseDir string, dc *docker.Client, inj *envhub.Injector, bus core.EventBus, pe core.PolicyEngine) *Operator {
	return &Operator{
		baseDir:      baseDir,
		dockerClient: dc,
		envInjector:  inj,
		eventBus:     bus,
		policyEngine: pe,
	}
}

// BaseDir returns the configured base directory.
func (o *Operator) BaseDir() string { return o.baseDir }

// Up starts a stack. Checks policy, injects env, then runs docker compose up -d.
func (o *Operator) Up(ctx context.Context, stackName string) error {
	if err := o.checkPolicy(ctx, "restart"); err != nil {
		return err
	}
	stackDir, err := o.stackDir(stackName)
	if err != nil {
		return err
	}
	if o.envInjector != nil {
		_ = o.envInjector.InjectIntoStack(ctx, stackDir, false)
	}
	if _, err := runCompose(ctx, stackDir, "up", "-d"); err != nil {
		return fmt.Errorf("stack up %s: %w", stackName, err)
	}
	o.publish(ctx, core.StackStarted, stackName)
	return nil
}

// Down stops a stack.
func (o *Operator) Down(ctx context.Context, stackName string) error {
	stackDir, err := o.stackDir(stackName)
	if err != nil {
		return err
	}
	if _, err := runCompose(ctx, stackDir, "down"); err != nil {
		return fmt.Errorf("stack down %s: %w", stackName, err)
	}
	o.publish(ctx, core.StackStopped, stackName)
	return nil
}

// Restart restarts a stack.
func (o *Operator) Restart(ctx context.Context, stackName string) error {
	if err := o.checkPolicy(ctx, "restart"); err != nil {
		return err
	}
	stackDir, err := o.stackDir(stackName)
	if err != nil {
		return err
	}
	if _, err := runCompose(ctx, stackDir, "restart"); err != nil {
		return fmt.Errorf("stack restart %s: %w", stackName, err)
	}
	o.publish(ctx, core.StackRestarted, stackName)
	return nil
}

// Pull pulls latest images for all services.
func (o *Operator) Pull(ctx context.Context, stackName string) error {
	stackDir, err := o.stackDir(stackName)
	if err != nil {
		return err
	}
	if _, err := runCompose(ctx, stackDir, "pull"); err != nil {
		return fmt.Errorf("stack pull %s: %w", stackName, err)
	}
	return nil
}

// Logs returns the last N lines from docker compose logs.
func (o *Operator) Logs(ctx context.Context, stackName string, tail int) (string, error) {
	stackDir, err := o.stackDir(stackName)
	if err != nil {
		return "", err
	}
	tailArg := fmt.Sprintf("--tail=%d", tail)
	out, err := runCompose(ctx, stackDir, "logs", "--no-color", tailArg)
	if err != nil {
		return "", fmt.Errorf("stack logs %s: %w", stackName, err)
	}
	return out, nil
}

// ReadCompose returns the raw compose YAML for a stack.
func (o *Operator) ReadCompose(ctx context.Context, stackName string) (string, error) {
	stackDir, err := o.stackDir(stackName)
	if err != nil {
		return "", err
	}
	composePath, found := findComposeFile(stackDir)
	if !found {
		return "", fmt.Errorf("stack %s: compose file not found", stackName)
	}
	return ReadCompose(composePath)
}

// WriteCompose saves raw compose YAML for a stack (validates first).
func (o *Operator) WriteCompose(ctx context.Context, stackName, content string) error {
	if err := ValidateCompose(content); err != nil {
		return fmt.Errorf("validate compose %s: %w", stackName, err)
	}
	stackDir, err := o.stackDir(stackName)
	if err != nil {
		return err
	}
	composePath, found := findComposeFile(stackDir)
	if !found {
		composePath = filepath.Join(stackDir, "docker-compose.yml")
	}
	return WriteCompose(composePath, content)
}

// CreateStack creates a new stack directory with the given compose content.
func (o *Operator) CreateStack(ctx context.Context, name, composeContent string) error {
	if err := ValidateCompose(composeContent); err != nil {
		return fmt.Errorf("validate compose: %w", err)
	}
	stackDir := filepath.Join(o.baseDir, name)
	if err := os.MkdirAll(stackDir, 0o755); err != nil {
		return fmt.Errorf("create stack dir %s: %w", name, err)
	}
	composePath := filepath.Join(stackDir, "docker-compose.yml")
	return os.WriteFile(composePath, []byte(composeContent), 0o644)
}

// DeleteStack stops and removes a stack's compose directory.
func (o *Operator) DeleteStack(ctx context.Context, stackName string) error {
	stackDir, err := o.stackDir(stackName)
	if err != nil {
		return err
	}
	// Attempt stop — ignore errors (might already be stopped).
	_, _ = runCompose(ctx, stackDir, "down")
	return os.RemoveAll(stackDir)
}

// stackDir returns the absolute path to a stack directory or error if not found.
func (o *Operator) stackDir(stackName string) (string, error) {
	stackDir := filepath.Join(o.baseDir, stackName)
	if _, err := os.Stat(stackDir); err != nil {
		return "", fmt.Errorf("stack %q not found: %w", stackName, err)
	}
	return stackDir, nil
}

// checkPolicy returns an error if the policy engine blocks the action.
func (o *Operator) checkPolicy(ctx context.Context, action string) error {
	if o.policyEngine == nil {
		return nil
	}
	result, err := o.policyEngine.Evaluate(ctx, action, "stack")
	if err != nil {
		return err
	}
	if result == core.ActionBlock {
		return fmt.Errorf("action %q blocked by policy (MSM active)", action)
	}
	return nil
}

func (o *Operator) publish(ctx context.Context, evtType core.EventType, stackName string) {
	if o.eventBus != nil {
		o.eventBus.Publish(ctx, core.Event{
			Type:    evtType,
			Source:  stackName,
			Payload: map[string]string{"stack": stackName},
		})
	}
}

// RunCompose shells out to docker compose in the given project directory.
// This is the ONLY place in HLC where we shell out — all other Docker
// interaction uses the socket API.
func RunCompose(ctx context.Context, projectDir string, args ...string) (string, error) {
	return runCompose(ctx, projectDir, args...)
}

func runCompose(ctx context.Context, projectDir string, args ...string) (string, error) {
	cmdArgs := append([]string{"compose"}, args...)
	cmd := exec.CommandContext(ctx, "docker", cmdArgs...)
	cmd.Dir = projectDir

	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("docker compose %s: %w: %s", strings.Join(args, " "), err, out)
	}
	return string(out), nil
}
