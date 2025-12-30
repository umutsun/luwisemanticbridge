"""
SSH Manager Service
Handles SSH connections, key encryption, and command execution
"""

import os
import io
import asyncio
from typing import Optional, Dict, Any, Tuple
from datetime import datetime
from loguru import logger

import paramiko
from cryptography.fernet import Fernet, InvalidToken


class SSHManager:
    """
    Manages SSH connections to remote servers.
    Features:
    - AES-256 encryption for stored private keys
    - Connection pooling (reuse connections)
    - Async command execution
    - Timeout handling
    """

    def __init__(self):
        self.connections: Dict[str, paramiko.SSHClient] = {}  # server_id -> SSHClient
        self.encryption_key = os.getenv('DEVOPS_ENCRYPTION_KEY')
        self.fernet: Optional[Fernet] = None

        if self.encryption_key:
            try:
                self.fernet = Fernet(self.encryption_key.encode() if isinstance(self.encryption_key, str) else self.encryption_key)
                logger.info("SSH Manager initialized with encryption key")
            except Exception as e:
                logger.warning(f"Invalid encryption key format: {e}")
        else:
            logger.warning("DEVOPS_ENCRYPTION_KEY not set - SSH key encryption disabled")

    def decrypt_key(self, encrypted_key: str) -> str:
        """Decrypt stored SSH private key"""
        if not self.fernet:
            raise ValueError("Encryption key not configured. Set DEVOPS_ENCRYPTION_KEY environment variable.")

        try:
            decrypted = self.fernet.decrypt(encrypted_key.encode())
            return decrypted.decode('utf-8')
        except InvalidToken:
            raise ValueError("Failed to decrypt key - invalid token or corrupted data")

    def encrypt_key(self, private_key: str) -> str:
        """Encrypt SSH private key for storage"""
        if not self.fernet:
            raise ValueError("Encryption key not configured. Set DEVOPS_ENCRYPTION_KEY environment variable.")

        encrypted = self.fernet.encrypt(private_key.encode('utf-8'))
        return encrypted.decode('utf-8')

    def get_key_fingerprint(self, public_key: str) -> str:
        """Calculate SSH key fingerprint (SHA256)"""
        import hashlib
        import base64

        try:
            # Parse the public key
            parts = public_key.strip().split()
            if len(parts) >= 2:
                key_data = base64.b64decode(parts[1])
                fingerprint = hashlib.sha256(key_data).digest()
                return "SHA256:" + base64.b64encode(fingerprint).decode('utf-8').rstrip('=')
        except Exception as e:
            logger.warning(f"Failed to calculate fingerprint: {e}")

        return "unknown"

    def detect_key_type(self, private_key: str) -> str:
        """Detect SSH key type from private key content"""
        if "RSA PRIVATE KEY" in private_key or "rsa" in private_key.lower():
            return "rsa"
        elif "ED25519 PRIVATE KEY" in private_key:
            return "ed25519"
        elif "ECDSA PRIVATE KEY" in private_key:
            return "ecdsa"
        elif "DSA PRIVATE KEY" in private_key:
            return "dsa"
        else:
            return "unknown"

    def load_private_key(self, private_key_content: str, passphrase: Optional[str] = None) -> paramiko.PKey:
        """Load private key from string content, auto-detecting key type"""
        key_file = io.StringIO(private_key_content)
        password = passphrase.encode() if passphrase else None

        # Try different key types
        key_loaders = [
            (paramiko.RSAKey, "RSA"),
            (paramiko.Ed25519Key, "Ed25519"),
            (paramiko.ECDSAKey, "ECDSA"),
            (paramiko.DSSKey, "DSS"),
        ]

        for key_class, key_name in key_loaders:
            try:
                key_file.seek(0)
                return key_class.from_private_key(key_file, password=password)
            except (paramiko.SSHException, ValueError):
                continue

        raise ValueError("Unable to load private key - unsupported key type or invalid format")

    async def connect(
        self,
        hostname: str,
        private_key: str,
        username: str = "root",
        port: int = 22,
        passphrase: Optional[str] = None,
        timeout: int = 30,
        server_id: Optional[str] = None
    ) -> paramiko.SSHClient:
        """
        Establish SSH connection to server.

        Args:
            hostname: Server hostname or IP
            private_key: Decrypted private key content
            username: SSH username (default: root)
            port: SSH port (default: 22)
            passphrase: Key passphrase if encrypted
            timeout: Connection timeout in seconds
            server_id: Optional server ID for connection caching

        Returns:
            Connected SSHClient instance
        """
        # Check for cached connection
        if server_id and server_id in self.connections:
            client = self.connections[server_id]
            if client.get_transport() and client.get_transport().is_active():
                logger.debug(f"Reusing cached connection for server {server_id}")
                return client
            else:
                # Connection died, remove from cache
                del self.connections[server_id]

        # Create new connection
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            # Load private key
            pkey = self.load_private_key(private_key, passphrase)

            # Run connect in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: client.connect(
                    hostname=hostname,
                    port=port,
                    username=username,
                    pkey=pkey,
                    timeout=timeout,
                    allow_agent=False,
                    look_for_keys=False
                )
            )

            logger.info(f"Connected to {username}@{hostname}:{port}")

            # Cache connection if server_id provided
            if server_id:
                self.connections[server_id] = client

            return client

        except paramiko.AuthenticationException as e:
            logger.error(f"Authentication failed for {username}@{hostname}: {e}")
            raise ValueError(f"SSH authentication failed: {e}")
        except paramiko.SSHException as e:
            logger.error(f"SSH error connecting to {hostname}: {e}")
            raise ConnectionError(f"SSH connection error: {e}")
        except Exception as e:
            logger.error(f"Failed to connect to {hostname}: {e}")
            raise

    async def execute(
        self,
        client: paramiko.SSHClient,
        command: str,
        timeout: int = 60,
        get_pty: bool = False
    ) -> Dict[str, Any]:
        """
        Execute command on remote server.

        Args:
            client: Connected SSHClient
            command: Command to execute
            timeout: Command timeout in seconds
            get_pty: Request a pseudo-terminal (for interactive commands)

        Returns:
            Dict with stdout, stderr, exit_code, duration_ms
        """
        start_time = datetime.now()

        try:
            loop = asyncio.get_event_loop()

            # Execute command in thread pool
            def run_command():
                stdin, stdout, stderr = client.exec_command(
                    command,
                    timeout=timeout,
                    get_pty=get_pty
                )

                # Read output
                stdout_content = stdout.read().decode('utf-8', errors='replace')
                stderr_content = stderr.read().decode('utf-8', errors='replace')
                exit_code = stdout.channel.recv_exit_status()

                return stdout_content, stderr_content, exit_code

            stdout_content, stderr_content, exit_code = await loop.run_in_executor(
                None, run_command
            )

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            return {
                'stdout': stdout_content,
                'stderr': stderr_content,
                'exit_code': exit_code,
                'duration_ms': duration_ms,
                'success': exit_code == 0
            }

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            logger.error(f"Command execution failed: {e}")
            return {
                'stdout': '',
                'stderr': str(e),
                'exit_code': -1,
                'duration_ms': duration_ms,
                'success': False,
                'error': str(e)
            }

    async def execute_streaming(
        self,
        client: paramiko.SSHClient,
        command: str,
        callback,
        timeout: int = 300
    ):
        """
        Execute command with streaming output.
        Useful for long-running commands like builds.

        Args:
            client: Connected SSHClient
            command: Command to execute
            callback: Async function called with (line: str, is_stderr: bool)
            timeout: Overall timeout in seconds
        """
        try:
            transport = client.get_transport()
            channel = transport.open_session()
            channel.settimeout(timeout)
            channel.exec_command(command)

            # Read output line by line
            while not channel.exit_status_ready():
                # Check stdout
                if channel.recv_ready():
                    data = channel.recv(4096).decode('utf-8', errors='replace')
                    for line in data.splitlines():
                        await callback(line, False)

                # Check stderr
                if channel.recv_stderr_ready():
                    data = channel.recv_stderr(4096).decode('utf-8', errors='replace')
                    for line in data.splitlines():
                        await callback(line, True)

                await asyncio.sleep(0.1)

            # Get remaining output
            while channel.recv_ready():
                data = channel.recv(4096).decode('utf-8', errors='replace')
                for line in data.splitlines():
                    await callback(line, False)

            while channel.recv_stderr_ready():
                data = channel.recv_stderr(4096).decode('utf-8', errors='replace')
                for line in data.splitlines():
                    await callback(line, True)

            exit_code = channel.recv_exit_status()
            channel.close()

            return exit_code

        except Exception as e:
            logger.error(f"Streaming execution failed: {e}")
            raise

    async def test_connection(
        self,
        hostname: str,
        private_key: str,
        username: str = "root",
        port: int = 22,
        passphrase: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Test SSH connection and return server info.

        Returns:
            Dict with connection status and server details
        """
        try:
            client = await self.connect(
                hostname=hostname,
                private_key=private_key,
                username=username,
                port=port,
                passphrase=passphrase,
                timeout=15
            )

            # Get server info
            result = await self.execute(
                client,
                "echo 'Connected!' && hostname && uptime && uname -a"
            )

            # Get OS info
            os_result = await self.execute(
                client,
                "cat /etc/os-release 2>/dev/null | grep -E '^(NAME|VERSION)=' | head -2"
            )

            client.close()

            return {
                'success': True,
                'hostname': hostname,
                'output': result['stdout'],
                'os_info': os_result['stdout'].strip() if os_result['success'] else 'Unknown',
                'latency_ms': result['duration_ms']
            }

        except Exception as e:
            return {
                'success': False,
                'hostname': hostname,
                'error': str(e)
            }

    def close_connection(self, server_id: str):
        """Close and remove cached connection"""
        if server_id in self.connections:
            try:
                self.connections[server_id].close()
            except:
                pass
            del self.connections[server_id]
            logger.debug(f"Closed connection for server {server_id}")

    def close_all(self):
        """Close all cached connections"""
        for server_id in list(self.connections.keys()):
            self.close_connection(server_id)
        logger.info("Closed all SSH connections")


# Global instance
ssh_manager = SSHManager()
