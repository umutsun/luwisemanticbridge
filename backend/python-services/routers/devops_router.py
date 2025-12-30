"""
DevOps Router
API endpoints for DevOps Dashboard functionality
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from loguru import logger

router = APIRouter(prefix="/api/python/devops", tags=["devops"])


# ==========================================
# Request/Response Models
# ==========================================

class SSHKeyRequest(BaseModel):
    """Request model for SSH key operations"""
    name: str = Field(..., description="Key name")
    private_key: str = Field(..., description="Private key content (will be encrypted)")
    public_key: Optional[str] = None
    passphrase: Optional[str] = None


class SSHKeyEncryptRequest(BaseModel):
    """Request model for encrypting an SSH key"""
    private_key: str = Field(..., description="Private key content to encrypt")


class SSHTestRequest(BaseModel):
    """Request model for testing SSH connection"""
    hostname: str
    private_key: str = Field(..., description="Decrypted private key content")
    username: str = "root"
    port: int = 22
    passphrase: Optional[str] = None


class CommandRequest(BaseModel):
    """Request model for executing SSH commands"""
    hostname: str
    private_key: str
    username: str = "root"
    port: int = 22
    passphrase: Optional[str] = None
    command: str
    timeout: int = 60


class SecurityScanRequest(BaseModel):
    """Request model for security scans"""
    hostname: str
    private_key: str
    username: str = "root"
    port: int = 22
    passphrase: Optional[str] = None
    scan_type: str = "full"  # full, quick


class AutoFixRequest(BaseModel):
    """Request model for auto-fix"""
    hostname: str
    private_key: str
    username: str = "root"
    port: int = 22
    passphrase: Optional[str] = None
    finding_name: str


class DeployRequest(BaseModel):
    """Request model for deployments"""
    hostname: str
    private_key: str
    username: str = "root"
    port: int = 22
    passphrase: Optional[str] = None
    tenant_id: str
    tenant_path: str
    deploy_type: str = "full"  # full, backend, frontend, python, hotfix, restart


class TenantConfig(BaseModel):
    """Tenant configuration for deployment"""
    tenant_id: str
    tenant_path: str
    pm2_services: List[str] = []


# ==========================================
# SSH Key Management
# ==========================================

@router.post("/ssh/encrypt-key")
async def encrypt_ssh_key(request: SSHKeyEncryptRequest):
    """Encrypt an SSH private key for storage"""
    from services.devops import ssh_manager

    try:
        encrypted = ssh_manager.encrypt_key(request.private_key)
        key_type = ssh_manager.detect_key_type(request.private_key)

        return {
            "success": True,
            "encrypted_key": encrypted,
            "key_type": key_type
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ssh/decrypt-key")
async def decrypt_ssh_key(encrypted_key: str):
    """Decrypt an SSH private key"""
    from services.devops import ssh_manager

    try:
        decrypted = ssh_manager.decrypt_key(encrypted_key)
        return {
            "success": True,
            "decrypted_key": decrypted
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ssh/fingerprint")
async def get_key_fingerprint(public_key: str):
    """Get SSH key fingerprint"""
    from services.devops import ssh_manager

    fingerprint = ssh_manager.get_key_fingerprint(public_key)
    return {
        "fingerprint": fingerprint
    }


# ==========================================
# SSH Connection
# ==========================================

@router.post("/ssh/test")
async def test_ssh_connection(request: SSHTestRequest):
    """Test SSH connection to a server"""
    from services.devops import ssh_manager

    logger.info(f"Testing SSH connection to {request.hostname}")

    result = await ssh_manager.test_connection(
        hostname=request.hostname,
        private_key=request.private_key,
        username=request.username,
        port=request.port,
        passphrase=request.passphrase
    )

    if result['success']:
        return result
    else:
        raise HTTPException(status_code=400, detail=result.get('error', 'Connection failed'))


@router.post("/ssh/execute")
async def execute_command(request: CommandRequest):
    """Execute command on remote server"""
    from services.devops import ssh_manager

    logger.info(f"Executing command on {request.hostname}: {request.command[:50]}...")

    try:
        client = await ssh_manager.connect(
            hostname=request.hostname,
            private_key=request.private_key,
            username=request.username,
            port=request.port,
            passphrase=request.passphrase
        )

        result = await ssh_manager.execute(
            client,
            request.command,
            timeout=request.timeout
        )

        client.close()

        return {
            "success": result['success'],
            "stdout": result['stdout'],
            "stderr": result['stderr'],
            "exit_code": result['exit_code'],
            "duration_ms": result['duration_ms']
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# Security Scanner
# ==========================================

@router.post("/security/scan")
async def run_security_scan(request: SecurityScanRequest):
    """Run security scan on server"""
    from services.devops import ssh_manager, security_scanner

    logger.info(f"Starting {request.scan_type} security scan on {request.hostname}")

    try:
        client = await ssh_manager.connect(
            hostname=request.hostname,
            private_key=request.private_key,
            username=request.username,
            port=request.port,
            passphrase=request.passphrase
        )

        if request.scan_type == 'quick':
            result = await security_scanner.quick_scan(client)
        else:
            result = await security_scanner.full_scan(client)

        client.close()

        return {
            "success": True,
            "scan_type": request.scan_type,
            "hostname": request.hostname,
            **result
        }

    except Exception as e:
        logger.error(f"Security scan failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/security/auto-fix")
async def auto_fix_finding(request: AutoFixRequest):
    """Apply auto-fix for a security finding"""
    from services.devops import ssh_manager, security_scanner

    logger.info(f"Applying auto-fix for '{request.finding_name}' on {request.hostname}")

    try:
        client = await ssh_manager.connect(
            hostname=request.hostname,
            private_key=request.private_key,
            username=request.username,
            port=request.port,
            passphrase=request.passphrase
        )

        result = await security_scanner.auto_fix(client, request.finding_name)

        client.close()

        return result

    except Exception as e:
        logger.error(f"Auto-fix failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/security/playbooks")
async def list_auto_fix_playbooks():
    """List available auto-fix playbooks"""
    from services.devops import security_scanner

    playbooks = {}
    for name, playbook in security_scanner.AUTO_FIX_PLAYBOOKS.items():
        playbooks[name] = {
            'description': playbook['description'],
            'commands_count': len(playbook['commands'])
        }

    return {
        "playbooks": playbooks,
        "total": len(playbooks)
    }


# ==========================================
# Deployment
# ==========================================

@router.post("/deploy")
async def deploy_tenant(request: DeployRequest, background_tasks: BackgroundTasks):
    """Deploy updates to a tenant"""
    from services.devops import ssh_manager, deployment_manager, devops_monitor

    logger.info(f"Starting {request.deploy_type} deployment for {request.tenant_id}")

    try:
        # Initialize monitoring
        await devops_monitor.initialize()

        # Start deployment tracking
        deploy_id = await devops_monitor.start_deployment(
            tenant_id=request.tenant_id,
            deploy_type=request.deploy_type,
            triggered_by="api"
        )

        client = await ssh_manager.connect(
            hostname=request.hostname,
            private_key=request.private_key,
            username=request.username,
            port=request.port,
            passphrase=request.passphrase
        )

        # Progress callback
        async def progress_callback(progress: int, step: str, log: str):
            await devops_monitor.update_deployment(
                deploy_id,
                progress=progress,
                step=step,
                log_line=log
            )

        # Run deployment
        result = await deployment_manager.deploy_tenant(
            client,
            {
                'tenant_id': request.tenant_id,
                'tenant_path': request.tenant_path
            },
            request.deploy_type,
            progress_callback
        )

        # Complete deployment tracking
        await devops_monitor.complete_deployment(deploy_id, result['success'])

        client.close()

        return {
            "deploy_id": deploy_id,
            **result
        }

    except Exception as e:
        logger.error(f"Deployment failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/deploy/clear-cache")
async def clear_frontend_cache(request: DeployRequest):
    """Clear Next.js cache for a tenant"""
    from services.devops import ssh_manager, deployment_manager

    try:
        client = await ssh_manager.connect(
            hostname=request.hostname,
            private_key=request.private_key,
            username=request.username,
            port=request.port,
            passphrase=request.passphrase
        )

        result = await deployment_manager.clear_cache(
            client,
            request.tenant_path
        )

        client.close()

        return {
            "success": result['success'],
            "output": result['stdout']
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/deploy/git-status")
async def get_git_status(request: DeployRequest):
    """Get git status for a tenant"""
    from services.devops import ssh_manager, deployment_manager

    try:
        client = await ssh_manager.connect(
            hostname=request.hostname,
            private_key=request.private_key,
            username=request.username,
            port=request.port,
            passphrase=request.passphrase
        )

        result = await deployment_manager.get_git_status(
            client,
            request.tenant_path
        )

        client.close()

        return {
            "success": result['success'],
            "output": result['stdout']
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/deploy/pm2-status")
async def get_pm2_status(request: SSHTestRequest, tenant_id: Optional[str] = None):
    """Get PM2 service status"""
    from services.devops import ssh_manager, deployment_manager

    try:
        client = await ssh_manager.connect(
            hostname=request.hostname,
            private_key=request.private_key,
            username=request.username,
            port=request.port,
            passphrase=request.passphrase
        )

        result = await deployment_manager.get_pm2_status(client, tenant_id)

        client.close()

        return result

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# Monitoring & Metrics
# ==========================================

@router.post("/monitor/metrics")
async def collect_metrics(request: SSHTestRequest, server_id: str = "default"):
    """Collect server metrics"""
    from services.devops import ssh_manager, devops_monitor

    try:
        client = await ssh_manager.connect(
            hostname=request.hostname,
            private_key=request.private_key,
            username=request.username,
            port=request.port,
            passphrase=request.passphrase
        )

        metrics = await devops_monitor.collect_metrics(server_id, client)

        client.close()

        return {
            "success": True,
            "server_id": server_id,
            "metrics": metrics
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/monitor/metrics/{server_id}")
async def get_metrics(server_id: str):
    """Get stored metrics for a server"""
    from services.devops import devops_monitor

    await devops_monitor.initialize()
    metrics = await devops_monitor.get_metrics(server_id)

    return {
        "server_id": server_id,
        **metrics
    }


@router.post("/monitor/services")
async def collect_services(request: SSHTestRequest, server_id: str = "default"):
    """Collect PM2 service status"""
    from services.devops import ssh_manager, devops_monitor

    try:
        client = await ssh_manager.connect(
            hostname=request.hostname,
            private_key=request.private_key,
            username=request.username,
            port=request.port,
            passphrase=request.passphrase
        )

        result = await devops_monitor.collect_services(server_id, client)

        client.close()

        return {
            "server_id": server_id,
            **result
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/monitor/services/{server_id}")
async def get_services(server_id: str):
    """Get stored service status"""
    from services.devops import devops_monitor

    await devops_monitor.initialize()
    services = await devops_monitor.get_services(server_id)

    return {
        "server_id": server_id,
        "services": services
    }


# ==========================================
# Alerts
# ==========================================

@router.get("/alerts")
async def get_active_alerts():
    """Get all active alerts"""
    from services.devops import devops_monitor

    await devops_monitor.initialize()
    alerts = await devops_monitor.get_active_alerts()

    return {
        "alerts": alerts,
        "count": len(alerts)
    }


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, user_id: Optional[str] = None):
    """Acknowledge an alert"""
    from services.devops import devops_monitor

    await devops_monitor.initialize()
    result = await devops_monitor.acknowledge_alert(alert_id, user_id)

    return result


# ==========================================
# Brute Force Detection
# ==========================================

@router.get("/security/bruteforce")
async def get_bruteforce_stats():
    """Get brute force detection statistics"""
    from services.devops import devops_monitor

    await devops_monitor.initialize()
    stats = await devops_monitor.get_bruteforce_stats()

    return stats


@router.post("/security/bruteforce/check")
async def check_ssh_logs(request: SSHTestRequest, server_id: str = "default"):
    """Parse SSH logs for brute force attempts"""
    from services.devops import ssh_manager, devops_monitor

    try:
        client = await ssh_manager.connect(
            hostname=request.hostname,
            private_key=request.private_key,
            username=request.username,
            port=request.port,
            passphrase=request.passphrase
        )

        await devops_monitor.parse_ssh_logs(server_id, client)

        client.close()

        # Return current stats
        stats = await devops_monitor.get_bruteforce_stats()

        return {
            "success": True,
            "server_id": server_id,
            "stats": stats
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# Deployment History
# ==========================================

@router.get("/deployments/{tenant_id}")
async def get_deployment_history(tenant_id: str, limit: int = 20):
    """Get deployment history for a tenant"""
    from services.devops import devops_monitor

    await devops_monitor.initialize()
    history = await devops_monitor.get_deployment_history(tenant_id, limit)

    return {
        "tenant_id": tenant_id,
        "deployments": history,
        "count": len(history)
    }


@router.get("/deployments/status/{deploy_id}")
async def get_deployment_status(deploy_id: str):
    """Get status of a specific deployment"""
    from services.devops import devops_monitor

    await devops_monitor.initialize()
    deployment = await devops_monitor.get_deployment(deploy_id)

    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    return deployment


# ==========================================
# Health Check
# ==========================================

@router.get("/health")
async def devops_health():
    """DevOps service health check"""
    from services.devops import ssh_manager

    return {
        "status": "healthy",
        "service": "devops",
        "encryption_enabled": ssh_manager.fernet is not None,
        "timestamp": datetime.now().isoformat()
    }
