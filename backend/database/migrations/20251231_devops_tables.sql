-- DevOps Dashboard Tables Migration
-- Created: 2025-12-31
-- Purpose: Support for DevOps Dashboard features (SSH management, deployments, security scans)

-- ============================================
-- 1. SSH Keys Table (Encrypted Storage)
-- ============================================
CREATE TABLE IF NOT EXISTS devops_ssh_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    private_key_encrypted TEXT NOT NULL,  -- AES-256 encrypted
    public_key TEXT NOT NULL,
    passphrase_encrypted TEXT,            -- AES-256 encrypted (optional)
    fingerprint VARCHAR(100),             -- SHA256 fingerprint
    key_type VARCHAR(20) DEFAULT 'rsa',   -- rsa, ed25519, ecdsa
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT unique_user_key_name UNIQUE (user_id, name)
);

-- Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_devops_ssh_keys_user ON devops_ssh_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_devops_ssh_keys_active ON devops_ssh_keys(is_active) WHERE is_active = true;

COMMENT ON TABLE devops_ssh_keys IS 'Encrypted SSH private keys for remote server access';
COMMENT ON COLUMN devops_ssh_keys.private_key_encrypted IS 'AES-256 encrypted private key using DEVOPS_ENCRYPTION_KEY';

-- ============================================
-- 2. Servers Table
-- ============================================
CREATE TABLE IF NOT EXISTS devops_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    hostname VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),               -- IPv4 or IPv6
    ssh_port INTEGER DEFAULT 22,
    ssh_user VARCHAR(50) DEFAULT 'root',
    ssh_key_id UUID REFERENCES devops_ssh_keys(id) ON DELETE SET NULL,
    server_type VARCHAR(50) DEFAULT 'production',  -- production, staging, development
    os_info VARCHAR(100),                 -- e.g., "Ubuntu 22.04 LTS"
    metadata JSONB DEFAULT '{}',          -- Additional config data
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_connected_at TIMESTAMP WITH TIME ZONE,
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_status VARCHAR(20) DEFAULT 'unknown',  -- online, offline, error, unknown
    CONSTRAINT unique_user_server_name UNIQUE (user_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devops_servers_user ON devops_servers(user_id);
CREATE INDEX IF NOT EXISTS idx_devops_servers_active ON devops_servers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_devops_servers_health ON devops_servers(health_status);

COMMENT ON TABLE devops_servers IS 'Remote servers registered for DevOps management';

-- ============================================
-- 3. Server-Tenant Mapping
-- ============================================
CREATE TABLE IF NOT EXISTS devops_server_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES devops_servers(id) ON DELETE CASCADE,
    tenant_id VARCHAR(50) NOT NULL,       -- geolex, vergilex, bookie
    tenant_path VARCHAR(255) NOT NULL,    -- /var/www/geolex
    domain VARCHAR(255),                  -- geolex.luwi.dev
    backend_port INTEGER,                 -- 8084
    frontend_port INTEGER,                -- 4001
    python_port INTEGER,                  -- 8001
    pm2_services JSONB DEFAULT '[]',      -- ["geolex-backend", "geolex-frontend", "geolex-python"]
    environment JSONB DEFAULT '{}',       -- Environment variables
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_server_tenant UNIQUE (server_id, tenant_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_devops_server_tenants_server ON devops_server_tenants(server_id);
CREATE INDEX IF NOT EXISTS idx_devops_server_tenants_tenant ON devops_server_tenants(tenant_id);

COMMENT ON TABLE devops_server_tenants IS 'Maps tenants (applications) to their server configurations';

-- ============================================
-- 4. Command History & Audit Log
-- ============================================
CREATE TABLE IF NOT EXISTS devops_command_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    server_id UUID REFERENCES devops_servers(id) ON DELETE SET NULL,
    tenant_id VARCHAR(50),
    command TEXT NOT NULL,
    command_type VARCHAR(50) DEFAULT 'manual',  -- manual, deploy, security_scan, scheduled, auto_fix
    output TEXT,
    stderr TEXT,
    exit_code INTEGER,
    duration_ms INTEGER,
    is_dangerous BOOLEAN DEFAULT false,   -- Flag for dangerous commands
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devops_commands_user ON devops_command_history(user_id);
CREATE INDEX IF NOT EXISTS idx_devops_commands_server ON devops_command_history(server_id);
CREATE INDEX IF NOT EXISTS idx_devops_commands_type ON devops_command_history(command_type);
CREATE INDEX IF NOT EXISTS idx_devops_commands_executed ON devops_command_history(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_devops_commands_dangerous ON devops_command_history(is_dangerous) WHERE is_dangerous = true;

-- Partial index for recent commands (last 30 days)
CREATE INDEX IF NOT EXISTS idx_devops_commands_recent ON devops_command_history(executed_at DESC)
    WHERE executed_at > NOW() - INTERVAL '30 days';

COMMENT ON TABLE devops_command_history IS 'Audit log of all commands executed on remote servers';

-- ============================================
-- 5. Security Scans
-- ============================================
CREATE TABLE IF NOT EXISTS devops_security_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES devops_servers(id) ON DELETE CASCADE,
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    scan_type VARCHAR(50) NOT NULL DEFAULT 'full',  -- full, malware, rootkit, quick
    status VARCHAR(20) DEFAULT 'pending',           -- pending, running, completed, failed
    progress INTEGER DEFAULT 0,                      -- 0-100 percentage
    findings JSONB DEFAULT '[]',                     -- Array of findings
    summary JSONB DEFAULT '{}',                      -- Summary stats
    auto_fixes_applied JSONB DEFAULT '[]',           -- Applied auto-fixes
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devops_scans_server ON devops_security_scans(server_id);
CREATE INDEX IF NOT EXISTS idx_devops_scans_status ON devops_security_scans(status);
CREATE INDEX IF NOT EXISTS idx_devops_scans_started ON devops_security_scans(started_at DESC);

COMMENT ON TABLE devops_security_scans IS 'Security scan results and findings for servers';

-- ============================================
-- 6. Deployments
-- ============================================
CREATE TABLE IF NOT EXISTS devops_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES devops_servers(id) ON DELETE CASCADE,
    tenant_id VARCHAR(50) NOT NULL,
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deployment_type VARCHAR(50) NOT NULL,  -- full, backend, frontend, python, hotfix, rollback
    git_branch VARCHAR(100) DEFAULT 'main',
    git_commit_before VARCHAR(40),         -- Commit hash before deployment
    git_commit_after VARCHAR(40),          -- Commit hash after deployment
    status VARCHAR(20) DEFAULT 'pending',  -- pending, running, success, failed, rolled_back
    progress INTEGER DEFAULT 0,            -- 0-100 percentage
    current_step VARCHAR(100),             -- Current deployment step
    logs TEXT,                             -- Full deployment logs
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    rollback_of UUID REFERENCES devops_deployments(id),  -- If this is a rollback
    metadata JSONB DEFAULT '{}'            -- Additional deployment data
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devops_deployments_server ON devops_deployments(server_id);
CREATE INDEX IF NOT EXISTS idx_devops_deployments_tenant ON devops_deployments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devops_deployments_status ON devops_deployments(status);
CREATE INDEX IF NOT EXISTS idx_devops_deployments_started ON devops_deployments(started_at DESC);

-- Partial index for recent deployments
CREATE INDEX IF NOT EXISTS idx_devops_deployments_recent ON devops_deployments(started_at DESC)
    WHERE started_at > NOW() - INTERVAL '7 days';

COMMENT ON TABLE devops_deployments IS 'Deployment history and status tracking';

-- ============================================
-- 7. Alerts Table (Optional - can use Redis only)
-- ============================================
CREATE TABLE IF NOT EXISTS devops_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID REFERENCES devops_servers(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,       -- resource, security, service, connection, bruteforce
    severity VARCHAR(20) NOT NULL,         -- critical, high, medium, low
    title VARCHAR(255) NOT NULL,
    message TEXT,
    metadata JSONB DEFAULT '{}',
    is_acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE   -- Auto-dismiss after expiration
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devops_alerts_server ON devops_alerts(server_id);
CREATE INDEX IF NOT EXISTS idx_devops_alerts_severity ON devops_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_devops_alerts_unacked ON devops_alerts(is_acknowledged) WHERE is_acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_devops_alerts_created ON devops_alerts(created_at DESC);

COMMENT ON TABLE devops_alerts IS 'Server alerts and notifications';

-- ============================================
-- 8. Default Server Configuration (Optional)
-- ============================================
-- Insert default production server if not exists
-- This is commented out - uncomment and modify for your setup
/*
INSERT INTO devops_servers (id, user_id, name, hostname, ip_address, ssh_port, ssh_user, server_type, os_info)
SELECT
    gen_random_uuid(),
    (SELECT id FROM users WHERE email = 'admin@luwi.dev' LIMIT 1),
    'Luwi Production',
    '91.99.229.96',
    '91.99.229.96',
    22,
    'root',
    'production',
    'Ubuntu 22.04 LTS'
WHERE NOT EXISTS (
    SELECT 1 FROM devops_servers WHERE ip_address = '91.99.229.96'
);
*/

-- ============================================
-- Update Trigger for server_tenants
-- ============================================
CREATE OR REPLACE FUNCTION update_devops_server_tenants_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_devops_server_tenants ON devops_server_tenants;
CREATE TRIGGER trigger_update_devops_server_tenants
    BEFORE UPDATE ON devops_server_tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_devops_server_tenants_timestamp();

-- ============================================
-- Verification Query
-- ============================================
-- Run this after migration to verify tables were created:
/*
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'devops_%'
ORDER BY table_name;
*/

-- ============================================
-- Rollback Script (if needed)
-- ============================================
/*
DROP TABLE IF EXISTS devops_alerts CASCADE;
DROP TABLE IF EXISTS devops_deployments CASCADE;
DROP TABLE IF EXISTS devops_security_scans CASCADE;
DROP TABLE IF EXISTS devops_command_history CASCADE;
DROP TABLE IF EXISTS devops_server_tenants CASCADE;
DROP TABLE IF EXISTS devops_servers CASCADE;
DROP TABLE IF EXISTS devops_ssh_keys CASCADE;
DROP FUNCTION IF EXISTS update_devops_server_tenants_timestamp();
*/
