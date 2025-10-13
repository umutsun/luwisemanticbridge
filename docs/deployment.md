# LSEMB Deployment Guide

## Deployment Options

### 1. Docker Compose (Recommended for Single Server)
Best for: Development, testing, small-scale production

### 2. Kubernetes (Recommended for Scale)
Best for: Multi-tenant production, high availability

### 3. Cloud Services
Best for: Managed infrastructure, auto-scaling

## Docker Compose Deployment

### Quick Start
```bash
# Clone repository
git clone https://github.com/yourusername/lsemb.git
cd lsemb

# Configure environment
cp .env.lsemb.example .env.lsemb
# Edit .env.lsemb with production values

# Start all services
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

### Production Configuration

**docker-compose.prod.yml:**
```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: always
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

  redis:
    image: redis:7-alpine
    restart: always
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 2gb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G

  api:
    image: lsemb/api:latest
    restart: always
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
    env_file:
      - .env.lsemb
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api

secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
```

### SSL/TLS Configuration

**nginx.conf:**
```nginx
upstream api_backend {
    least_conn;
    server api:8000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name lsemb.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name lsemb.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location /api/ {
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://api_backend/health;
        access_log off;
    }
}
```

## Kubernetes Deployment

### Prerequisites
```bash
# Install tools
kubectl version
helm version

# Create namespace
kubectl create namespace lsemb
```

### Helm Chart

**helm/values.yaml:**
```yaml
replicaCount: 3

image:
  repository: lsemb/api
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: LoadBalancer
  port: 80

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: lsemb.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: lsemb-tls
      hosts:
        - lsemb.yourdomain.com

postgresql:
  enabled: true
  auth:
    database: lsemb
    username: lsemb_user
  primary:
    persistence:
      enabled: true
      size: 100Gi
  metrics:
    enabled: true

redis:
  enabled: true
  auth:
    enabled: true
  master:
    persistence:
      enabled: true
      size: 10Gi
  metrics:
    enabled: true

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 500m
    memory: 1Gi

monitoring:
  enabled: true
  prometheus:
    enabled: true
  grafana:
    enabled: true
```

### Deploy with Helm
```bash
# Add repositories
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Install
helm install lsemb ./helm -n lsemb -f values.yaml

# Check status
kubectl get pods -n lsemb
kubectl get svc -n lsemb
```

### Kubernetes Manifests

**deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lsemb-api
  namespace: lsemb
spec:
  replicas: 3
  selector:
    matchLabels:
      app: lsemb-api
  template:
    metadata:
      labels:
        app: lsemb-api
    spec:
      containers:
      - name: api
        image: lsemb/api:latest
        ports:
        - containerPort: 8000
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: lsemb-secrets
              key: database-url
        resources:
          limits:
            cpu: 2000m
            memory: 4Gi
          requests:
            cpu: 500m
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
```

**service.yaml:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: lsemb-api
  namespace: lsemb
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 8000
    protocol: TCP
  selector:
    app: lsemb-api
```

**hpa.yaml:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: lsemb-api
  namespace: lsemb
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: lsemb-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Cloud Deployments

### AWS Deployment

#### Using ECS Fargate
```yaml
# task-definition.json
{
  "family": "lsemb-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "4096",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "lsemb/api:latest",
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"}
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:lsemb/db"
        }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

#### RDS PostgreSQL with pgvector
```bash
# Create RDS instance with pgvector
aws rds create-db-instance \
  --db-instance-identifier lsemb-postgres \
  --db-instance-class db.r6g.xlarge \
  --engine postgres \
  --engine-version 15.4 \
  --allocated-storage 100 \
  --storage-encrypted \
  --master-username lsemb_admin \
  --master-user-password $DB_PASSWORD

# Enable pgvector extension
psql -h lsemb-postgres.region.rds.amazonaws.com -U lsemb_admin -d lsemb
CREATE EXTENSION IF NOT EXISTS vector;
```

### Google Cloud Deployment

#### Cloud Run
```bash
# Build and push image
gcloud builds submit --tag gcr.io/PROJECT_ID/lsemb-api

# Deploy to Cloud Run
gcloud run deploy lsemb-api \
  --image gcr.io/PROJECT_ID/lsemb-api \
  --platform managed \
  --region us-central1 \
  --memory 4Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --set-env-vars NODE_ENV=production \
  --set-secrets DATABASE_URL=lsemb-db-url:latest
```

#### Cloud SQL PostgreSQL
```bash
# Create instance with pgvector
gcloud sql instances create lsemb-postgres \
  --database-version=POSTGRES_15 \
  --tier=db-n1-standard-4 \
  --region=us-central1 \
  --network=default \
  --database-flags=shared_preload_libraries=vector
```

### Azure Deployment

#### Azure Container Instances
```bash
# Create container group
az container create \
  --resource-group lsemb-rg \
  --name lsemb-api \
  --image lsemb/api:latest \
  --cpu 2 \
  --memory 4 \
  --ports 8000 \
  --environment-variables NODE_ENV=production \
  --secure-environment-variables DATABASE_URL=$DB_URL
```

#### Azure Database for PostgreSQL
```bash
# Create PostgreSQL server with pgvector
az postgres flexible-server create \
  --resource-group lsemb-rg \
  --name lsemb-postgres \
  --location eastus \
  --sku-name Standard_D4ds_v4 \
  --storage-size 128 \
  --version 15

# Enable pgvector extension
az postgres flexible-server parameter set \
  --resource-group lsemb-rg \
  --server-name lsemb-postgres \
  --name azure.extensions \
  --value vector
```

## n8n Deployment

### Standalone n8n with LSEMB
```yaml
# docker-compose.n8n.yml
version: '3.8'

services:
  n8n:
    image: n8nio/n8n:latest
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      - NODE_FUNCTION_ALLOW_EXTERNAL=n8n-nodes-lsemb
    volumes:
      - n8n_data:/home/node/.n8n
      - ./custom-nodes:/home/node/.n8n/custom
    command: >
      sh -c "
        npm install -g n8n-nodes-lsemb &&
        n8n start
      "
```

### n8n Cloud Integration
1. Publish to npm:
```bash
npm publish
```

2. Install via n8n UI:
- Settings → Community Nodes
- Install: `n8n-nodes-lsemb`
- Configure credentials

## Monitoring & Observability

### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'lsemb-api'
    static_configs:
      - targets: ['api:9090']
    metrics_path: '/metrics'
```

### Grafana Dashboard
```json
{
  "dashboard": {
    "title": "LSEMB Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(lsemb_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Response Time",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, lsemb_request_duration_seconds)"
          }
        ]
      },
      {
        "title": "Active Workspaces",
        "targets": [
          {
            "expr": "lsemb_active_workspaces"
          }
        ]
      }
    ]
  }
}
```

### Logging with ELK Stack
```yaml
# filebeat.yml
filebeat.inputs:
- type: container
  paths:
    - '/var/lib/docker/containers/*/*.log'
  processors:
    - add_docker_metadata: ~
  fields:
    service: lsemb

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

## Backup & Recovery

### Database Backup
```bash
#!/bin/bash
# backup.sh

# PostgreSQL backup
pg_dump -h $POSTGRES_HOST -U $POSTGRES_USER -d lsemb | gzip > backup_$(date +%Y%m%d).sql.gz

# Redis backup
redis-cli --rdb /backup/redis_$(date +%Y%m%d).rdb BGSAVE

# Upload to S3
aws s3 cp backup_$(date +%Y%m%d).sql.gz s3://lsemb-backups/postgres/
aws s3 cp /backup/redis_$(date +%Y%m%d).rdb s3://lsemb-backups/redis/
```

### Disaster Recovery
```bash
#!/bin/bash
# restore.sh

# Download latest backup
aws s3 cp s3://lsemb-backups/postgres/latest.sql.gz .
aws s3 cp s3://lsemb-backups/redis/latest.rdb .

# Restore PostgreSQL
gunzip -c latest.sql.gz | psql -h $POSTGRES_HOST -U $POSTGRES_USER -d lsemb

# Restore Redis
redis-cli --rdb latest.rdb RESTORE
```

## Security Hardening

### Network Security
```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: lsemb-network-policy
spec:
  podSelector:
    matchLabels:
      app: lsemb-api
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx
    ports:
    - protocol: TCP
      port: 8000
```

### Secrets Management
```bash
# Using Kubernetes secrets
kubectl create secret generic lsemb-secrets \
  --from-literal=database-url=$DATABASE_URL \
  --from-literal=redis-password=$REDIS_PASSWORD \
  --from-literal=api-key=$API_KEY

# Using AWS Secrets Manager
aws secretsmanager create-secret \
  --name lsemb/production \
  --secret-string file://secrets.json
```

### SSL/TLS Certificates
```bash
# Let's Encrypt with cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create issuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@lsemb.ai
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

## Performance Tuning

### PostgreSQL Optimization
```sql
-- postgresql.conf
shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 1GB
work_mem = 50MB
max_connections = 200
random_page_cost = 1.1

-- pgvector specific
ivfflat.probes = 10
```

### Redis Optimization
```conf
# redis.conf
maxmemory 4gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### API Optimization
```python
# Async connection pools
POSTGRES_POOL_SIZE = 20
REDIS_POOL_SIZE = 10

# Caching
CACHE_TTL = 3600
ENABLE_QUERY_CACHE = True

# Batch processing
BATCH_SIZE = 100
MAX_PARALLEL_WORKERS = 4
```

## Health Checks

### Kubernetes Probes
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Custom Health Endpoints
```python
@app.get("/health/live")
async def liveness():
    """Basic liveness check"""
    return {"status": "alive"}

@app.get("/health/ready")
async def readiness():
    """Readiness check with dependencies"""
    checks = {
        "postgres": await check_postgres(),
        "redis": await check_redis(),
        "disk_space": check_disk_space()
    }
    
    if all(checks.values()):
        return {"status": "ready", "checks": checks}
    else:
        raise HTTPException(503, detail=checks)
```

## Maintenance

### Rolling Updates
```bash
# Kubernetes rolling update
kubectl set image deployment/lsemb-api api=lsemb/api:v2.0.0 -n lsemb
kubectl rollout status deployment/lsemb-api -n lsemb

# Rollback if needed
kubectl rollout undo deployment/lsemb-api -n lsemb
```

### Database Migrations
```bash
# Run migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "Add new column"

# Rollback
alembic downgrade -1
```

## Troubleshooting

### Common Deployment Issues

| Issue | Solution |
|-------|----------|
| "Container fails to start" | Check logs: `kubectl logs -f pod-name` |
| "Database connection timeout" | Verify network policies, security groups |
| "High memory usage" | Check workspace cleanup, increase limits |
| "Slow API responses" | Enable caching, check indexes |
| "SSL certificate errors" | Verify cert-manager, check DNS |

### Debug Commands
```bash
# Kubernetes debugging
kubectl describe pod <pod-name>
kubectl exec -it <pod-name> -- /bin/bash
kubectl logs -f <pod-name> --tail=100

# Docker debugging
docker logs -f lsemb-api
docker exec -it lsemb-api bash
docker stats

# Database debugging
psql -h localhost -U lsemb_user -d lsemb -c "SELECT * FROM pg_stat_activity;"
redis-cli INFO memory
```

## Cost Optimization

### Resource Right-sizing
- Monitor actual usage with Prometheus/Grafana
- Use autoscaling for variable loads
- Consider spot/preemptible instances for workers

### Storage Optimization
- Implement data retention policies
- Use compression for backups
- Archive old data to object storage

### Multi-Region Strategy
- Deploy in regions close to users
- Use CDN for static assets
- Consider read replicas for databases