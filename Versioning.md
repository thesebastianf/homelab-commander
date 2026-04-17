# Versioning — Homelab Commander

## Kapitel 1: Aktuelle Implementierung

### Was wird versioniert?

Ausschließlich **compose-Inhalt** (`compose.yml`) und **Env-Inhalt** (`.env`) eines Stacks. Alle anderen Dateien im Stack-Ordner (z.B. Homepage-YAMLs, Caddy `.conf`, benutzerdefinierte Konfigurationsdateien) werden **nicht** versioniert.

### Wo werden Versionen gespeichert?

Ausschließlich in der **PostgreSQL-Datenbank** in der Tabelle `stack_versions`. Es gibt **keine Unterordner** auf der Festplatte für alte Versionen. Der Stack-Ordner enthält immer nur den aktuellen Stand.

### Tabellenstruktur `stack_versions`

```sql
CREATE TABLE stack_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stack_id       UUID NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,           -- monoton steigend je Stack
  compose_content TEXT NOT NULL,             -- Inhalt der docker-compose.yml
  env_content     TEXT DEFAULT '',           -- Inhalt der .env
  description     TEXT DEFAULT '',           -- z.B. "Initial version", "Updated", "Restored from v3"
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Wann wird eine neue Version erzeugt?

| Aktion | Neue Version? |
|--------|--------------|
| Stack erstellen (`POST /stacks`) | ✓ Version 1 |
| compose.yml speichern (`PUT /stacks/:id` mit `composeContent`) | ✓ Version n+1 |
| Nur `.env` speichern (`PUT /stacks/:id` mit `envContent` ohne `composeContent`) | ✓ Version n+1 ("Updated .env") |
| Datei-Editor für andere Dateien (`PUT /stacks/:id/file`) | ✗ Keine Version |
| Stack deployen / starten / stoppen | ✗ Keine Version |
| Version wiederherstellen (`POST /stacks/:id/restore/:version`) | ✓ Neue Version ("Restored from vX") |

### Versionsnummern

Monoton steigende Integer (`version = version + 1`) je Stack, gespeichert in `stacks.version`. Die aktuell angezeigte Version im Editor entspricht `stacks.version`.

**Limit:** Maximal 10 Versionen pro Stack. Bei jedem neuen INSERT wird automatisch bereinigt — ältere Versionen (außer den neuesten 10) werden gelöscht.

### Restore

`POST /stacks/:id/restore/:version`  
- Überschreibt `compose.yml` und `.env` auf der Festplatte  
- Aktualisiert `stacks.compose_content` und `stacks.env_content` in der DB  
- Erstellt eine neue Version mit der Beschreibung `Restored from vX`

### API

| Endpoint | Beschreibung |
|----------|-------------|
| `GET /stacks/:id` | Gibt Stack + letzte 10 Versionen zurück |
| `GET /stacks/:id/versions` | Gibt die letzten 10 Versionen zurück |
| `POST /stacks/:id/restore/:version` | Stellt eine bestimmte Version wieder her |

### Aktuelle Lücken

1. ~~**`.env`-only-Saves** erzeugen keine Version.~~ → **Behoben**: `.env`-only-Saves erzeugen jetzt eine Version ("Updated .env").
2. **Andere Dateien** (`.conf`, Homepage-YAMLs, etc.) werden gar nicht versioniert — bleibt als bekannte Einschränkung bestehen.
3. ~~**Keine automatische Bereinigung** alter Versionen.~~ → **Behoben**: Maximal 10 Versionen pro Stack werden behalten.
4. ~~**Kein Diff in der UI**.~~ → **Behoben**: Der Compare-Tab im Stack-Editor zeigt einen zeilenweisen Diff (grün = hinzugefügt, rot = entfernt).
5. ~~**Kein Limit** für die Anzahl der Versionen.~~ → **Behoben**: Limit 10 Versionen pro Stack.

---

## Kapitel 2: Konzept für Refactoring der Implementierung

### Ziel

Eine vollständige, zuverlässige Versionierung **aller Dateien** im Stack-Ordner — nicht nur `compose.yml` und `.env`.

---

### Option A: Git-basierte Versionierung (Empfehlung)

**Idee:** Jeder Stack-Ordner wird als Git-Repository initialisiert. Bei jedem Speichern wird ein automatischer Commit erstellt.

#### Ablauf

```
/data/stacks/mystack/
  .git/              ← automatisch initialisiert
  docker-compose.yml
  .env
  config/
    homepage.yaml
    Caddyfile
```

1. Stack erstellen → `git init`, erster Commit: `"Initial: mystack"`
2. Datei speichern → `git add -A && git commit -m "Edit: compose.yml via THC [2024-04-17 07:00]"`
3. Version anzeigen → `git log --oneline`
4. Version wiederherstellen → `git checkout <hash> -- docker-compose.yml`
5. Optional: `git push` zu GitHub/Gitea für Remote-Backup

#### Vorteile

- Alle Dateien versioniert, ohne Datenbankschema-Änderungen
- Standardwerkzeug, bestens bekannt
- Diff zwischen beliebigen Versionen (`git diff <hash1> <hash2>`)
- Integration mit dem bereits vorhandenen Git-Sync-Feature
- Remote-Backup kostenlos durch `git push`

#### Nachteile

- Git muss auf dem Host installiert sein
- `.env`-Inhalte (Passwörter) im Remote-Repo nur mit Vorsicht (`.gitignore` oder Verschlüsselung)
- Komplexeres Backend (Git-Operationen statt SQL-INSERTs)

#### `.gitignore` für Stacks

```gitignore
# Secrets bleiben lokal — nicht pushen!
.env
*.secret
*.key
```

---

### Option B: Erweitertes DB-Versionssystem

**Idee:** Die bestehende `stack_versions`-Tabelle wird um ein `files`-JSONB-Feld erweitert, das alle editierten Dateien enthält.

#### Schema-Erweiterung

```sql
ALTER TABLE stack_versions
  ADD COLUMN files JSONB DEFAULT '{}'::jsonb;
-- files = { "docker-compose.yml": "...", ".env": "...", "config/homepage.yaml": "..." }
```

#### Wann wird eine Version erzeugt?

Bei **jedem** Speichern — egal ob `compose.yml`, `.env` oder eine andere Datei.

#### Vorteile

- Keine externe Abhängigkeit (kein Git)
- Alle Dateien in der Datenbank
- Einfache Restore-Logik (DB-Query)

#### Nachteile

- Kein echter Diff (muss selbst implementiert werden)
- DB wächst schnell bei großen Stack-Ordnern
- Kein Remote-Backup out-of-the-box

---

### Option C: Filesystem-Snapshots (einfachstes Refactoring)

**Idee:** Bei jedem Speichern wird ein Snapshot des gesamten Stack-Ordners in einem `versions/`-Unterordner erstellt.

```
/data/stacks/mystack/
  versions/
    2024-04-17T07-00-00/
      docker-compose.yml
      .env
      config/homepage.yaml
    2024-04-14T13-30-00/
      ...
  docker-compose.yml      ← aktueller Stand
  .env
  config/homepage.yaml
```

#### Vorteile

- Sehr einfache Implementierung (`cp -r`)
- Alle Dateien versioniert
- Restore: einfaches Kopieren zurück

#### Nachteile

- Hoher Speicherverbrauch (jedes Mal alle Dateien)
- Keine Diff-Funktionalität
- Kein Remote-Backup

---

### Empfehlung: Option A (Git) + Kurzfristig Option B

**Kurzfristig (einfaches Refactoring der aktuellen Implementierung):**

1. Lücke schließen: `.env`-only-Saves auch versionieren
2. `files`-JSONB zu `stack_versions` hinzufügen (Option B)
3. Beim Speichern einer beliebigen Datei eine neue Version erstellen

**Mittelfristig:**

1. Git-Integration pro Stack-Ordner aktivieren (Option A)
2. Automatische Commits bei jedem Save
3. `.env` per `.gitignore` vom Remote-Push ausschließen
4. UI: Diff-Ansicht zwischen zwei Versionen (z.B. mit `diff2html`)

---

### Implementierungsschritte (mittelfristiges Refactoring)

| Schritt | Was | Priorität |
|---------|-----|-----------|
| 1 | `.env`-only-Saves versionieren | Hoch |
| 2 | `files JSONB` zu `stack_versions` | Hoch |
| 3 | Automatisches Cleanup (max 50 Versionen) | Mittel |
| 4 | Git-Init pro Stack-Ordner | Mittel |
| 5 | Diff-UI im Editor (compare panel) | Mittel |
| 6 | `.gitignore` für Secrets | Hoch (wenn Git aktiv) |
| 7 | Remote-Push zu GitHub über Git-Integration | Niedrig |
