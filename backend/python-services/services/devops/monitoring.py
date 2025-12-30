"""
DevOps Monitoring Service
Server metrics, alerts, brute force tracking
Redis-centric architecture for real-time updates
"""

import asyncio
import json
import uuid
import re
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from loguru import logger

import redis.asyncio as redis
import paramiko


class DevOpsMonitor:
    """
    Redis-centric monitoring system for DevOps operations.
    Uses Redis DB 4 for data storage and DB 5 for Pub/Sub.

    Features:
    - Real-time server metrics (CPU, RAM, Disk)
    - PM2 service monitoring
    - Brute force detection
    - Alert system with severity levels
    - Deployment tracking
    """

    def __init__(self, redis_url: str = "redis://localhost:6379/4"):
        self.redis_url = redis_url
        self.redis: Optional[redis.Redis] = None
        self.pubsub_redis: Optional[redis.Redis] = None

    async def initialize(self):
        """Initialize Redis connections"""
        if not self.redis:
            # Data storage on DB 4
            self.redis = redis.from_url(self.redis_url, decode_responses=True)

            # Pub/Sub on DB 5
            pubsub_url = self.redis_url.replace('/4', '/5')
            self.pubsub_redis = redis.from_url(pubsub_url, decode_responses=True)

            logger.info("DevOps Monitor initialized with Redis")

    async def close(self):
        """Close Redis connections"""
        if self.redis:
            await self.redis.close()
        if self.pubsub_redis:
            await self.pubsub_redis.close()

    # ==========================================
    # SERVER METRICS
    # ==========================================

    async def collect_metrics(
        self,
        server_id: str,
        ssh_client: paramiko.SSHClient
    ) -> Dict[str, Any]:
        """Collect server metrics and store in Redis"""
        from .ssh_manager import ssh_manager

        metrics_cmd = """
echo "CPU:$(top -bn1 | grep 'Cpu(s)' | awk '{print $2}')"
echo "RAM:$(free | awk '/Mem:/ {printf \"%.1f\", $3/$2 * 100}')"
echo "DISK:$(df / | awk 'NR==2 {print $5}' | tr -d '%')"
echo "LOAD:$(cat /proc/loadavg | awk '{print $1}')"
echo "PROCS:$(ps aux | wc -l)"
echo "UPTIME:$(uptime -p 2>/dev/null || uptime)"
"""
        result = await ssh_manager.execute(ssh_client, metrics_cmd, timeout=15)

        metrics = {}
        for line in result['stdout'].strip().split('\n'):
            if ':' in line:
                key, value = line.split(':', 1)
                metrics[key.lower()] = value.strip()

        metrics['timestamp'] = datetime.now().isoformat()
        metrics['server_id'] = server_id

        await self.initialize()

        # Store current metrics
        await self.redis.hset(f"devops:metrics:{server_id}", mapping=metrics)
        await self.redis.expire(f"devops:metrics:{server_id}", 300)  # 5 min TTL

        # Store in history (keep last 100)
        await self.redis.lpush(
            f"devops:metrics:{server_id}:history",
            json.dumps(metrics)
        )
        await self.redis.ltrim(f"devops:metrics:{server_id}:history", 0, 99)

        # Publish update for real-time dashboard
        await self.pubsub_redis.publish(
            "devops:metrics",
            json.dumps({
                "server_id": server_id,
                "metrics": metrics
            })
        )

        # Check thresholds and create alerts
        await self._check_metric_thresholds(server_id, metrics)

        return metrics

    async def _check_metric_thresholds(
        self,
        server_id: str,
        metrics: Dict[str, Any]
    ):
        """Check metrics against thresholds and create alerts"""
        try:
            cpu = float(metrics.get('cpu', 0))
            ram = float(metrics.get('ram', 0))
            disk = float(metrics.get('disk', 0))

            if cpu > 90:
                await self.create_alert(
                    server_id=server_id,
                    severity='critical',
                    alert_type='resource',
                    title=f'Critical CPU Usage: {cpu}%',
                    message=f'Server CPU usage is critically high at {cpu}%',
                    metadata={'metric': 'cpu', 'value': cpu}
                )
            elif cpu > 80:
                await self.create_alert(
                    server_id=server_id,
                    severity='high',
                    alert_type='resource',
                    title=f'High CPU Usage: {cpu}%',
                    message=f'Server CPU usage is high at {cpu}%',
                    metadata={'metric': 'cpu', 'value': cpu}
                )

            if ram > 95:
                await self.create_alert(
                    server_id=server_id,
                    severity='critical',
                    alert_type='resource',
                    title=f'Critical RAM Usage: {ram}%',
                    message=f'Server RAM usage is critically high at {ram}%',
                    metadata={'metric': 'ram', 'value': ram}
                )
            elif ram > 85:
                await self.create_alert(
                    server_id=server_id,
                    severity='high',
                    alert_type='resource',
                    title=f'High RAM Usage: {ram}%',
                    message=f'Server RAM usage is high at {ram}%',
                    metadata={'metric': 'ram', 'value': ram}
                )

            if disk > 90:
                await self.create_alert(
                    server_id=server_id,
                    severity='critical',
                    alert_type='resource',
                    title=f'Critical Disk Usage: {disk}%',
                    message=f'Server disk is almost full at {disk}%',
                    metadata={'metric': 'disk', 'value': disk}
                )
            elif disk > 80:
                await self.create_alert(
                    server_id=server_id,
                    severity='high',
                    alert_type='resource',
                    title=f'High Disk Usage: {disk}%',
                    message=f'Server disk usage is high at {disk}%',
                    metadata={'metric': 'disk', 'value': disk}
                )

        except (ValueError, TypeError) as e:
            logger.warning(f"Failed to check thresholds: {e}")

    async def get_metrics(self, server_id: str) -> Dict[str, Any]:
        """Get current and historical metrics for a server"""
        await self.initialize()

        current = await self.redis.hgetall(f"devops:metrics:{server_id}")
        history = await self.redis.lrange(f"devops:metrics:{server_id}:history", 0, 49)

        return {
            'current': current,
            'history': [json.loads(h) for h in history]
        }

    # ==========================================
    # PM2 SERVICE MONITORING
    # ==========================================

    async def collect_services(
        self,
        server_id: str,
        ssh_client: paramiko.SSHClient
    ) -> Dict[str, Any]:
        """Collect PM2 service statuses"""
        from .ssh_manager import ssh_manager

        result = await ssh_manager.execute(
            ssh_client,
            "pm2 jlist 2>/dev/null",
            timeout=15
        )

        await self.initialize()

        try:
            services = json.loads(result['stdout'])
            service_data = {}

            for svc in services:
                name = svc['name']
                service_data[name] = {
                    'status': svc['pm2_env']['status'],
                    'cpu': svc['monit']['cpu'],
                    'memory': svc['monit']['memory'],
                    'memory_mb': round(svc['monit']['memory'] / 1024 / 1024, 1),
                    'uptime': svc['pm2_env'].get('pm_uptime', 0),
                    'restarts': svc['pm2_env'].get('restart_time', 0),
                    'pid': svc.get('pid', 0)
                }

                # Check for crashed services
                if svc['pm2_env']['status'] != 'online':
                    await self.create_alert(
                        server_id=server_id,
                        severity='critical',
                        alert_type='service',
                        title=f'Service Down: {name}',
                        message=f'{name} is {svc["pm2_env"]["status"]}',
                        metadata={
                            'service': name,
                            'status': svc['pm2_env']['status']
                        }
                    )

            # Store in Redis
            await self.redis.hset(
                f"devops:services:{server_id}",
                mapping={k: json.dumps(v) for k, v in service_data.items()}
            )
            await self.redis.expire(f"devops:services:{server_id}", 300)

            return {
                'success': True,
                'services': service_data
            }

        except json.JSONDecodeError:
            return {
                'success': False,
                'error': 'Failed to parse PM2 output'
            }

    async def get_services(self, server_id: str) -> Dict[str, Any]:
        """Get PM2 service statuses from Redis"""
        await self.initialize()

        raw = await self.redis.hgetall(f"devops:services:{server_id}")
        services = {k: json.loads(v) for k, v in raw.items()}

        return services

    # ==========================================
    # BRUTE FORCE DETECTION
    # ==========================================

    async def track_ssh_attempt(
        self,
        ip: str,
        success: bool,
        username: str = "root",
        server_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Track SSH login attempts for brute force detection"""
        await self.initialize()

        key = f"devops:bruteforce:{ip}"
        now = datetime.now().isoformat()

        if success:
            await self.redis.hset(key, mapping={
                "last_success": now,
                "success_user": username
            })
            return {"action": "logged", "status": "success"}

        # Failed attempt
        pipe = self.redis.pipeline()
        pipe.hincrby(key, "attempts", 1)
        pipe.hset(key, "last_attempt", now)
        pipe.hsetnx(key, "first_seen", now)
        pipe.expire(key, 86400)  # 24 hour window
        await pipe.execute()

        attempts = int(await self.redis.hget(key, "attempts") or 0)

        # Alert thresholds
        if attempts == 5:
            await self.create_alert(
                server_id=server_id,
                severity='medium',
                alert_type='bruteforce',
                title=f'SSH Brute Force Warning: {ip}',
                message=f'{attempts} failed login attempts from {ip}',
                metadata={'ip': ip, 'attempts': attempts}
            )

        if attempts == 10:
            await self.create_alert(
                server_id=server_id,
                severity='high',
                alert_type='bruteforce',
                title=f'SSH Brute Force Attack: {ip}',
                message=f'{attempts} failed login attempts from {ip}. Consider blocking.',
                metadata={'ip': ip, 'attempts': attempts}
            )
            # Add to blocked set
            await self.redis.sadd("devops:bruteforce:blocked", ip)
            return {"action": "block", "ip": ip, "attempts": attempts}

        return {"action": "logged", "ip": ip, "attempts": attempts}

    async def get_bruteforce_stats(self) -> Dict[str, Any]:
        """Get brute force detection statistics"""
        await self.initialize()

        blocked = await self.redis.smembers("devops:bruteforce:blocked")
        keys = await self.redis.keys("devops:bruteforce:*")

        active_attackers = []
        for key in keys:
            if key.endswith(":blocked"):
                continue

            ip = key.split(":")[-1]
            data = await self.redis.hgetall(key)

            if int(data.get("attempts", 0)) > 3:
                active_attackers.append({
                    "ip": ip,
                    "attempts": int(data.get("attempts", 0)),
                    "first_seen": data.get("first_seen"),
                    "last_attempt": data.get("last_attempt"),
                    "is_blocked": ip in blocked
                })

        return {
            "blocked_ips": list(blocked),
            "blocked_count": len(blocked),
            "active_attackers": sorted(
                active_attackers,
                key=lambda x: x["attempts"],
                reverse=True
            ),
            "total_attempts_24h": sum(a["attempts"] for a in active_attackers)
        }

    async def parse_ssh_logs(
        self,
        server_id: str,
        ssh_client: paramiko.SSHClient
    ):
        """Parse SSH auth logs for failed attempts"""
        from .ssh_manager import ssh_manager

        cmd = """
journalctl -u sshd --since '5 minutes ago' --no-pager 2>/dev/null | \
grep -i 'failed\\|invalid' | head -50
"""
        result = await ssh_manager.execute(ssh_client, cmd, timeout=15)

        ip_pattern = r'from\s+(\d+\.\d+\.\d+\.\d+)'

        for line in result['stdout'].split('\n'):
            match = re.search(ip_pattern, line)
            if match:
                ip = match.group(1)
                await self.track_ssh_attempt(
                    ip=ip,
                    success=False,
                    server_id=server_id
                )

    # ==========================================
    # ALERT SYSTEM
    # ==========================================

    async def create_alert(
        self,
        severity: str,
        alert_type: str,
        title: str,
        message: str,
        server_id: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Create and store an alert"""
        await self.initialize()

        alert_id = str(uuid.uuid4())[:8]
        alert = {
            "id": alert_id,
            "server_id": server_id or "unknown",
            "severity": severity,
            "type": alert_type,
            "title": title,
            "message": message,
            "metadata": json.dumps(metadata or {}),
            "created_at": datetime.now().isoformat(),
            "acknowledged": "false"
        }

        # Store alert
        await self.redis.hset(f"devops:alert:{alert_id}", mapping=alert)
        await self.redis.expire(f"devops:alert:{alert_id}", 86400 * 7)  # 7 days

        # Add to active alerts sorted set (by severity)
        severity_scores = {"critical": 100, "high": 75, "medium": 50, "low": 25}
        await self.redis.zadd(
            "devops:alerts:active",
            {alert_id: severity_scores.get(severity, 0)}
        )

        # Add to history
        await self.redis.lpush("devops:alerts:history", json.dumps(alert))
        await self.redis.ltrim("devops:alerts:history", 0, 999)

        # Publish for real-time notification
        await self.pubsub_redis.publish("devops:alerts", json.dumps(alert))

        logger.warning(f"[ALERT:{severity.upper()}] {title}")

        return alert

    async def get_active_alerts(self) -> List[Dict[str, Any]]:
        """Get all active (unacknowledged) alerts"""
        await self.initialize()

        alert_ids = await self.redis.zrevrange("devops:alerts:active", 0, -1)
        acknowledged = await self.redis.smembers("devops:alerts:acknowledged")

        alerts = []
        for aid in alert_ids:
            if aid not in acknowledged:
                alert = await self.redis.hgetall(f"devops:alert:{aid}")
                if alert:
                    alert['metadata'] = json.loads(alert.get('metadata', '{}'))
                    alerts.append(alert)

        return alerts

    async def acknowledge_alert(self, alert_id: str, user_id: Optional[str] = None):
        """Acknowledge an alert"""
        await self.initialize()

        await self.redis.sadd("devops:alerts:acknowledged", alert_id)
        await self.redis.zrem("devops:alerts:active", alert_id)

        # Update alert record
        await self.redis.hset(f"devops:alert:{alert_id}", mapping={
            "acknowledged": "true",
            "acknowledged_at": datetime.now().isoformat(),
            "acknowledged_by": user_id or "unknown"
        })

        return {"acknowledged": True, "alert_id": alert_id}

    # ==========================================
    # DEPLOYMENT TRACKING
    # ==========================================

    async def start_deployment(
        self,
        tenant_id: str,
        deploy_type: str,
        triggered_by: str,
        server_id: Optional[str] = None
    ) -> str:
        """Start tracking a deployment"""
        await self.initialize()

        deploy_id = str(uuid.uuid4())[:8]
        deployment = {
            "id": deploy_id,
            "server_id": server_id or "unknown",
            "tenant_id": tenant_id,
            "type": deploy_type,
            "status": "running",
            "triggered_by": triggered_by,
            "started_at": datetime.now().isoformat(),
            "progress": "0",
            "current_step": "Initializing...",
            "logs": ""
        }

        await self.redis.hset(f"devops:deploy:{deploy_id}", mapping=deployment)
        await self.redis.expire(f"devops:deploy:{deploy_id}", 86400)

        # Publish start event
        await self.pubsub_redis.publish(
            "devops:deploy:progress",
            json.dumps(deployment)
        )

        return deploy_id

    async def update_deployment(
        self,
        deploy_id: str,
        status: Optional[str] = None,
        progress: Optional[int] = None,
        step: Optional[str] = None,
        log_line: Optional[str] = None
    ):
        """Update deployment progress"""
        await self.initialize()

        key = f"devops:deploy:{deploy_id}"

        updates = {}
        if status:
            updates["status"] = status
        if progress is not None:
            updates["progress"] = str(progress)
        if step:
            updates["current_step"] = step

        if updates:
            await self.redis.hset(key, mapping=updates)

        if log_line:
            current_logs = await self.redis.hget(key, "logs") or ""
            await self.redis.hset(key, "logs", current_logs + log_line + "\n")

        # Publish progress update
        deployment = await self.redis.hgetall(key)
        await self.pubsub_redis.publish(
            "devops:deploy:progress",
            json.dumps(deployment)
        )

    async def complete_deployment(self, deploy_id: str, success: bool):
        """Mark deployment as complete"""
        await self.initialize()

        key = f"devops:deploy:{deploy_id}"

        await self.redis.hset(key, mapping={
            "status": "success" if success else "failed",
            "progress": "100",
            "completed_at": datetime.now().isoformat()
        })

        # Add to history
        deployment = await self.redis.hgetall(key)
        await self.redis.lpush(
            f"devops:deploy:history:{deployment.get('tenant_id', 'unknown')}",
            json.dumps(deployment)
        )
        await self.redis.ltrim(
            f"devops:deploy:history:{deployment.get('tenant_id', 'unknown')}",
            0, 49
        )

        # Publish completion
        await self.pubsub_redis.publish(
            "devops:deploy:progress",
            json.dumps(deployment)
        )

    async def get_deployment(self, deploy_id: str) -> Optional[Dict[str, Any]]:
        """Get deployment status"""
        await self.initialize()
        return await self.redis.hgetall(f"devops:deploy:{deploy_id}")

    async def get_deployment_history(
        self,
        tenant_id: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Get deployment history for a tenant"""
        await self.initialize()

        history = await self.redis.lrange(
            f"devops:deploy:history:{tenant_id}",
            0,
            limit - 1
        )

        return [json.loads(h) for h in history]


# Global instance
devops_monitor = DevOpsMonitor()
