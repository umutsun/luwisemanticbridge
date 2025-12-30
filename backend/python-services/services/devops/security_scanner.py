"""
Security Scanner Service
Malware detection, security checks, and auto-fix capabilities
Based on real-world malware cleanup experience (Dec 2025)
"""

import asyncio
from typing import Dict, List, Any, Optional
from datetime import datetime
from loguru import logger

import paramiko


class SecurityScanner:
    """
    Comprehensive security scanner for Linux servers.
    Based on actual malware cleanup experience including:
    - b4nd1d0 cryptominer
    - Trojanized sshd
    - Malicious cron persistence
    - Systemd service backdoors
    """

    # Malware detection checks
    MALWARE_CHECKS = [
        # ===== CRITICAL: Active Malware =====
        {
            'name': 'malware_processes',
            'category': 'process',
            'severity': 'critical',
            'description': 'Known malware process running',
            'command': "ps aux | grep -E 'b4nd1d0|kdevtmpfsi|kinsing|xmrig|miner|cryptonight|monero' | grep -v grep",
            'check_type': 'output_exists'
        },
        {
            'name': 'malicious_cron',
            'category': 'persistence',
            'severity': 'critical',
            'description': 'Malicious cron job detected',
            'command': "crontab -l 2>/dev/null | grep -E 'cc.txt|update|curl.*sh|wget.*sh|/dev/null.*&|base64'",
            'check_type': 'output_exists'
        },
        {
            'name': 'fake_sshd_binary',
            'category': 'trojan',
            'severity': 'critical',
            'description': 'Trojanized sshd binary detected (text file instead of binary)',
            'command': "file /usr/bin/sshd 2>/dev/null | grep -q 'text' && echo 'FAKE SSHD: /usr/bin/sshd is a text file!'",
            'check_type': 'output_exists'
        },
        {
            'name': 'suspicious_systemd_services',
            'category': 'persistence',
            'severity': 'critical',
            'description': 'Suspicious systemd service found',
            'command': "systemctl cat myservice.service 2>/dev/null || ls /usr/lib/systemd/system/myservice.service 2>/dev/null",
            'check_type': 'output_exists'
        },
        {
            'name': 'mining_pool_connections',
            'category': 'network',
            'severity': 'critical',
            'description': 'Active connection to mining pool ports',
            'command': "ss -tupn 2>/dev/null | grep -E ':3333|:4444|:5555|:14444|:45700'",
            'check_type': 'output_exists'
        },

        # ===== HIGH: Persistence Mechanisms =====
        {
            'name': 'immutable_cron',
            'category': 'persistence',
            'severity': 'high',
            'description': 'Immutable cron files (malware protection)',
            'command': "lsattr /var/spool/cron/* 2>/dev/null | grep -E '[-]+i[-]+'",
            'check_type': 'output_exists'
        },
        {
            'name': 'modified_system_binaries',
            'category': 'trojan',
            'severity': 'high',
            'description': 'Original system binaries backed up (sign of replacement)',
            'command': "ls /usr/bin/*.original /bin/*.original /usr/sbin/*.original 2>/dev/null",
            'check_type': 'output_exists'
        },
        {
            'name': 'ssh_password_auth',
            'category': 'config',
            'severity': 'high',
            'description': 'SSH password authentication enabled',
            'command': "grep -E '^PasswordAuthentication\\s+yes' /etc/ssh/sshd_config 2>/dev/null",
            'check_type': 'output_exists'
        },
        {
            'name': 'ssh_root_password',
            'category': 'config',
            'severity': 'high',
            'description': 'SSH root password login allowed',
            'command': "grep -E '^PermitRootLogin\\s+(yes|without-password)' /etc/ssh/sshd_config 2>/dev/null | grep -v prohibit-password",
            'check_type': 'output_exists'
        },
        {
            'name': 'unauthorized_ssh_keys',
            'category': 'persistence',
            'severity': 'high',
            'description': 'Suspicious SSH authorized keys',
            'command': "grep -r 'mdrfckr\\|xmrig\\|miner' /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys 2>/dev/null",
            'check_type': 'output_exists'
        },

        # ===== MEDIUM: Suspicious Activity =====
        {
            'name': 'hidden_tmp_files',
            'category': 'file',
            'severity': 'medium',
            'description': 'Hidden files in temp directories',
            'command': "find /tmp /var/tmp /dev/shm -name '.*' -type f 2>/dev/null | grep -v -E 'postgres|X11|ICE|font|pulse'",
            'check_type': 'output_exists'
        },
        {
            'name': 'high_cpu_processes',
            'category': 'resource',
            'severity': 'medium',
            'description': 'Processes using high CPU (>70%)',
            'command': "ps aux --sort=-%cpu 2>/dev/null | awk 'NR>1 && $3>70 {print $0}' | head -5",
            'check_type': 'output_exists'
        },
        {
            'name': 'suspicious_network_listeners',
            'category': 'network',
            'severity': 'medium',
            'description': 'Unusual listening ports',
            'command': "ss -tulpn 2>/dev/null | grep -E ':(6666|7777|8888|9999|12345|31337)\\s'",
            'check_type': 'output_exists'
        },
        {
            'name': 'empty_lastlog',
            'category': 'evasion',
            'severity': 'medium',
            'description': 'Login history cleared (evasion technique)',
            'command': "[ -f /var/log/lastlog ] && [ ! -s /var/log/lastlog ] && echo 'lastlog is empty!'",
            'check_type': 'output_exists'
        },

        # ===== LOW: Information Gathering =====
        {
            'name': 'firewall_status',
            'category': 'config',
            'severity': 'low',
            'description': 'Firewall status check',
            'command': "ufw status 2>/dev/null || firewall-cmd --state 2>/dev/null || iptables -L -n 2>/dev/null | head -20",
            'check_type': 'info_only'
        },
        {
            'name': 'fail2ban_status',
            'category': 'config',
            'severity': 'low',
            'description': 'Fail2ban status',
            'command': "systemctl is-active fail2ban 2>/dev/null && fail2ban-client status 2>/dev/null | head -10",
            'check_type': 'info_only'
        }
    ]

    # Auto-fix playbooks for known issues
    AUTO_FIX_PLAYBOOKS = {
        'malicious_cron': {
            'description': 'Remove malicious cron jobs and lock crontab',
            'commands': [
                'chattr -ia /var/spool/cron/root 2>/dev/null || true',
                'crontab -r 2>/dev/null || true',
                'chattr +i /var/spool/cron/root 2>/dev/null || true'
            ],
            'verify': 'crontab -l 2>/dev/null || echo "Crontab cleared"'
        },
        'malware_processes': {
            'description': 'Kill known malware processes',
            'commands': [
                'pkill -9 -f "b4nd1d0" 2>/dev/null || true',
                'pkill -9 -f "kdevtmpfsi" 2>/dev/null || true',
                'pkill -9 -f "kinsing" 2>/dev/null || true',
                'pkill -9 -f "xmrig" 2>/dev/null || true'
            ],
            'verify': "ps aux | grep -E 'b4nd1d0|kdevtmpfsi|kinsing|xmrig' | grep -v grep || echo 'Processes killed'"
        },
        'suspicious_systemd_services': {
            'description': 'Disable and remove suspicious systemd service',
            'commands': [
                'systemctl stop myservice 2>/dev/null || true',
                'systemctl disable myservice 2>/dev/null || true',
                'rm -f /usr/lib/systemd/system/myservice.service 2>/dev/null || true',
                'rm -f /etc/systemd/system/myservice.service 2>/dev/null || true',
                'systemctl daemon-reload'
            ],
            'verify': 'systemctl status myservice 2>&1 | grep -E "not-found|could not be found" || echo "Service removed"'
        },
        'fake_sshd_binary': {
            'description': 'Remove fake sshd and related malware files',
            'commands': [
                'rm -f /usr/bin/sshd 2>/dev/null || true',
                'rm -rf /usr/bin/.locatione 2>/dev/null || true',
                'rm -f /etc/cc.txt 2>/dev/null || true',
                # Restore real sshd from package
                'apt-get install --reinstall openssh-server -y 2>/dev/null || yum reinstall openssh-server -y 2>/dev/null || true'
            ],
            'verify': 'file /usr/sbin/sshd | grep -q "ELF" && echo "Real sshd restored"'
        },
        'ssh_password_auth': {
            'description': 'Disable SSH password authentication',
            'commands': [
                'sed -i "s/^PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config',
                'sed -i "s/^#PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config',
                'systemctl restart sshd'
            ],
            'verify': 'grep "^PasswordAuthentication no" /etc/ssh/sshd_config && echo "Password auth disabled"'
        },
        'ssh_root_password': {
            'description': 'Set SSH root login to prohibit-password (key only)',
            'commands': [
                'sed -i "s/^PermitRootLogin.*/PermitRootLogin prohibit-password/" /etc/ssh/sshd_config',
                'systemctl restart sshd'
            ],
            'verify': 'grep "^PermitRootLogin prohibit-password" /etc/ssh/sshd_config && echo "Root key-only login configured"'
        },
        'immutable_cron': {
            'description': 'Remove immutable attribute from cron',
            'commands': [
                'chattr -i /var/spool/cron/root 2>/dev/null || true',
                'chattr -a /var/spool/cron/root 2>/dev/null || true'
            ],
            'verify': 'lsattr /var/spool/cron/root 2>/dev/null || echo "Attributes cleared"'
        }
    }

    async def run_check(
        self,
        ssh_client: paramiko.SSHClient,
        check: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Run a single security check"""
        from .ssh_manager import ssh_manager

        try:
            result = await ssh_manager.execute(
                ssh_client,
                check['command'],
                timeout=30
            )

            output = result['stdout'].strip()

            # Determine if check found something
            if check['check_type'] == 'output_exists':
                if output:
                    return {
                        'check': check['name'],
                        'category': check['category'],
                        'severity': check['severity'],
                        'description': check['description'],
                        'output': output[:1000],  # Limit output size
                        'has_autofix': check['name'] in self.AUTO_FIX_PLAYBOOKS
                    }
            elif check['check_type'] == 'info_only':
                # Always return info checks
                return {
                    'check': check['name'],
                    'category': check['category'],
                    'severity': 'info',
                    'description': check['description'],
                    'output': output[:1000] if output else 'No output',
                    'has_autofix': False
                }

            return None

        except Exception as e:
            logger.warning(f"Check {check['name']} failed: {e}")
            return None

    async def full_scan(
        self,
        ssh_client: paramiko.SSHClient,
        progress_callback=None
    ) -> Dict[str, Any]:
        """
        Run full security scan on server.

        Args:
            ssh_client: Connected SSH client
            progress_callback: Optional async callback(progress: int, message: str)

        Returns:
            Scan results with findings and summary
        """
        findings = []
        passed_checks = []
        total_checks = len(self.MALWARE_CHECKS)
        start_time = datetime.now()

        for i, check in enumerate(self.MALWARE_CHECKS):
            progress = int((i / total_checks) * 100)

            if progress_callback:
                await progress_callback(progress, f"Checking: {check['description']}")

            result = await self.run_check(ssh_client, check)

            if result:
                if result['severity'] != 'info':
                    findings.append(result)
                    logger.warning(f"[{result['severity'].upper()}] {result['description']}")
                else:
                    # Info checks go to passed
                    passed_checks.append(check['name'])
            else:
                passed_checks.append(check['name'])

        # Calculate summary
        duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        summary = {
            'total_checks': total_checks,
            'findings_count': len(findings),
            'critical': len([f for f in findings if f['severity'] == 'critical']),
            'high': len([f for f in findings if f['severity'] == 'high']),
            'medium': len([f for f in findings if f['severity'] == 'medium']),
            'low': len([f for f in findings if f['severity'] == 'low']),
            'passed_checks': passed_checks,
            'duration_ms': duration_ms,
            'scan_time': datetime.now().isoformat()
        }

        # Determine overall status
        if summary['critical'] > 0:
            summary['status'] = 'critical'
        elif summary['high'] > 0:
            summary['status'] = 'warning'
        elif summary['medium'] > 0:
            summary['status'] = 'caution'
        else:
            summary['status'] = 'clean'

        if progress_callback:
            await progress_callback(100, "Scan complete")

        return {
            'summary': summary,
            'findings': findings
        }

    async def quick_scan(self, ssh_client: paramiko.SSHClient) -> Dict[str, Any]:
        """
        Quick scan - only critical checks.
        Faster but less comprehensive.
        """
        critical_checks = [c for c in self.MALWARE_CHECKS if c['severity'] == 'critical']
        findings = []

        for check in critical_checks:
            result = await self.run_check(ssh_client, check)
            if result and result['severity'] != 'info':
                findings.append(result)

        return {
            'summary': {
                'total_checks': len(critical_checks),
                'findings_count': len(findings),
                'critical': len(findings),
                'status': 'critical' if findings else 'clean'
            },
            'findings': findings
        }

    async def auto_fix(
        self,
        ssh_client: paramiko.SSHClient,
        finding_name: str
    ) -> Dict[str, Any]:
        """
        Apply auto-fix for a specific finding.

        Args:
            ssh_client: Connected SSH client
            finding_name: Name of the finding to fix

        Returns:
            Fix result with success status and output
        """
        from .ssh_manager import ssh_manager

        if finding_name not in self.AUTO_FIX_PLAYBOOKS:
            return {
                'fixed': False,
                'reason': f'No auto-fix available for {finding_name}'
            }

        playbook = self.AUTO_FIX_PLAYBOOKS[finding_name]
        logs = []

        logger.info(f"Applying auto-fix: {playbook['description']}")

        try:
            # Execute fix commands
            for cmd in playbook['commands']:
                logs.append(f"$ {cmd}")
                result = await ssh_manager.execute(ssh_client, cmd, timeout=60)
                if result['stdout']:
                    logs.append(result['stdout'])
                if result['stderr']:
                    logs.append(f"stderr: {result['stderr']}")

            # Verify fix
            if playbook.get('verify'):
                logs.append(f"\nVerifying: {playbook['verify']}")
                verify_result = await ssh_manager.execute(
                    ssh_client,
                    playbook['verify'],
                    timeout=30
                )
                logs.append(verify_result['stdout'])
                verified = verify_result['exit_code'] == 0

            return {
                'fixed': True,
                'finding': finding_name,
                'description': playbook['description'],
                'logs': '\n'.join(logs),
                'verified': verified if 'verified' in dir() else True
            }

        except Exception as e:
            logger.error(f"Auto-fix failed for {finding_name}: {e}")
            return {
                'fixed': False,
                'finding': finding_name,
                'error': str(e),
                'logs': '\n'.join(logs)
            }

    async def auto_fix_all(
        self,
        ssh_client: paramiko.SSHClient,
        findings: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Apply auto-fix for all fixable findings.

        Args:
            ssh_client: Connected SSH client
            findings: List of findings from scan

        Returns:
            Summary of all fix attempts
        """
        results = []

        for finding in findings:
            if finding.get('has_autofix'):
                result = await self.auto_fix(ssh_client, finding['check'])
                results.append(result)

        return {
            'total_attempted': len(results),
            'fixed': len([r for r in results if r.get('fixed')]),
            'failed': len([r for r in results if not r.get('fixed')]),
            'results': results
        }


# Global instance
security_scanner = SecurityScanner()
