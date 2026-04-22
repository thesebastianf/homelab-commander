# gethomepage Widget Configuration

This document explains how to connect Homelab Commander to gethomepage so the dashboard widget can fetch live data.

## Requirements

- gethomepage running and reachable from the Homelab Commander frontend/browser
- Homelab Commander settings access
- API key generated in gethomepage (if your homepage setup requires auth)

## Configure in Homelab Commander

1. Open Settings -> Integrations.
2. Find the gethomepage section.
3. Enable the widget.
4. Fill in:
   - Base URL: the gethomepage URL (example: `http://homepage.local:3000`)
   - API Key: your gethomepage API token
   - Service Name: label shown in widget tiles (default: `Homelab Commander`)
5. Choose which sections to display:
   - containers, stacks, images, volumes, networks
   - cpu, memory, disk
   - updates
6. Save settings.

## Example Configuration Payload

```json
{
  "enabled": true,
  "baseUrl": "http://homepage.local:3000",
  "apiKey": "YOUR_API_KEY",
  "serviceName": "Homelab Commander",
  "show": {
    "containers": true,
    "stacks": true,
    "images": true,
    "volumes": true,
    "networks": true,
    "cpu": true,
    "memory": true,
    "disk": true,
    "updates": true
  }
}
```

## Troubleshooting

- Empty widget data:
  - verify Base URL is reachable from the browser
  - verify API key is valid
  - check browser developer tools for failed network requests
- CORS/auth errors:
  - ensure gethomepage allows requests from your dashboard origin
  - confirm token format expected by your homepage deployment
- Inconsistent counts:
  - wait for next poll interval or trigger a manual refresh in Homelab Commander
