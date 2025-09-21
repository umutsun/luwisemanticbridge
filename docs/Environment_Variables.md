# Environment Variables

This document lists and describes the environment variables required to run the Alice Semantic Bridge (ASB) project. These variables are typically defined in a `.env` file in the project's root directory.

## Main Services

### PostgreSQL (`postgres`)

| Variable            | Description                                       | Required | Example Value                |
| ------------------- | ------------------------------------------------- | -------- | ---------------------------- |
| `POSTGRES_USER`     | The username for the PostgreSQL database.         | Yes      | `asemb_user`                 |
| `POSTGRES_PASSWORD` | The password for the PostgreSQL user.             | Yes      | `your_secure_password_here`  |
| `POSTGRES_DB`       | The name of the database to be created.           | Yes      | `asemb`                      |

### Redis (`redis`)

| Variable         | Description                               | Required | Example Value        |
| ---------------- | ----------------------------------------- | -------- | -------------------- |
| `REDIS_PASSWORD` | The password for the Redis instance.      | Yes      | `sprint_MVP_2025!`   |

### Backend API (`api`)

These variables are crucial for the backend service to connect to other services.

| Variable            | Description                                                | Required | Example Value                |
| ------------------- | ---------------------------------------------------------- | -------- | ---------------------------- |
| `NODE_ENV`          | The runtime environment.                                   | Yes      | `development`                |
| `PORT`              | The port on which the backend server will run.             | Yes      | `3000`                       |
| `POSTGRES_HOST`     | The hostname of the PostgreSQL service.                    | Yes      | `postgres`                   |
| `REDIS_HOST`        | The hostname of the Redis service.                         | Yes      | `redis`                      |
| `REDIS_PASSWORD`    | The password for the Redis instance.                       | Yes      | `sprint_MVP_2025!`           |
| `POSTGRES_USER`     | The username for the PostgreSQL database.                  | Yes      | `asemb_user`                 |
| `POSTGRES_PASSWORD` | The password for the PostgreSQL user.                      | Yes      | `your_secure_password_here`  |
| `POSTGRES_DB`       | The name of the database.                                  | Yes      | `asemb`                      |
| `NEO4J_URI`         | The connection URI for the Neo4j graph database.           | No       | `bolt://neo4j:7687`          |
| `OPENAI_API_KEY`    | **[IMPORTANT]** API key for OpenAI services (for embeddings). | Yes      | `sk-xxxxxxxxxxxxxxxxxxxx`    |

### Next.js Dashboard (`dashboard`)

| Variable             | Description                                           | Required | Example Value           |
| -------------------- | ----------------------------------------------------- | -------- | ----------------------- |
| `NODE_ENV`           | The runtime environment.                              | Yes      | `development`           |
| `NEXT_PUBLIC_API_URL`| The public URL of the backend API for the frontend.   | Yes      | `http://api:3000`       |

## Optional Services

### Neo4j (`neo4j`)

| Variable      | Description                               | Required | Example Value           |
| ------------- | ----------------------------------------- | -------- | ----------------------- |
| `NEO4J_AUTH`  | The authentication details for Neo4j.     | Yes      | `neo4j/your_neo4j_password` |

### n8n (`n8n`)

| Variable                | Description                               | Required | Example Value        |
| ----------------------- | ----------------------------------------- | -------- | -------------------- |
| `N8N_BASIC_AUTH_ACTIVE` | Enables basic authentication.             | Yes      | `true`               |
| `N8N_BASIC_AUTH_USER`   | The username for n8n basic auth.          | Yes      | `admin`              |
| `N8N_BASIC_AUTH_PASSWORD` | The password for n8n basic auth.          | Yes      | `admin`              |
| `DB_TYPE`               | The database type for n8n.                | Yes      | `redis`              |
| `DB_REDIS_HOST`         | The hostname of the Redis service for n8n.| Yes      | `asemb-redis`        |
| `DB_REDIS_PASSWORD`     | The password for the Redis instance.      | Yes      | `sprint_MVP_2025!`   |
