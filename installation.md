# Alice Semantic Bridge - Production Deployment Guide

This guide provides step-by-step instructions to deploy the Alice Semantic Bridge application on a CentOS/RHEL-based server using Docker behind a host Nginx reverse proxy. This is the recommended setup for servers hosting multiple websites.

## 1. Prerequisites

Ensure the following are installed and configured on your server:

- **Git:** For cloning the repository.
- **Docker & Docker Compose:** For running the application containers.
- **Nginx:** Installed directly on the host server to act as a reverse proxy.
- **Certbot:** For obtaining and managing free Let's Encrypt SSL certificates.
- **Firewall:** Ports `80` (HTTP) and `443` (HTTPS) must be open.
  ```bash
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --reload
  ```

## 2. Clone and Configure the Project

### Step 2.1: Clone the Repository
```bash
git clone https://github.com/umutsun/asemb.git
cd asemb
```

### Step 2.2: Create Environment File
Create a `.env.asemb` file and populate it with your credentials.

```bash
nano .env.asemb
```

Copy the template below, replacing placeholder values with secure credentials.

```ini
# .env.asemb
# PostgreSQL Settings
POSTGRES_USER=asemb_user
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=asemb

# Redis Settings
REDIS_PASSWORD=your_secure_redis_password

# Port Configuration (IMPORTANT - Current Setup)
FRONTEND_PORT=3002
BACKEND_PORT=8083
API_PORT=8083
WEBSOCKET_PORT=8083

# Database URL
DATABASE_URL=postgresql://postgres:your_secure_password_here@91.99.229.96:5432/asemb

# n8n Credentials
N8N_USER=admin
N8N_PASSWORD=your_secure_n8n_password
N8N_WEBHOOK_URL=https://asemb.luwi.dev/

# CORS Origin
CORS_ORIGIN=https://asemb.luwi.dev

# Grafana Credentials
GRAFANA_USER=admin
GRAFANA_PASSWORD=your_secure_grafana_password
```

## 3. Configure for Reverse Proxy

### Step 3.1: Modify Docker Compose Ports
To avoid conflicts with the host Nginx, we will run the application's Nginx container on different ports.

Edit the production Docker Compose file:
```bash
nano docker-compose.prod.yml
```

Find the `asemb-nginx` service and change its ports from `80:80` and `443:443` to `8088:80` and `8443:443`.

**Change this:**
```yaml
    ports:
      - "80:80"
      - "443:443"
```

**To this:**
```yaml
    ports:
      - "8088:80"
      - "8443:443"
```

### Step 3.2: Create Host Nginx Configuration
Now, we'll tell the main Nginx on the server to forward requests for `asemb.luwi.dev` to the Docker container.

Create a new Nginx configuration file:
```bash
nano /etc/nginx/conf.d/asemb.luwi.dev.conf
```

Paste the following configuration. This handles SSL and proxies requests to the Docker container.

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name asemb.luwi.dev;
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS reverse proxy to Docker
server {
    listen 443 ssl http2;
    server_name asemb.luwi.dev;

    # SSL Certificate paths (obtained via Certbot)
    ssl_certificate /etc/letsencrypt/live/asemb.luwi.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/asemb.luwi.dev/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8088; # Forward to the Docker container's port
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

### Step 3.3: Obtain SSL Certificate
Run Certbot to get a certificate for your domain. Certbot will automatically detect your new configuration file.
```bash
sudo certbot --nginx -d asemb.luwi.dev
```

## 4. Launch the Application

Start the services in the correct order.

### Step 4.1: Start the Host Nginx
Test and start the main Nginx service.
```bash
sudo nginx -t
sudo systemctl restart nginx
```

### Step 4.2: Start the Docker Application
Now, start the Docker containers.
```bash
# Ensure you are in the project directory
cd /path/to/asemb
docker-compose -f docker-compose.prod.yml --env-file .env.asemb up -d
```

## 5. Local Development Setup

For local development, you have multiple options:

### Option 1: Docker with Local Code (Recommended)
```bash
# Start only database services
docker-compose -f docker-compose.local.yml up -d postgres redis

# Start API locally
cd api
npm install
npm run dev

# Start frontend locally
cd frontend
npm install
npm run dev
```

### Option 2: Quick Start with Script
```bash
# Windows
scripts\local-dev.bat

# Or without Docker (using remote database)
scripts\dev-no-docker.bat
```

### Option 3: Full Docker Environment
```bash
# Using the development docker-compose
docker-compose -f docker-compose.dev.yml up -d
```

Access Points:
- Frontend: http://localhost:3002
- API: http://localhost:8083
- Database: localhost:5432
- Redis: localhost:6379

## 6. Configurable Port System

The application now supports configurable ports through environment variables:

### Frontend and Backend Ports
- Edit `.env.asemb` to set custom ports:
  ```ini
  FRONTEND_PORT=3000  # Default: 3000
  BACKEND_PORT=8083  # Default: 8083
  ```
- These ports are used by the frontend and backend containers
- The host Nginx configuration in step 3.2 automatically forwards to the correct ports

### Service Ports (Redis, PostgreSQL for migration)
Service ports can be configured through the dashboard settings:
1. Navigate to Settings → Service Configuration
2. Configure Redis and PostgreSQL migration ports
3. The application will automatically use these configurations

## 7. Updating the Application

To update the application after pushing changes to Git:

1.  Connect to your server and navigate to the project directory.
2.  Clean up Docker space if needed (recommended for large updates):
    ```bash
    ./cleanup-docker.sh
    ```
3.  Pull the latest code: `git pull`
4.  Rebuild and restart the containers:
    ```bash
    docker-compose -f docker-compose.prod.yml --env-file .env.asemb up -d --build
    ```

### For Frontend Updates Only
If only frontend changes were made, you can rebuild just the frontend:
```bash
docker-compose -f docker-compose.prod.yml build --no-cache frontend
docker-compose -f docker-compose.prod.yml up -d frontend
```

## 8. Troubleshooting Common Issues

- **502 Bad Gateway:** This means the host Nginx can't reach the Docker container.
  - Check if the Docker containers are running: `docker ps`.
  - Check the logs of the `asemb-frontend` container for errors: `docker logs asemb-frontend`.
  - **On CentOS/RHEL, this is often an SELinux issue.** Test by temporarily disabling it: `sudo setenforce 0`. If this works, you need to create a permanent rule: `sudo setsebool -P httpd_can_network_connect 1`.

- **Disk Space Issues During Build:**
  - Docker builds may fail with "no space left on device" error.
  - Run the cleanup script: `./cleanup-docker.sh`
  - This removes unused containers, images, and volumes, freeing up several GB of space.
  - For manual cleanup: `docker system prune -a -f`

- **Frontend Container "server.js not found":**
  - This happens when Next.js standalone output isn't properly configured.
  - Ensure you're using the updated Dockerfile.minimal
  - Rebuild with: `docker-compose -f docker-compose.prod.yml build --no-cache frontend`

- **Host Nginx Fails to Start or `asemb-nginx` container fails with `Address already in use`:**
  - This means another process is using port 80/443. This is often the host's own Nginx service.
  - **IMPORTANT:** After a `git pull`, your changes to `docker-compose.prod.yml` (like changing the ports to `8088:80`) may be overwritten. If you see this error, **re-edit the `docker-compose.prod.yml` file** as described in Step 3.1 to ensure the ports are set to `8088:80` and `8443:443`.
  - To fix, stop all services (`docker-compose down` and `systemctl stop nginx`) and start them in the correct order (host Nginx first, then Docker).
  - **Syntax Errors:** Always run `sudo nginx -t` after making changes. For detailed errors, check the journal: `sudo journalctl -xeu nginx.service`.

- **Application Container is `Restarting`:**
  - The application is crashing. Check its logs for errors: `docker logs <container_name>`.
  - A common cause is a missing Node.js dependency. Add the package locally (`npm install <package> --save`), push the `package.json` and `package-lock.json` files to Git, then pull and rebuild on the server.