# 🗺️ ASEMB Database Creation Guide

## 🎯 Quick Setup

### Option 1: Using psql command line

```bash
# Set password
export PGPASSWORD='Semsiye!22'

# Create database
psql -h 91.99.229.96 -U postgres -c "CREATE DATABASE asemb;"

# Connect and enable pgvector
psql -h 91.99.229.96 -U postgres -d asemb -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Option 2: Using pgAdmin or DBeaver

1. Connect to: `91.99.229.96:5432` with user `postgres`
2. Run:
```sql
CREATE DATABASE asemb;
```

3. Connect to `asemb` database
4. Run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Option 3: Using the batch script

```bash
cd C:\xampp\htdocs\alice-semantic-bridge\scripts
setup-asemb-db.bat
```

## 📊 Database Schema

After creating the database, run this to create tables:

```sql
-- Connect to asemb first!

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    source_id VARCHAR(255) UNIQUE NOT NULL,
    title TEXT,
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chunks table with embeddings
CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, chunk_index)
);

-- Create indexes
CREATE INDEX idx_documents_source_id ON documents(source_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);
```

## ✅ Verification

Check if everything is set up:

```sql
-- List databases
\l

-- Check if connected to asemb
SELECT current_database();

-- Check pgvector
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- Check tables
\dt
```

## 🔧 Terminal Agents Configuration

Once database is created, terminal agents should be able to connect with:
- Host: `91.99.229.96`
- Port: `5432`
- Database: `asemb`
- User: `postgres`
- Password: `Semsiye!22`

---

**Note**: pgvector is already installed on the server (version 0.8.0), so you just need to create the database and enable the extension!