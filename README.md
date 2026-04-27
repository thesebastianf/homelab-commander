<p align="center">
  <img src="thc_large_.png" alt="The Homelab Commander" width="180" />
</p>

<h1 align="center">The Homelab Commander</h1>
<p align="center"><strong>A self-hosted command center for Docker-powered homelabs.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Beta-orange" alt="Status Beta" />
  <img src="https://img.shields.io/badge/Stack-React%20%2B%20Node%20%2B%20PostgreSQL-blue" alt="Stack" />
  <img src="https://img.shields.io/badge/Runtime-Docker-2496ED" alt="Docker" />
  <img src="https://img.shields.io/badge/License-Apache--2.0-green" alt="Apache 2.0 License" />
</p>

The Homelab Commander gives you one place to run your Docker infrastructure with confidence.

It combines day-to-day container operations, stack lifecycle tooling, backups, update workflows, Smart Startup dependencies, and AI-assisted compose workflows in a single dashboard.

## Support This Project

If The Homelab Commander helps your homelab, you can support ongoing development on Ko-fi:

- Ko-fi: https://ko-fi.com/thesebastianf
- Username: thesebastianf

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Q5Q11YKFB9)

## Highlights

- Docker inventory for containers, images, volumes, and networks
- Stack lifecycle actions: deploy, stop, deactivate, restart, recreate, update
- Stack editor with version history and diff/restore support
- Built-in backup jobs with retention policies
- Smart Startup dependency automation
- Notification services (Telegram, Discord, Slack, email, webhook)
- Optional AI compose assistant with secret-aware redaction logic
- Port conflict visibility and reservation tooling

## Visual Tour

### Main Dashboard
![Main Dashboard](01_Dashboard.jpg)

### Stack Editor
![Stacks Editor](02_Stacks_Editor.jpg)

### Backup Management
![Backups](03_Backups.jpg)

### Port Conflict Detection
![Port Conflicts](04_Port_Conflicts.jpg)

### Smart Startup
![Smart Startup](05_Smart_Startup.jpg)

### Notifications
![Notifications](06_Notifications.jpg)

### Updates and Scheduling
![Updates](07_Updates.jpg)

### Integrations
![Integrations](08_Integrations.jpg)

### AI Assistant
![AI Assist](09_AI_assist.jpg)

### Compact / Small Screen UX
![Small Screen UX](10_Small_Screen_UX.jpg)

## Compose Files And Startup (Current)

- `docker-compose.yml`: current primary compose file in this repository
- `.env.example`: template for all required and optional environment variables
- `.env`: your local runtime configuration (never commit real secrets)

### 1. Clone

```bash
git clone https://github.com/thesebastianf/homelab-commander.git
cd homelab-commander
```

### 2. Create `.env`

```bash
cp .env.example .env
```

### 3. Configure Minimum Variables

Edit `.env` and set at minimum:

- `POSTGRES_PASSWORD`
- `STACKS_PATH` and `BACKUPS_PATH` as absolute host paths
- `AUTH_USER` and `AUTH_PASS` for login protection
- `CORS_ORIGIN` if you are serving UI/API from different origins

### 4. Start the Stack

```bash
docker compose up -d --build
```

Open the UI at:

- http://localhost:3210 or http://your_homelab_ip:3210

### 5. Verify Health

```bash
docker compose ps
docker compose logs -f app
```

## Development

- Frontend dev server: `http://localhost:5173`
- App URL in containerized mode: `http://localhost:3210`
- Full dev stack: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`

## Mobile/Compact View Links (Forced Mode; Auto Detection built-in)

- Compact stacks: `http://localhost:3210/?mobile=1&tab=stacks`
- Compact dashboard: `http://localhost:3210/?mobile=1&tab=dashboard`
- Force desktop view: `http://localhost:3210/?mobile=0&tab=stacks`

## Release And Operations Notes

- Stack actions now publish notifications for success/failure events.
- Self-update handling uses a detached helper container handoff to avoid the app going permanently offline while updating its own compose project.
- Docker socket access is required for stack management and is a privileged trust boundary.

## Repository Highlights

- Backend source: `backend/src`
- Frontend source: `frontend/src`
- Database schema: `db/init.sql`
- Production compose: `docker-compose.yml`
- Optional examples: `docker-compose.yaml.example`, `docker-compose.yaml.homelab`
- Extended docs: `gitignored/DOCUMENTATION.md`, `gitignored/ARCHITECTURE.md`

## License

Apache License 2.0. See [LICENSE](LICENSE).


## 🛡️ Legal & Security

### License
This project is licensed under the **Apache License 2.0**. It is free for personal and commercial use, provided that the copyright notice and permission notice are included in all copies or substantial portions of the software.

### ⚠️ Liability Disclaimer
**IMPORTANT:** This software is a management tool for Docker infrastructure. By using this software, you acknowledge that:
* **"AS IS" Basis:** This software is provided without warranties of any kind. The authors are not responsible for any data loss, system downtime, or hardware damage.
* **High Privilege:** This app requires access to the Docker socket (`docker.sock`). Improper configuration can grant container users root-level access to your host system.
* **No Professional Advice:** Documentation provided is for educational purposes and does not constitute professional systems administration advice.

### 🔒 Security Recommendations
To maintain a secure homelab environment:
1. **No Direct Exposure:** Never expose this app's port directly to the internet. Use a VPN or a Reverse Proxy with MFA.
2. **Backups:** Always maintain external backups of your Docker volumes before performing bulk operations with this tool.

## 🛡️ Summary
- This project is released under Apache License 2.0. Keep copyright notices and include the full Apache-2.0 license text in redistributions.
- The application requires access to `/var/run/docker.sock` to manage Docker resources. This grants high host-level control; only deploy in trusted environments.
- Never expose this app directly to the public internet without authentication, TLS, and network controls.
- Do not commit real secrets (`.env`, API keys, access tokens, webhook URLs) to Git. Use environment variables and secret management where possible.
- Git integration can sync stack files including `.env`; use private repositories and avoid plaintext secret storage.
- AI integrations should be treated as data egress boundaries. Validate provider settings and do not forward sensitive compose/env content to untrusted remote models.
- This software is provided "AS IS", without warranties or conditions of any kind, as described in Apache-2.0.