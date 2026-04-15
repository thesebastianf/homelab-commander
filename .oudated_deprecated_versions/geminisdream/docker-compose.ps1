# docker-compose.ps1 - Smart Docker Launcher for Windows
# This script automatically detects the correct Docker context and engine pipe.

Write-Host "--- HLC V3 Smart Launcher (Windows) ---" -ForegroundColor Cyan

# 1. Check if Docker is running
if (-not (Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue)) {
    Write-Warning "Docker Desktop does not appear to be running. Please start it first."
    exit 1
}

# 2. Determine best context
$contexts = docker context ls --format "{{.Name}}"
$targetContext = "default"

if ($contexts -contains "desktop-linux") {
    $targetContext = "desktop-linux"
    Write-Host "Detected modern WSL2 context: desktop-linux" -ForegroundColor Green
} else {
    Write-Host "Using default Docker context." -ForegroundColor Yellow
}

# 3. Set context for this session
Write-Host "Configuring Docker context to: $targetContext..."
docker context use $targetContext | Out-Null

# 4. Run Docker Compose
Write-Host "Launching Homelab Commander..." -ForegroundColor Magenta
docker compose up --build -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nReady! Access the Command Deck at http://localhost:3000" -ForegroundColor Green
} else {
    Write-Error "Deployment failed. Check terminal output above."
}
