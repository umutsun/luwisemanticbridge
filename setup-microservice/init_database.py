#!/usr/bin/env python3
"""
Database Schema Initialization Helper
Initializes LSEMB database schema for a project
"""

import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def init_schema(db_host, db_port, db_name, db_user, db_password):
    """Initialize database schema"""
    try:
        # Connect to the specific database
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            database=db_name,
            user=db_user,
            password=db_password
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()

        # SQL Schema
        schema_sql = """
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    status VARCHAR(50) DEFAULT 'active',
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    key VARCHAR(255) NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
);

-- Unified embeddings table
CREATE TABLE IF NOT EXISTS unified_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_type VARCHAR(50) NOT NULL,
    record_id VARCHAR(255),
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_unified_embeddings_record ON unified_embeddings(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_unified_embeddings_embedding ON unified_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
"""

        # Execute schema
        cur.execute(schema_sql)

        cur.close()
        conn.close()

        return True

    except Exception as e:
        print(f"Error initializing schema: {str(e)}")
        return False

if __name__ == '__main__':
    if len(sys.argv) != 6:
        print("Usage: python init_database.py <host> <port> <database> <user> <password>")
        sys.exit(1)

    host = sys.argv[1]
    port = sys.argv[2]
    database = sys.argv[3]
    user = sys.argv[4]
    password = sys.argv[5]

    if init_schema(host, port, database, user, password):
        print(f"✓ Schema initialized for {database}")
        sys.exit(0)
    else:
        print(f"✗ Failed to initialize schema for {database}")
        sys.exit(1)
