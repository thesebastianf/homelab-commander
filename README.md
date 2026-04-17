<p align="center">
  <img src="thc_large_.png" alt="The Homelab Commander" width="180" />
</p>

<h1 align="center">The Homelab Commander</h1>
<p align="center"><strong>A self-hosted command center for Docker-powered homelabs.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Beta-orange" alt="Status Beta" />
  <img src="https://img.shields.io/badge/Stack-React%20%2B%20Node%20%2B%20PostgreSQL-blue" alt="Stack" />
  <img src="https://img.shields.io/badge/Runtime-Docker-2496ED" alt="Docker" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

The Homelab Commander gives you one place to run your container infrastructure with confidence.

It combines day to day Docker operations, stack lifecycle tooling, backup automation, Smart Startup dependencies, update controls, and AI-assisted compose workflows into one fast dashboard built for operators who prefer direct control over abstraction.

## Why People Use It

- Single pane control for containers, images, volumes, networks, and compose stacks
- Real operational workflows: run, stop, restart, inspect, compare, back up, recover
- Backup and retention strategy built into stack management
- Smart Startup automation for dependency aware stack startup
- Optional AI compose generation and review, with secret aware redaction rules
- Git integration for stack repositories and change workflows
- Notification and monitoring integrations for production style homelab operations

## Core Features

### Container and Stack Operations
- Live Docker inventory with status and quick actions
- Integrated compose stack editor with version history and compare tools
- External compose project discovery
- Pull and redeploy update flow for stack images

### Backup and Recovery
- Stack backup policies per project
- Full stack folder backup support
- Attached volume backup support
- Database backup support for common stack databases
- Configurable retention and manual run-now operations

### Smart Startup
- Trigger stack start when monitored devices become available
- Adjustable check interval and start delay
- Device availability tracking in UI

### AI Compose Assistant
- Generate compose files from plain-language requirements
- Validate existing compose for errors and operational risks
- Provider support for local and hosted models
- Redaction-first handling for remote providers

### Integrations and Operations
- Notification services management
- Home Assistant integration
- Port registry and conflict visibility
- Global update freeze and scheduled auto update window

## Visual Tour

### Main Dashboard
![Dashboard](SVGmocks/01-Dashboard.svg)

### Stack Editor: Compose
![Stack Editor Compose](SVGmocks/11a-StackEditor-Compose.svg)

### Stack Editor: Environment and AI
![Stack Editor Env AI](SVGmocks/11b-StackEditor-Env-AI.svg)

### Backup Workflows
![Backup Stack Backups](SVGmocks/12a-Backup-StackBackups.svg)
![Backup Settings](SVGmocks/12b-Backup-Settings.svg)

### Smart Startup
![Smart Startup Dialog](SVGmocks/13-Smart-Startup-Dialog.svg)

### Settings and Integrations
![Settings Integrations](SVGmocks/07c-Settings-Integrations.svg)

## Production Quick Start

### 1. Clone

```bash
git clone https://github.com/thesebastianf/homelab-commander.git
cd homelab-commander
```

### 2. Create Production Files From Examples

```bash
cp .env.example .env
cp docker-compose.yaml.example docker-compose.yaml
```

### 3. Configure Environment

Edit .env and set at minimum:
- POSTGRES_PASSWORD
- AUTH_USER and AUTH_PASS (recommended)
- Optional SEED values for first boot defaults

### 4. Start the Stack

```bash
docker compose -f docker-compose.yaml up -d
```

Open the UI at:
- http://localhost:3210

### Image Channels

- Stable (main): `:latest`
- Beta (beta branch): `:beta`

Switch channels by changing image lines in [docker-compose.yaml.example](docker-compose.yaml.example) before saving your `docker-compose.yaml`.

## Dev Machine Notes

- Local dev compose files are intentionally ignored by git:
  - `docker-compose.yml`
  - `docker-compose.dev.yml`
- Keep these for local development workflows only.

## GitHub Actions: Next Steps

1. Push the workflow and root Dockerfile to GitHub.
2. In repository settings, ensure GitHub Actions has permission to read/write packages.
3. Push to `beta` to publish beta images (`:beta`, `:sha-...`).
4. Push/merge to `main` to publish stable images (`:latest`, `:main`, `:sha-...`).
5. Confirm published images in GHCR:
   - `ghcr.io/thesebastianf/homelab-commander-backend`
   - `ghcr.io/thesebastianf/homelab-commander-frontend`

## Service Layout

- Frontend: React + Vite, served by NGINX
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL 16

## Security Notes

- Use strong credentials in .env
- Keep repository private if syncing sensitive stack files
- Review AI provider configuration before enabling hosted providers
- For remote AI providers, compose/env redaction is enforced by backend logic

## Repository Highlights

- Documentation: DOCUMENTATION.md
- Architecture: ARCHITECTURE.md
- Production compose example: docker-compose.yaml.example
- Backend source: backend/src
- Frontend source: frontend/src
- UI mocks/screens: SVGmocks

## Roadmap Direction

Current beta focus:
- hardening Smart Startup and backup edge cases
- quality of life improvements in stack editor workflows
- richer observability and reporting
- expanded AI-assisted ops with strict safety defaults

## License

MIT
