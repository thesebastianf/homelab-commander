#!/bin/bash
# docker-compose.sh - Smart Docker Launcher for Linux
echo "--- HLC V3 Smart Launcher (Linux) ---"

# 1. Check for standard Docker socket
if [ -S /var/run/docker.sock ]; then
    echo "Found Docker socket at /var/run/docker.sock"
elif [ -n "$DOCKER_HOST" ]; then
    echo "Using existing DOCKER_HOST: $DOCKER_HOST"
else
    echo "Warning: No Docker socket found. Ensure the daemon is running."
fi

# 2. Rebuild and launch
echo "Launching Homelab Commander..."
docker compose up --build -d

if [ $? -eq 0 ]; then
    echo "Success! Access the Command Deck at http://localhost:3000"
else
    echo "Error: Deployment failed."
fi
