"""
Deployment Manager Service
Git operations, builds, PM2 control
"""

import asyncio
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
from loguru import logger

import paramiko


class DeploymentManager:
    """
    Manages deployments to production servers.
    Handles:
    - Git pull operations
    - npm install / pip install
    - Build processes (Next.js, etc.)
    - PM2 service restart
    - Rollback support
    """

    # Deployment step definitions
    DEPLOY_STEPS = {
        'full': [
            ('git', 'Git pull'),
            ('backend', 'Backend install & restart'),
            ('frontend', 'Frontend build & restart'),
            ('python', 'Python services update')
        ],
        'backend': [
            ('git', 'Git pull'),
            ('backend', 'Backend install & restart')
        ],
        'frontend': [
            ('git', 'Git pull'),
            ('frontend', 'Frontend build & restart')
        ],
        'python': [
            ('git', 'Git pull'),
            ('python', 'Python services update')
        ],
        'hotfix': [
            ('git', 'Git pull'),
            ('backend', 'Backend restart only'),  # No npm install
            ('frontend', 'Frontend restart only')  # No build
        ],
        'restart': [
            ('restart_all', 'Restart all services')
        ]
    }

    async def deploy_tenant(
        self,
        ssh_client: paramiko.SSHClient,
        tenant_config: Dict[str, Any],
        deploy_type: str = 'full',
        progress_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Deploy updates to a tenant.

        Args:
            ssh_client: Connected SSH client
            tenant_config: Tenant configuration dict with:
                - tenant_id: e.g., 'geolex'
                - tenant_path: e.g., '/var/www/geolex'
                - pm2_services: List of PM2 service names
            deploy_type: Type of deployment (full, backend, frontend, python, hotfix, restart)
            progress_callback: Optional async callback(progress: int, step: str, log: str)

        Returns:
            Deployment result with status and logs
        """
        from .ssh_manager import ssh_manager

        path = tenant_config['tenant_path']
        tenant_id = tenant_config['tenant_id']
        logs = []
        steps = self.DEPLOY_STEPS.get(deploy_type, self.DEPLOY_STEPS['full'])
        total_steps = len(steps)
        start_time = datetime.now()

        # Get initial git state
        initial_commit = await self._get_current_commit(ssh_client, path)

        try:
            for i, (step_key, step_name) in enumerate(steps):
                progress = int((i / total_steps) * 100)

                if progress_callback:
                    await progress_callback(progress, step_name, '')

                logs.append(f"\n{'='*50}")
                logs.append(f"=== {step_name} ===")
                logs.append(f"{'='*50}")

                if step_key == 'git':
                    result = await self._git_pull(ssh_client, path)
                elif step_key == 'backend':
                    if deploy_type == 'hotfix':
                        result = await self._restart_service(
                            ssh_client, f"{tenant_id}-backend"
                        )
                    else:
                        result = await self._deploy_backend(
                            ssh_client, path, tenant_id
                        )
                elif step_key == 'frontend':
                    if deploy_type == 'hotfix':
                        result = await self._restart_service(
                            ssh_client, f"{tenant_id}-frontend"
                        )
                    else:
                        result = await self._deploy_frontend(
                            ssh_client, path, tenant_id
                        )
                elif step_key == 'python':
                    result = await self._deploy_python(
                        ssh_client, path, tenant_id
                    )
                elif step_key == 'restart_all':
                    result = await self._restart_all_services(
                        ssh_client, tenant_id
                    )
                else:
                    result = {'stdout': 'Unknown step', 'success': False}

                logs.append(result.get('stdout', ''))
                if result.get('stderr'):
                    logs.append(f"STDERR: {result['stderr']}")

                if progress_callback:
                    await progress_callback(progress, step_name, result.get('stdout', ''))

                # Check for failure
                if not result.get('success', True):
                    if result.get('exit_code', 0) != 0:
                        logs.append(f"\n[ERROR] Step '{step_name}' failed with exit code {result.get('exit_code')}")
                        # Continue anyway for now, log the error

            # Get final commit
            final_commit = await self._get_current_commit(ssh_client, path)

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            if progress_callback:
                await progress_callback(100, 'Complete', 'Deployment finished')

            return {
                'success': True,
                'tenant_id': tenant_id,
                'deploy_type': deploy_type,
                'git_commit_before': initial_commit,
                'git_commit_after': final_commit,
                'duration_ms': duration_ms,
                'logs': '\n'.join(logs)
            }

        except Exception as e:
            logger.error(f"Deployment failed for {tenant_id}: {e}")
            return {
                'success': False,
                'tenant_id': tenant_id,
                'deploy_type': deploy_type,
                'error': str(e),
                'logs': '\n'.join(logs)
            }

    async def _get_current_commit(
        self,
        ssh_client: paramiko.SSHClient,
        path: str
    ) -> Optional[str]:
        """Get current git commit hash"""
        from .ssh_manager import ssh_manager

        result = await ssh_manager.execute(
            ssh_client,
            f"cd {path} && git rev-parse HEAD 2>/dev/null",
            timeout=10
        )
        return result['stdout'].strip() if result['success'] else None

    async def _git_pull(
        self,
        ssh_client: paramiko.SSHClient,
        path: str
    ) -> Dict[str, Any]:
        """Execute git pull"""
        from .ssh_manager import ssh_manager

        return await ssh_manager.execute(
            ssh_client,
            f"cd {path} && git fetch origin && git pull origin main 2>&1",
            timeout=60
        )

    async def _deploy_backend(
        self,
        ssh_client: paramiko.SSHClient,
        path: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """Deploy backend: npm install + pm2 restart"""
        from .ssh_manager import ssh_manager

        cmd = f"""
cd {path}/backend
npm install --legacy-peer-deps 2>&1 | tail -10
pm2 restart {tenant_id}-backend
pm2 info {tenant_id}-backend | grep -E 'status|uptime'
"""
        return await ssh_manager.execute(ssh_client, cmd, timeout=180)

    async def _deploy_frontend(
        self,
        ssh_client: paramiko.SSHClient,
        path: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """Deploy frontend: clear cache, build, restart"""
        from .ssh_manager import ssh_manager

        cmd = f"""
cd {path}/frontend
rm -rf .next 2>/dev/null
npm run build 2>&1 | tail -20
pm2 restart {tenant_id}-frontend
pm2 info {tenant_id}-frontend | grep -E 'status|uptime'
"""
        return await ssh_manager.execute(ssh_client, cmd, timeout=300)

    async def _deploy_python(
        self,
        ssh_client: paramiko.SSHClient,
        path: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """Deploy Python services: pip install + pm2 restart"""
        from .ssh_manager import ssh_manager

        cmd = f"""
cd {path}/backend/python-services
pip3 install -r requirements.txt 2>&1 | grep -E 'Successfully|Requirement already|ERROR' | tail -10
pm2 restart {tenant_id}-python
pm2 info {tenant_id}-python | grep -E 'status|uptime'
"""
        return await ssh_manager.execute(ssh_client, cmd, timeout=180)

    async def _restart_service(
        self,
        ssh_client: paramiko.SSHClient,
        service_name: str
    ) -> Dict[str, Any]:
        """Restart a PM2 service"""
        from .ssh_manager import ssh_manager

        return await ssh_manager.execute(
            ssh_client,
            f"pm2 restart {service_name} && pm2 info {service_name} | grep -E 'status|uptime'",
            timeout=30
        )

    async def _restart_all_services(
        self,
        ssh_client: paramiko.SSHClient,
        tenant_id: str
    ) -> Dict[str, Any]:
        """Restart all PM2 services for a tenant"""
        from .ssh_manager import ssh_manager

        cmd = f"""
pm2 restart {tenant_id}-backend 2>/dev/null || echo "No backend service"
pm2 restart {tenant_id}-frontend 2>/dev/null || echo "No frontend service"
pm2 restart {tenant_id}-python 2>/dev/null || echo "No python service"
pm2 list | grep {tenant_id}
"""
        return await ssh_manager.execute(ssh_client, cmd, timeout=60)

    async def clear_cache(
        self,
        ssh_client: paramiko.SSHClient,
        tenant_path: str
    ) -> Dict[str, Any]:
        """Clear Next.js cache (.next folder)"""
        from .ssh_manager import ssh_manager

        result = await ssh_manager.execute(
            ssh_client,
            f"cd {tenant_path}/frontend && rm -rf .next && echo 'Cache cleared'",
            timeout=30
        )
        return result

    async def get_pm2_status(
        self,
        ssh_client: paramiko.SSHClient,
        tenant_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get PM2 service status"""
        from .ssh_manager import ssh_manager

        if tenant_id:
            cmd = f"pm2 jlist 2>/dev/null | python3 -c \"import sys,json; d=json.load(sys.stdin); print(json.dumps([s for s in d if '{tenant_id}' in s['name']]))\""
        else:
            cmd = "pm2 jlist 2>/dev/null"

        result = await ssh_manager.execute(ssh_client, cmd, timeout=15)

        try:
            import json
            services = json.loads(result['stdout'])
            return {
                'success': True,
                'services': services
            }
        except:
            return {
                'success': False,
                'raw': result['stdout']
            }

    async def get_git_status(
        self,
        ssh_client: paramiko.SSHClient,
        path: str
    ) -> Dict[str, Any]:
        """Get git status for a path"""
        from .ssh_manager import ssh_manager

        cmd = f"""
cd {path}
echo "Branch: $(git branch --show-current)"
echo "Commit: $(git rev-parse --short HEAD)"
echo "Behind: $(git rev-list HEAD..origin/main --count 2>/dev/null || echo 'unknown')"
echo "Status:"
git status -s | head -10
"""
        return await ssh_manager.execute(ssh_client, cmd, timeout=30)

    async def deploy_multiple(
        self,
        ssh_client: paramiko.SSHClient,
        tenants: List[Dict[str, Any]],
        deploy_type: str = 'full',
        progress_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Deploy to multiple tenants sequentially.

        Args:
            ssh_client: Connected SSH client
            tenants: List of tenant configs
            deploy_type: Type of deployment
            progress_callback: Optional callback

        Returns:
            Results for all deployments
        """
        results = []
        total = len(tenants)

        for i, tenant in enumerate(tenants):
            overall_progress = int((i / total) * 100)

            if progress_callback:
                await progress_callback(
                    overall_progress,
                    f"Deploying {tenant['tenant_id']} ({i+1}/{total})",
                    ''
                )

            result = await self.deploy_tenant(
                ssh_client,
                tenant,
                deploy_type
            )
            results.append(result)

        return {
            'total': total,
            'success': len([r for r in results if r.get('success')]),
            'failed': len([r for r in results if not r.get('success')]),
            'results': results
        }


# Global instance
deployment_manager = DeploymentManager()
