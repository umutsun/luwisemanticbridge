# Windows Docker Network Troubleshooting Guide

## Problem Description
Docker containers are running but not accessible from host machine on Windows + Docker Desktop.

## Common Issues and Solutions

### 1. Port Binding Issues
**Problem**: Container ports not properly bound to host
**Solution**: Use explicit 127.0.0.1 binding instead of 0.0.0.0

```yaml
# Instead of:
ports:
  - "8083:8083"

# Use:
ports:
  - "127.0.0.1:8083:8083"
```

### 2. Windows Firewall Blocking
**Problem**: Windows Defender Firewall blocking Docker ports
**Solution**: 
- Open Windows Defender Firewall with Advanced Security
- Add inbound rules for ports 8083, 3005, 5432, 6379, 8002
- Or temporarily disable firewall for testing:
```powershell
netsh advfirewall set allprofiles state off
```

### 3. Docker Desktop Network Settings
**Problem**: Docker Desktop network configuration issues
**Solution**:
- Open Docker Desktop Settings
- Go to Resources > Network
- Set DNS Server to: 8.8.8.8
- Enable: Use host networking mode when available
- Restart Docker Desktop

### 4. WSL2 Backend Issues
**Problem**: WSL2 backend causing network routing problems
**Solution**:
```powershell
# Check WSL status
wsl --status

# Restart WSL
wsl --shutdown
wsl

# Check WSL network
wsl -d docker-desktop ip addr
```

### 5. Container Network Configuration
**Problem**: Container network not properly configured
**Solution**: Use optimized network settings:

```yaml
networks:
  asemb-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
          gateway: 172.20.0.1
    driver_opts:
      com.docker.network.driver.mtu: 1450
      com.docker.network.windowsshim.dnsservers: 8.8.8.8
```

### 6. Host Gateway Access
**Problem**: Container can't access host services
**Solution**: Add extra_hosts configuration:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

## Testing Commands

### Test API Connectivity
```bash
# From host
curl -v http://localhost:8083/api/v1/health

# From container
docker exec asemb-api wget -qO- http://localhost:8083/api/v1/health
```

### Test Frontend Connectivity
```bash
# From host
curl -I http://localhost:3005

# From container
docker exec asemb-frontend wget -qO- http://localhost:3000
```

### Test Inter-Container Communication
```bash
# Test API from Frontend container
docker exec asemb-frontend wget -qO- http://asemb-api:8083/api/v1/health

# Test Frontend from API container
docker exec asemb-api wget -qO- http://asemb-frontend:3000
```

### Network Inspection
```bash
# List all networks
docker network ls

# Inspect specific network
docker network inspect asemb-network

# Check container IP addresses
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' asemb-api
```

## Windows-Specific Solutions

### 1. Reset Docker Desktop Network
```powershell
# Reset Docker network
netsh winsock reset
netsh int ip reset
ipconfig /flushdns
ipconfig /release
ipconfig /renew
```

### 2. Check Windows Services
```powershell
# Check required services
Get-Service -Name "com.docker.service"
Get-Service -Name "LxssManager"

# Restart if needed
Restart-Service -Name "com.docker.service"
```

### 3. Docker Desktop Settings
- Enable: "Expose daemon on tcp://localhost:2375 without TLS"
- Enable: "Use the WSL 2 based engine"
- Set: "Resources > WSL Integration" to your distro

### 4. Manual Port Forwarding
If automatic port binding fails, use manual port forwarding:

```powershell
# Add port proxy
netsh interface portproxy add v4tov4 listenport=8083 listenaddress=127.0.0.1 connectport=8083 connectaddress=172.20.0.5

# View port proxies
netsh interface portproxy show v4tov4

# Delete port proxy (if needed)
netsh interface portproxy delete v4tov4 listenport=8083 listenaddress=127.0.0.1
```

## Quick Fix Script

Save as `fix-windows-docker.bat`:
```batch
@echo off
echo Fixing Windows Docker network issues...

echo 1. Stopping Docker containers...
docker compose down

echo 2. Cleaning Docker system...
docker system prune -f
docker network prune -f

echo 3. Resetting Windows network...
netsh winsock reset
netsh int ip reset
ipconfig /flushdns

echo 4. Restarting WSL...
wsl --shutdown

echo 5. Starting optimized Docker setup...
docker compose --env-file ./.env.asemb -f docker-compose.windows.yml up --build -d

echo 6. Testing connectivity...
timeout /t 10 /nobreak > nul
curl http://localhost:8083/api/v1/health

echo Done! Check the output above for success.
pause
```

## Verification Checklist

- [ ] All containers are running (`docker ps`)
- [ ] No port conflicts (`netstat -ano | findstr :8083`)
- [ ] Windows Firewall allows Docker ports
- [ ] Docker Desktop is running with WSL2 backend
- [ ] API responds: `curl http://localhost:8083/api/v1/health`
- [ ] Frontend loads: `curl -I http://localhost:3005`
- [ ] Inter-container communication works
- [ ] No "Connection refused" errors

## Still Having Issues?

1. Check Docker Desktop logs: `%AppData%\Docker\log\`
2. Check Windows Event Viewer for network errors
3. Try disabling Windows Defender temporarily
4. Consider using Docker Desktop Edge version
5. Report issue with detailed logs to Docker support