# Start Backend Services Script
Write-Host "Starting Alice Semantic Bridge Backend Services..." -ForegroundColor Green

# Check if Python is installed
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python is not installed. Please install Python 3.8 or higher." -ForegroundColor Red
    exit 1
}

# Create logs directory if it doesn't exist
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" -Force | Out-Null
}

# Start LightRAG Service
Write-Host "Starting LightRAG service on port 8083..." -ForegroundColor Yellow
Start-Process python -ArgumentList "backend/lightrag_service.py", "--port", "8083" -NoNewWindow -RedirectStandardOutput "logs/lightrag.log" -RedirectStandardError "logs/lightrag_error.log"

# Wait a moment for LightRAG to start
Start-Sleep -Seconds 3

# Check if LightRAG is running
$tries = 0
$maxTries = 10
while ($tries -lt $maxTries) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8083/health" -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "LightRAG service started successfully!" -ForegroundColor Green
            break
        }
    } catch {
        $tries++
        Write-Host "Waiting for LightRAG to start... ($tries/$maxTries)" -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}

if ($tries -eq $maxTries) {
    Write-Host "Failed to start LightRAG service. Check logs/lightrag_error.log" -ForegroundColor Red
}

# Start other services if needed
# Write-Host "Starting Embedder service on port 8086..." -ForegroundColor Yellow
# Start-Process python -ArgumentList "backend/embedder_service.py", "--port", "8086" -NoNewWindow

Write-Host "Backend services startup completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Service URLs:" -ForegroundColor Cyan
Write-Host "- LightRAG API: http://localhost:8083"
Write-Host "- Dashboard: http://localhost:3001"
Write-Host ""
Write-Host "To stop services, close this window or press Ctrl+C" -ForegroundColor Yellow

# Keep the script running
try {
    while ($true) {
        Start-Sleep -Seconds 10
    }
} catch {
    Write-Host "`nStopping services..." -ForegroundColor Yellow
    # Stop all Python processes related to our services
    Get-Process python | Where-Object { $_.CommandLine -like "*lightrag*" -or $_.CommandLine -like "*embedder*" } | Stop-Process -Force
    Write-Host "Services stopped." -ForegroundColor Green
}