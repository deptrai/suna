# ChainLens Crypto Services - Production Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying ChainLens Crypto Services to production using Kubernetes.

## Prerequisites

### Infrastructure Requirements

- **Kubernetes Cluster**: v1.24+ with at least 3 nodes
- **Node Specifications**: 
  - CPU: 4 cores per node minimum
  - Memory: 8GB per node minimum
  - Storage: 100GB SSD per node
- **Load Balancer**: NGINX Ingress Controller or cloud provider LB
- **DNS**: Configured domain for API endpoints
- **SSL Certificates**: Let's Encrypt or commercial certificates

### Required Tools

```bash
# Install required tools
kubectl version --client  # v1.24+
helm version              # v3.8+
docker version           # v20.10+
```

### External Services

- **Supabase**: PostgreSQL database and authentication
- **External APIs**: API keys for all integrated services
- **Container Registry**: GitHub Container Registry or Docker Hub
- **Monitoring**: Prometheus and Grafana setup

## Deployment Steps

### Step 1: Prepare Environment

#### 1.1 Clone Repository

```bash
git clone https://github.com/your-org/chainlens-crypto-services.git
cd chainlens-crypto-services
```

#### 1.2 Set Environment Variables

```bash
# Copy environment template
cp services/.env.example .env.production

# Edit with production values
nano .env.production
```

Required environment variables:
```bash
# Database
DATABASE_URL=postgresql://user:pass@supabase-host:5432/postgres
MICROSERVICES_DATABASE_URL=postgresql://chainlens:pass@postgres:5432/chainlens_microservices

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_SERVICE_KEY=your-service-key

# External APIs
MORALIS_API_KEY=your-moralis-key
COINGECKO_API_KEY=your-coingecko-key
TWITTER_BEARER_TOKEN=your-twitter-token
NEWS_API_KEY=your-news-api-key
REDDIT_CLIENT_ID=your-reddit-id
REDDIT_CLIENT_SECRET=your-reddit-secret
GITHUB_TOKEN=your-github-token
LINKEDIN_API_KEY=your-linkedin-key

# Security
JWT_SECRET=your-32-char-secret
ENCRYPTION_KEY=your-32-char-encryption-key
REDIS_PASSWORD=your-redis-password
POSTGRES_PASSWORD=your-postgres-password
```

### Step 2: Build and Push Images

#### 2.1 Build Docker Images

```bash
# Build all services
cd services

# Build ChainLens Core
docker build -t chainlens/chainlens-core:latest chainlens-core/

# Build microservices
docker build -t chainlens/onchain-analysis:latest onchain-analysis/
docker build -t chainlens/sentiment-analysis:latest sentiment-analysis/
docker build -t chainlens/tokenomics-analysis:latest tokenomics-analysis/
docker build -t chainlens/team-verification:latest team-verification/
```

#### 2.2 Push to Registry

```bash
# Tag and push to your registry
docker tag chainlens/chainlens-core:latest your-registry/chainlens-core:v1.0.0
docker push your-registry/chainlens-core:v1.0.0

# Repeat for all services...
```

### Step 3: Kubernetes Deployment

#### 3.1 Create Namespace

```bash
kubectl apply -f services/k8s/namespace.yaml
```

#### 3.2 Create Secrets

```bash
# Create secrets from environment file
kubectl create secret generic chainlens-secrets \
  --namespace=chainlens-crypto \
  --from-env-file=.env.production

# Verify secrets
kubectl get secrets -n chainlens-crypto
```

#### 3.3 Deploy Database Infrastructure

```bash
# Deploy PostgreSQL and Redis
kubectl apply -f services/k8s/database-deployment.yaml

# Wait for databases to be ready
kubectl wait --for=condition=ready pod -l app=postgres-microservices -n chainlens-crypto --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n chainlens-crypto --timeout=300s
```

#### 3.4 Run Database Migrations

```bash
# Create migration job
kubectl create job chainlens-migration \
  --image=your-registry/chainlens-core:v1.0.0 \
  --namespace=chainlens-crypto \
  -- npm run migration:run

# Check migration status
kubectl logs job/chainlens-migration -n chainlens-crypto
```

#### 3.5 Deploy Core Services

```bash
# Deploy ChainLens Core (API Gateway)
kubectl apply -f services/k8s/chainlens-core-deployment.yaml

# Wait for core service
kubectl wait --for=condition=available deployment/chainlens-core -n chainlens-crypto --timeout=300s
```

#### 3.6 Deploy Microservices

```bash
# Deploy OnChain Analysis
kubectl apply -f services/k8s/onchain-analysis-deployment.yaml

# Deploy all microservices
kubectl apply -f services/k8s/microservices-deployment.yaml

# Wait for all deployments
kubectl wait --for=condition=available deployment --all -n chainlens-crypto --timeout=600s
```

#### 3.7 Configure Ingress

```bash
# Apply ingress configuration
kubectl apply -f services/k8s/ingress.yaml

# Check ingress status
kubectl get ingress -n chainlens-crypto
```

### Step 4: Monitoring Setup

#### 4.1 Deploy Prometheus

```bash
# Add Prometheus Helm repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --values services/monitoring/prometheus-values.yaml
```

#### 4.2 Configure Service Monitoring

```bash
# Apply ServiceMonitor for crypto services
kubectl apply -f services/monitoring/service-monitors.yaml
```

#### 4.3 Import Grafana Dashboards

```bash
# Access Grafana
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring

# Import dashboards from services/monitoring/grafana/dashboards/
```

### Step 5: Verification and Testing

#### 5.1 Health Checks

```bash
# Check all pods are running
kubectl get pods -n chainlens-crypto

# Check services
kubectl get services -n chainlens-crypto

# Test health endpoints
curl -f https://api-crypto.yourdomain.com/api/v1/health
```

#### 5.2 API Testing

```bash
# Test ChainLens Core API
curl -X POST https://api-crypto.yourdomain.com/api/v1/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"projectId": "bitcoin", "analysisType": "full"}'
```

#### 5.3 Load Testing

```bash
# Run load tests
cd services
npm run test:load

# Monitor performance
kubectl top pods -n chainlens-crypto
```

## Post-Deployment Configuration

### SSL/TLS Setup

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### Backup Configuration

```bash
# Setup database backups
kubectl create cronjob postgres-backup \
  --image=postgres:15-alpine \
  --schedule="0 2 * * *" \
  --namespace=chainlens-crypto \
  -- pg_dump $DATABASE_URL > /backup/backup-$(date +%Y%m%d).sql
```

### Alerting Setup

```bash
# Configure Alertmanager
kubectl apply -f services/monitoring/alertmanager-config.yaml

# Test alerts
kubectl apply -f services/monitoring/test-alerts.yaml
```

## Scaling Configuration

### Horizontal Pod Autoscaling

```bash
# HPA is already configured in deployment files
# Monitor scaling
kubectl get hpa -n chainlens-crypto

# Manual scaling if needed
kubectl scale deployment chainlens-core --replicas=5 -n chainlens-crypto
```

### Vertical Pod Autoscaling

```bash
# Install VPA (if not available)
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/download/vertical-pod-autoscaler-0.13.0/vpa-release-0.13.0.yaml

# Apply VPA configuration
kubectl apply -f services/k8s/vpa-config.yaml
```

## Troubleshooting

### Common Issues

#### 1. Pod Startup Issues

```bash
# Check pod logs
kubectl logs -f deployment/chainlens-core -n chainlens-crypto

# Check events
kubectl get events -n chainlens-crypto --sort-by='.lastTimestamp'

# Describe problematic pods
kubectl describe pod <pod-name> -n chainlens-crypto
```

#### 2. Database Connection Issues

```bash
# Test database connectivity
kubectl exec -it deployment/chainlens-core -n chainlens-crypto -- npm run db:test

# Check database logs
kubectl logs -f statefulset/postgres-microservices -n chainlens-crypto
```

#### 3. External API Issues

```bash
# Check API key configuration
kubectl get secret chainlens-secrets -n chainlens-crypto -o yaml

# Test external API connectivity
kubectl exec -it deployment/onchain-analysis -n chainlens-crypto -- curl -f https://api.coingecko.com/api/v3/ping
```

### Performance Optimization

#### 1. Resource Tuning

```bash
# Monitor resource usage
kubectl top pods -n chainlens-crypto
kubectl top nodes

# Adjust resource limits in deployment files
```

#### 2. Cache Optimization

```bash
# Monitor Redis performance
kubectl exec -it statefulset/redis -n chainlens-crypto -- redis-cli info memory

# Check cache hit rates in Grafana dashboards
```

## Maintenance

### Regular Tasks

#### 1. Update Dependencies

```bash
# Update Node.js dependencies
cd services
npm audit
npm update

# Rebuild and redeploy images
```

#### 2. Database Maintenance

```bash
# Run database maintenance
kubectl exec -it statefulset/postgres-microservices -n chainlens-crypto -- psql -c "VACUUM ANALYZE;"
```

#### 3. Log Rotation

```bash
# Configure log rotation
kubectl apply -f services/k8s/log-rotation-config.yaml
```

### Security Updates

#### 1. Image Updates

```bash
# Scan for vulnerabilities
trivy image your-registry/chainlens-core:latest

# Update base images and rebuild
```

#### 2. Secret Rotation

```bash
# Rotate API keys
kubectl create secret generic chainlens-secrets-new \
  --namespace=chainlens-crypto \
  --from-env-file=.env.production.new

# Update deployments to use new secrets
kubectl patch deployment chainlens-core -n chainlens-crypto -p '{"spec":{"template":{"spec":{"containers":[{"name":"chainlens-core","envFrom":[{"secretRef":{"name":"chainlens-secrets-new"}}]}]}}}}'
```

## Rollback Procedures

### Application Rollback

```bash
# Check rollout history
kubectl rollout history deployment/chainlens-core -n chainlens-crypto

# Rollback to previous version
kubectl rollout undo deployment/chainlens-core -n chainlens-crypto

# Rollback to specific revision
kubectl rollout undo deployment/chainlens-core --to-revision=2 -n chainlens-crypto
```

### Database Rollback

```bash
# Restore from backup
kubectl exec -it statefulset/postgres-microservices -n chainlens-crypto -- psql < /backup/backup-20240101.sql
```

## Support and Monitoring

### Monitoring URLs

- **Prometheus**: https://prometheus.yourdomain.com
- **Grafana**: https://grafana.yourdomain.com
- **API Health**: https://api-crypto.yourdomain.com/api/v1/health

### Log Aggregation

```bash
# View aggregated logs
kubectl logs -f -l app=chainlens-core -n chainlens-crypto

# Use log aggregation tools like ELK stack or Fluentd
```

### Performance Metrics

Key metrics to monitor:
- Request rate and response time
- Error rates
- Resource utilization (CPU, Memory)
- Database performance
- Cache hit rates
- External API response times

This production deployment guide ensures a robust, scalable, and maintainable deployment of ChainLens Crypto Services.
