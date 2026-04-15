package labels

import (
	"testing"
)

func TestParse_Defaults(t *testing.T) {
	c := Parse(map[string]string{})
	if c.Role != "app" {
		t.Errorf("default role: expected app, got %q", c.Role)
	}
	if c.UpdatePolicy != "manual" {
		t.Errorf("default update policy: expected manual, got %q", c.UpdatePolicy)
	}
	if c.BackupStrategy != "none" {
		t.Errorf("default backup strategy: expected none, got %q", c.BackupStrategy)
	}
	if c.Priority != "normal" {
		t.Errorf("default priority: expected normal, got %q", c.Priority)
	}
	if c.StartupOrder != 50 {
		t.Errorf("default startup order: expected 50, got %d", c.StartupOrder)
	}
}

func TestParse_AllFields(t *testing.T) {
	labels := map[string]string{
		"hlc.role":              "db",
		"hlc.update.policy":    "auto",
		"hlc.update.schedule":  "0 2 * * *",
		"hlc.backup.strategy":  "db-dump",
		"hlc.backup.stop":      "true",
		"hlc.backup.db-type":   "postgres",
		"hlc.stack":            "infra-stack",
		"hlc.priority":         "critical",
		"hlc.wait_for_mount":   "/mnt/nas/data, /mnt/nas/config",
		"hlc.startup.order":    "10",
		"hlc.homepage.url":     "http://pgadmin.local:5050",
		"com.docker.compose.service": "db", // non-hlc label, should be ignored
	}
	c := Parse(labels)

	if c.Role != "db" {
		t.Errorf("role: got %q", c.Role)
	}
	if c.UpdatePolicy != "auto" {
		t.Errorf("update policy: got %q", c.UpdatePolicy)
	}
	if c.UpdateSchedule != "0 2 * * *" {
		t.Errorf("update schedule: got %q", c.UpdateSchedule)
	}
	if c.BackupStrategy != "db-dump" {
		t.Errorf("backup strategy: got %q", c.BackupStrategy)
	}
	if !c.BackupStop {
		t.Error("backup stop should be true")
	}
	if c.DBType != "postgres" {
		t.Errorf("db type: got %q", c.DBType)
	}
	if c.Stack != "infra-stack" {
		t.Errorf("stack: got %q", c.Stack)
	}
	if c.Priority != "critical" {
		t.Errorf("priority: got %q", c.Priority)
	}
	if len(c.WaitForMounts) != 2 {
		t.Errorf("wait_for_mounts: expected 2, got %d", len(c.WaitForMounts))
	}
	if c.WaitForMounts[0] != "/mnt/nas/data" {
		t.Errorf("mount[0]: got %q", c.WaitForMounts[0])
	}
	if c.StartupOrder != 10 {
		t.Errorf("startup order: expected 10, got %d", c.StartupOrder)
	}
	if c.HomepageURL != "http://pgadmin.local:5050" {
		t.Errorf("homepage url: got %q", c.HomepageURL)
	}
	// Non-hlc label should not appear in RawLabels.
	if _, ok := c.RawLabels["com.docker.compose.service"]; ok {
		t.Error("non-hlc label should not appear in RawLabels")
	}
}

func TestParse_SingleMount(t *testing.T) {
	c := Parse(map[string]string{"hlc.wait_for_mount": "/mnt/nas"})
	if len(c.WaitForMounts) != 1 || c.WaitForMounts[0] != "/mnt/nas" {
		t.Errorf("single mount: got %v", c.WaitForMounts)
	}
}

func TestValidate_Warnings(t *testing.T) {
	c := Parse(map[string]string{
		"hlc.backup.strategy": "db-dump",
		// Missing hlc.backup.db-type
	})
	warnings := c.Validate()
	if len(warnings) == 0 {
		t.Error("expected warning for missing db-type with db-dump strategy")
	}
}

func TestValidate_InvalidRole(t *testing.T) {
	c := ContainerClassification{
		Role:           "invalid_role",
		UpdatePolicy:   "manual",
		BackupStrategy: "none",
		Priority:       "normal",
	}
	warnings := c.Validate()
	found := false
	for _, w := range warnings {
		if len(w) > 0 {
			found = true
		}
	}
	if !found {
		t.Error("expected warning for invalid role")
	}
}

func TestClassifier_GroupByStack(t *testing.T) {
	classified := ClassifyAll(nil)
	groups := GroupByStack(classified)
	if len(groups) != 0 {
		t.Errorf("expected empty groups for nil input, got %d", len(groups))
	}
}

func TestSortByStartupOrder(t *testing.T) {
	classified := []ClassifiedContainer{
		{Classification: ContainerClassification{StartupOrder: 30}},
		{Classification: ContainerClassification{StartupOrder: 10}},
		{Classification: ContainerClassification{StartupOrder: 20}},
	}
	sorted := SortByStartupOrder(classified)
	if sorted[0].Classification.StartupOrder != 10 {
		t.Errorf("expected order 10 first, got %d", sorted[0].Classification.StartupOrder)
	}
	if sorted[2].Classification.StartupOrder != 30 {
		t.Errorf("expected order 30 last, got %d", sorted[2].Classification.StartupOrder)
	}
}

func TestFilterNASDependent(t *testing.T) {
	classified := []ClassifiedContainer{
		{Classification: ContainerClassification{WaitForMounts: []string{"/mnt/nas"}}},
		{Classification: ContainerClassification{}},
	}
	filtered := FilterNASDependent(classified)
	if len(filtered) != 1 {
		t.Errorf("expected 1 NAS-dependent, got %d", len(filtered))
	}
}
