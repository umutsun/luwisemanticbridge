-- Create test users for all tenants
-- Password for all users: admin123
-- Bcrypt hash: $2b$12$ZK8ReaD4UW/b/CPdvwUcAO1pPWBPEfmoZv5bC4vHO.3/4w4Iv2Pwm

-- LSEMB Test User
\c lsemb;
DELETE FROM users WHERE email = 'admin@lsemb.com';
INSERT INTO users (username, email, password, name, role, status, email_verified, created_at, updated_at)
VALUES ('admin', 'admin@lsemb.com', '$2b$12$ZK8ReaD4UW/b/CPdvwUcAO1pPWBPEfmoZv5bC4vHO.3/4w4Iv2Pwm', 'LSEMB Admin', 'admin', 'active', TRUE, NOW(), NOW());

-- EmlakAI Test User (if database exists)
\c emlakai_lsemb;
DELETE FROM users WHERE email = 'admin@emlakai.com';
INSERT INTO users (username, email, password, name, role, status, email_verified, created_at, updated_at)
VALUES ('admin', 'admin@emlakai.com', '$2b$12$ZK8ReaD4UW/b/CPdvwUcAO1pPWBPEfmoZv5bC4vHO.3/4w4Iv2Pwm', 'EmlakAI Admin', 'admin', 'active', TRUE, NOW(), NOW());

-- Bookie Test User (if database exists)
\c bookie_lsemb;
DELETE FROM users WHERE email = 'admin@bookie.com';
INSERT INTO users (username, email, password, name, role, status, email_verified, created_at, updated_at)
VALUES ('admin', 'admin@bookie.com', '$2b$12$ZK8ReaD4UW/b/CPdvwUcAO1pPWBPEfmoZv5bC4vHO.3/4w4Iv2Pwm', 'Bookie Admin', 'admin', 'active', TRUE, NOW(), NOW());

-- Display created users
\c lsemb;
SELECT username, email, role FROM users WHERE email LIKE '%@lsemb.com';

\echo 'Test users created successfully!'
\echo 'Login with: email: admin@[tenant].com, password: admin123'