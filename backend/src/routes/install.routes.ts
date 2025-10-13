import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// Check if this is a fresh installation
router.get('/check', async (req: Request, res: Response) => {
  try {
    const installFlag = path.join(process.cwd(), 'install.flag');
    const isFreshInstall = !fs.existsSync(installFlag);

    res.json({
      isFreshInstall,
      projects: [
        { domain: 'lsemb.luwi.dev', name: 'lsemb', type: 'development' },
        { domain: 'musavir.luwi.dev', name: 'musavir', type: 'customer' },
        { domain: 'cocuk.luwi.dev', name: 'cocuk', type: 'customer' },
        { domain: 'emlak.luwi.dev', name: 'emlak', type: 'customer' }
      ]
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Install selected projects
router.post('/install', async (req: Request, res: Response) => {
  try {
    const { projects, globalSettings, apiKeys } = req.body;

    // Create installation log
    const logFile = path.join(process.cwd(), 'install.log');
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    const log = (message: string) => {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] ${message}\n`;
      logStream.write(logMessage);
      console.log(message);
    };

    log('Starting multi-project installation...');
    log(`Projects to install: ${projects.join(', ')}`);

    // Create main install script
    const installScript = `
#!/bin/bash
set -e

BASE_DIR="/var/www"
LOG_FILE="${logFile}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to install a single project
install_project() {
    local domain=$1
    local name=$2
    local type=$3
    local project_dir="$BASE_DIR/$domain"

    log "Installing $domain..."

    # Create project directory
    mkdir -p "$project_dir"
    cd "$project_dir"

    # Clone repository if not exists
    if [ ! -d ".git" ]; then
        log "Cloning repository for $domain"
        git clone https://github.com/umutsun/asemb.git .
    fi

    # Create environment file
    log "Creating environment for $domain"
    cat > .env.$name << EOF
NODE_ENV=production
PROJECT_NAME=$name
DOMAIN=$domain
POSTGRES_DB=${domain//./_}
POSTGRES_USER=${domain//./_}
POSTGRES_PASSWORD=$(openssl rand -base64 32)
SERVER_PORT=8083
FRONTEND_PORT=3002
EOF

    # Create database
    log "Creating database for $domain"
    PGPASSWORD="${globalSettings.dbAdminPassword}" psql -h "${globalSettings.dbHost}" -p "${globalSettings.dbPort}" -U postgres -c "CREATE DATABASE ${domain//./_};" || true
    PGPASSWORD="${globalSettings.dbAdminPassword}" psql -h "${globalSettings.dbHost}" -p "${globalSettings.dbPort}" -U postgres -c "CREATE USER ${domain//./_} WITH PASSWORD '$(cat .env.$name | grep POSTGRES_PASSWORD | cut -d'=' -f2)';" || true
    PGPASSWORD="${globalSettings.dbAdminPassword}" psql -h "${globalSettings.dbHost}" -p "${globalSettings.dbPort}" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE ${domain//./_} TO ${domain//./_};" || true

    # Install dependencies
    log "Installing dependencies for $domain"
    cd backend && npm ci --production
    cd ../frontend && npm ci

    # Build frontend
    log "Building frontend for $domain"
    npm run build

    # Create PM2 config
    log "Creating PM2 config for $domain"
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: '${name}-backend',
      script: 'src/server.ts',
      cwd: './backend',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      env: {
        NODE_ENV: 'production',
        PROJECT_NAME: '${name}',
        DOMAIN: '${domain}'
      }
    },
    {
      name: '${name}-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: './frontend',
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL: 'https://${domain}'
      }
    }
  ]
};
EOF

    # Start services
    log "Starting services for $domain"
    pm2 start ecosystem.config.js

    # Create nginx config
    log "Creating nginx config for $domain"
    cat > /etc/nginx/sites-available/$domain.conf << NGINXEOF
server {
    listen 80;
    server_name $domain www.$domain;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $domain www.$domain;

    ssl_certificate /etc/letsencrypt/live/$domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXEOF

    # Enable site
    ln -sf /etc/nginx/sites-available/$domain.conf /etc/nginx/sites-enabled/

    # Generate SSL certificate
    log "Generating SSL certificate for $domain"
    certbot --nginx -d $domain -d www.$domain --non-interactive --agree-tos --email admin@luwi.dev || true

    log "$domain installed successfully!"
}

# Install each project
`;

    // Add each project to script
    projects.forEach((project: any) => {
      const projectType = projects.find((p: any) => p.domain === project)?.type || 'customer';
      installScript += `install_project ${project} ${project.split('.')[0]} ${projectType}\n\n`;
    });

    // Add final steps
    installScript += `
# Save PM2 configuration
pm2 save

# Restart nginx
systemctl restart nginx

# Create install complete flag
touch "${path.join(process.cwd(), 'install.flag')}"

log "All installations completed!"
`;

    // Write install script
    const scriptPath = path.join(process.cwd(), 'install-projects.sh');
    fs.writeFileSync(scriptPath, installScript);
    fs.chmodSync(scriptPath, '755');

    // Execute script
    log('Executing installation script...');
    exec(`bash ${scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        log(`Installation error: ${error.message}`);
        logStream.end();
        return res.status(500).json({ error: error.message });
      }

      log(stdout);
      logStream.end();

      // Save admin and API key settings
      projects.forEach((project: any) => {
        const projectName = project.split('.')[0];
        const settingsPath = path.join(`/var/www/${project}`, 'settings.json');

        fs.writeFileSync(settingsPath, JSON.stringify({
          admin: {
            email: globalSettings.adminEmail,
            password: globalSettings.adminPassword,
            firstName: globalSettings.adminFirstName,
            lastName: globalSettings.adminLastName
          },
          apiKeys: apiKeys
        }, null, 2));
      });

      res.json({
        success: true,
        message: 'Installation completed successfully',
        projects: projects
      });
    });

  } catch (error: any) {
    console.error('Installation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get installation status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const logFile = path.join(process.cwd(), 'install.log');

    if (fs.existsSync(logFile)) {
      const logs = fs.readFileSync(logFile, 'utf8').split('\n').filter(line => line);
      res.json({ logs });
    } else {
      res.json({ logs: [] });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;