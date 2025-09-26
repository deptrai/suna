# 🚀 Production Deployment Guide

## 📖 Table of Contents

- [Overview](#overview)
- [Infrastructure Requirements](#infrastructure-requirements)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Cloud Deployment](#cloud-deployment)
- [Container Orchestration](#container-orchestration)
- [Database Setup](#database-setup)
- [Security Hardening](#security-hardening)
- [Monitoring & Observability](#monitoring--observability)
- [CI/CD Pipeline](#cicd-pipeline)
- [Environment Configuration](#environment-configuration)
- [Load Balancing](#load-balancing)
- [Backup & Recovery](#backup--recovery)
- [Performance Optimization](#performance-optimization)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

This guide provides comprehensive instructions for deploying Suna AI Agent Platform to production environments. It covers cloud infrastructure setup, security hardening, monitoring, and operational best practices.

### 🏗️ **Production Architecture**

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                        │
│                (AWS ALB / GCP LB)                       │
└─────────────────────┬───────────────────────────────────┘
                     │
┌─────────────────────▼───────────────────────────────────┐
│                   Web Tier                             │
│           Frontend (3 replicas)                        │
└─────────────────────┬───────────────────────────────────┘
                     │
┌─────────────────────▼───────────────────────────────────┐
│                 Application Tier                       │
│          Backend API (3+ replicas)                     │
│       Background Workers (2+ replicas)                 │
└─────────────────────┬───────────────────────────────────┘
                     │
┌─────────────────────▼───────────────────────────────────┐
│               Microservices Tier                       │
│    OnChain│Sentiment│Tokenomics│Team (2 replicas each) │
└─────────────────────┬───────────────────────────────────┘
                     │
┌─────────────────────▼───────────────────────────────────┐
│                  Data Tier                             │
│    PostgreSQL Cluster │ Redis Cluster │ Object Storage │
└─────────────────────────────────────────────────────────┘
```

---

## 💻 Infrastructure Requirements

### **🔧 Minimum Production Specifications**

| Component | Small (< 100 users) | Medium (100-1K users) | Large (1K+ users) |
|-----------|---------------------|----------------------|-------------------|
| **CPU** | 8 cores | 16 cores | 32+ cores |
| **Memory** | 32GB RAM | 64GB RAM | 128GB+ RAM |
| **Storage** | 500GB SSD | 1TB SSD | 2TB+ SSD |
| **Network** | 1 Gbps | 5 Gbps | 10+ Gbps |
| **Instances** | 3 nodes | 5 nodes | 10+ nodes |

### **☁️ Cloud Provider Resources**

#### **AWS Infrastructure**
```hcl
# terraform/aws/main.tf
resource "aws_vpc" "suna_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "suna-vpc"
    Environment = var.environment
  }
}

resource "aws_eks_cluster" "suna_cluster" {
  name     = "suna-${var.environment}"
  role_arn = aws_iam_role.eks_cluster_role.arn
  version  = "1.28"

  vpc_config {
    subnet_ids = aws_subnet.suna_subnets[*].id
  }
}

resource "aws_rds_cluster" "suna_db" {
  cluster_identifier      = "suna-${var.environment}"
  engine                 = "aurora-postgresql"
  engine_version         = "15.4"
  database_name          = "suna_prod"
  master_username        = var.db_username
  master_password        = var.db_password
  backup_retention_period = 35
  preferred_backup_window = "07:00-09:00"
  
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  db_subnet_group_name   = aws_db_subnet_group.suna_db_subnet_group.name
  
  storage_encrypted = true
  kms_key_id       = aws_kms_key.suna_key.arn
}
```

#### **GCP Infrastructure**
```hcl
# terraform/gcp/main.tf
resource "google_container_cluster" "suna_cluster" {
  name     = "suna-${var.environment}"
  location = var.region

  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.suna_vpc.name
  subnetwork = google_compute_subnetwork.suna_subnet.name
}

resource "google_sql_database_instance" "suna_db" {
  name             = "suna-${var.environment}"
  database_version = "POSTGRES_15"
  region          = var.region

  settings {
    tier = "db-standard-4"
    
    backup_configuration {
      enabled                        = true
      start_time                     = "07:00"
      point_in_time_recovery_enabled = true
    }
    
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.suna_vpc.id
    }
  }
}
```

#### **Azure Infrastructure**
```hcl
# terraform/azure/main.tf
resource "azurerm_kubernetes_cluster" "suna_cluster" {
  name                = "suna-${var.environment}"
  location            = azurerm_resource_group.suna_rg.location
  resource_group_name = azurerm_resource_group.suna_rg.name
  dns_prefix          = "suna-${var.environment}"

  default_node_pool {
    name       = "default"
    node_count = 3
    vm_size    = "Standard_D4s_v3"
  }

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_postgresql_flexible_server" "suna_db" {
  name                   = "suna-${var.environment}"
  resource_group_name    = azurerm_resource_group.suna_rg.name
  location              = azurerm_resource_group.suna_rg.location
  version               = "15"
  administrator_login    = var.db_username
  administrator_password = var.db_password
  storage_mb            = 32768
  sku_name              = "GP_Standard_D4s_v3"
}
```

---

## ✅ Pre-Deployment Checklist

### **📋 Infrastructure Preparation**

- [ ] **Cloud Account Setup**: AWS/GCP/Azure account with appropriate permissions
- [ ] **Domain Registration**: Primary domain and SSL certificates
- [ ] **DNS Configuration**: Route 53, Cloud DNS, or Azure DNS setup
- [ ] **VPC/Network**: Isolated network with proper subnets and security groups
- [ ] **Load Balancer**: Application load balancer with health checks
- [ ] **Container Registry**: Private container registry for images
- [ ] **Secrets Management**: AWS Secrets Manager, GCP Secret Manager, or Azure Key Vault

### **🔐 Security Preparation**

- [ ] **SSL Certificates**: Let's Encrypt or commercial SSL certificates
- [ ] **WAF Configuration**: Web Application Firewall rules
- [ ] **Network Security**: Security groups, NACLs, firewall rules
- [ ] **IAM Policies**: Least privilege access policies
- [ ] **Audit Logging**: CloudTrail, Cloud Audit Logs, or Activity Log
- [ ] **Backup Strategy**: Automated backup and recovery procedures

### **🛠️ Application Preparation**

- [ ] **Environment Variables**: Production environment configuration
- [ ] **Database Migrations**: Schema migrations and seed data
- [ ] **Container Images**: Built and tagged production images
- [ ] **Configuration Files**: Production-ready configurations
- [ ] **Health Checks**: Application health check endpoints
- [ ] **Monitoring Setup**: Observability tools and dashboards

---

## ☁️ Cloud Deployment

### **🚀 AWS Deployment**

#### **1. Infrastructure Setup**
```bash
# Clone deployment configurations
git clone https://github.com/epsilon-ai/chainlens.git
cd chainlens/deployment/aws

# Initialize Terraform
terraform init

# Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings

# Plan deployment
terraform plan -var-file="terraform.tfvars"

# Deploy infrastructure
terraform apply -var-file="terraform.tfvars"
```

#### **2. EKS Cluster Setup**
```bash
# Update kubeconfig
aws eks update-kubeconfig --region us-east-1 --name suna-prod

# Verify cluster connection
kubectl get nodes

# Install cluster autoscaler
kubectl apply -f k8s/cluster-autoscaler.yaml

# Install AWS Load Balancer Controller
kubectl apply -f k8s/aws-load-balancer-controller.yaml
```

#### **3. Application Deployment**
```bash
# Create namespace
kubectl create namespace suna

# Deploy secrets
kubectl apply -f k8s/secrets.yaml -n suna

# Deploy applications
kubectl apply -f k8s/ -n suna

# Verify deployment
kubectl get pods -n suna
kubectl get services -n suna
```

### **🌐 GCP Deployment**

#### **1. Infrastructure Setup**
```bash
# Configure GCP credentials
gcloud auth login
gcloud config set project your-project-id

# Deploy with Terraform
cd deployment/gcp
terraform init
terraform apply -var="project_id=your-project-id"
```

#### **2. GKE Cluster Setup**
```bash
# Get cluster credentials
gcloud container clusters get-credentials suna-prod --region us-central1

# Install ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml

# Deploy applications
kubectl apply -f k8s/ -n suna
```

### **⚡ Azure Deployment**

#### **1. Infrastructure Setup**
```bash
# Login to Azure
az login

# Deploy infrastructure
cd deployment/azure
terraform init
terraform apply -var="location=eastus"
```

#### **2. AKS Cluster Setup**
```bash
# Get cluster credentials
az aks get-credentials --resource-group suna-rg --name suna-prod

# Install ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
```

---

## 🐳 Container Orchestration

### **📦 Kubernetes Manifests**

#### **Namespace Configuration**
```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: suna
  labels:
    name: suna
    environment: production
```

#### **Frontend Deployment**
```yaml
# k8s/frontend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: suna
spec:
  replicas: 3
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: your-registry/suna-frontend:latest
        ports:
        - containerPort: 3000
        env:
        - name: NEXT_PUBLIC_BACKEND_URL
          value: "https://api.yourdomain.com"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

#### **Backend Deployment**
```yaml
# k8s/backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: suna
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: your-registry/suna-backend:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: suna-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: suna-secrets
              key: redis-url
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 60
          periodSeconds: 10
```

#### **Database Configuration**
```yaml
# k8s/postgres-deployment.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: suna
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          value: suna_prod
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secrets
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secrets
              key: password
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 100Gi
```

---

## 🛡️ Security Hardening

### **🔐 TLS/SSL Configuration**

#### **Let's Encrypt with cert-manager**
```yaml
# k8s/cert-manager.yaml
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
```

#### **Ingress with TLS**
```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: suna-ingress
  namespace: suna
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - yourdomain.com
    - api.yourdomain.com
    secretName: suna-tls
  rules:
  - host: yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 3000
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 8000
```

### **🛡️ Network Policies**
```yaml
# k8s/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: suna
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: suna
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8000
```

### **🔒 Pod Security Standards**
```yaml
# k8s/pod-security.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: suna
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

---

## 📊 Monitoring & Observability

### **🔍 Prometheus Configuration**
```yaml
# monitoring/prometheus.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    scrape_configs:
    - job_name: 'kubernetes-pods'
      kubernetes_sd_configs:
      - role: pod
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
    - job_name: 'suna-backend'
      static_configs:
      - targets: ['backend:8000']
    - job_name: 'suna-microservices'
      static_configs:
      - targets: 
        - 'onchain-service:3001'
        - 'sentiment-service:3002'
        - 'tokenomics-service:3003'
        - 'team-service:3004'
```

### **📈 Grafana Dashboards**
```bash
# Deploy monitoring stack
kubectl create namespace monitoring

# Install Prometheus
kubectl apply -f monitoring/prometheus-deployment.yaml -n monitoring

# Install Grafana
kubectl apply -f monitoring/grafana-deployment.yaml -n monitoring

# Import dashboards
curl -X POST \
  http://admin:admin@grafana.yourdomain.com/api/dashboards/db \
  -H 'Content-Type: application/json' \
  -d @monitoring/dashboards/suna-overview.json
```

### **🚨 Alerting Rules**
```yaml
# monitoring/alerts.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-alerts
  namespace: monitoring
data:
  alerts.yml: |
    groups:
    - name: suna-alerts
      rules:
      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.pod }}"
      
      - alert: APIHighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on API"
```

---

## 🔄 CI/CD Pipeline

### **🏗️ GitHub Actions Deployment**
```yaml
# .github/workflows/deploy-production.yml
name: 🚀 Production Deployment

on:
  push:
    branches: [main]
    tags: ['v*']
  workflow_dispatch:

jobs:
  build-and-deploy:
    name: Build & Deploy to Production
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')
    
    steps:
    - name: 🔄 Checkout Code
      uses: actions/checkout@v4
      with:
        fetch-depth: 0
    
    - name: 🔍 Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: 🏗️ Build and Push Docker Images
      run: |
        # Backend
        docker build -t $ECR_REGISTRY/suna-backend:$GITHUB_SHA ./backend
        docker push $ECR_REGISTRY/suna-backend:$GITHUB_SHA
        
        # Frontend
        docker build -t $ECR_REGISTRY/suna-frontend:$GITHUB_SHA ./frontend
        docker push $ECR_REGISTRY/suna-frontend:$GITHUB_SHA
        
        # Microservices
        for service in onchain sentiment tokenomics team; do
          docker build -t $ECR_REGISTRY/suna-$service:$GITHUB_SHA ./microservices/$service-service
          docker push $ECR_REGISTRY/suna-$service:$GITHUB_SHA
        done
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
    
    - name: 🎯 Deploy to EKS
      run: |
        aws eks update-kubeconfig --region us-east-1 --name suna-prod
        
        # Update deployment images
        kubectl set image deployment/backend backend=$ECR_REGISTRY/suna-backend:$GITHUB_SHA -n suna
        kubectl set image deployment/frontend frontend=$ECR_REGISTRY/suna-frontend:$GITHUB_SHA -n suna
        
        # Wait for rollout
        kubectl rollout status deployment/backend -n suna --timeout=600s
        kubectl rollout status deployment/frontend -n suna --timeout=600s
    
    - name: 🧪 Run Health Checks
      run: |
        # Wait for services to be ready
        kubectl wait --for=condition=ready pod -l app=backend -n suna --timeout=300s
        
        # Test API health
        API_URL=$(kubectl get ingress suna-ingress -n suna -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
        curl -f https://$API_URL/health
    
    - name: 📧 Notify Deployment Status
      if: always()
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        channel: '#deployments'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### **🔄 Blue-Green Deployment**
```bash
# scripts/blue-green-deploy.sh
#!/bin/bash

NAMESPACE="suna"
SERVICE="backend"
NEW_VERSION=$1

# Deploy green version
kubectl apply -f k8s/${SERVICE}-deployment-green.yaml -n $NAMESPACE

# Wait for green deployment
kubectl rollout status deployment/${SERVICE}-green -n $NAMESPACE

# Health check green deployment
kubectl exec -it deployment/${SERVICE}-green -n $NAMESPACE -- curl -f http://localhost:8000/health

# Switch traffic to green
kubectl patch service $SERVICE -n $NAMESPACE -p '{"spec":{"selector":{"version":"green"}}}'

# Verify traffic switch
sleep 30
curl -f https://api.yourdomain.com/health

# Scale down blue deployment
kubectl scale deployment ${SERVICE}-blue --replicas=0 -n $NAMESPACE

echo "✅ Blue-green deployment completed successfully"
```

---

## 🔧 Environment Configuration

### **📝 Production Environment Variables**
```bash
# production.env
# Core Configuration
ENVIRONMENT=production
NODE_ENV=production
DEBUG=false
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@prod-db.cluster-xxx.us-east-1.rds.amazonaws.com:5432/suna_prod
DATABASE_POOL_SIZE=20
DATABASE_MAX_CONNECTIONS=100

# Redis
REDIS_URL=redis://prod-redis.cluster.cache.amazonaws.com:6379
REDIS_POOL_SIZE=10

# LLM Providers
OPENAI_API_KEY=${OPENAI_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}

# External Services
TAVILY_API_KEY=${TAVILY_API_KEY}
FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}

# Security
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Monitoring
SENTRY_DSN=${SENTRY_DSN}
LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY}
LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY}

# Performance
MAX_REQUEST_SIZE=50mb
RATE_LIMIT_WINDOW=3600
RATE_LIMIT_MAX=1000
```

### **🔒 Secrets Management**
```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: suna-secrets
  namespace: suna
type: Opaque
stringData:
  database-url: "postgresql://user:pass@host:5432/suna_prod"
  redis-url: "redis://redis-host:6379"
  jwt-secret: "your-jwt-secret"
  openai-api-key: "sk-..."
  anthropic-api-key: "sk-ant-..."
```

---

## ⚖️ Load Balancing

### **🌐 Application Load Balancer (AWS)**
```hcl
# terraform/aws/alb.tf
resource "aws_lb" "suna_alb" {
  name               = "suna-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets           = aws_subnet.public[*].id

  enable_deletion_protection = true

  tags = {
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "frontend" {
  name     = "suna-frontend-${var.environment}"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = aws_vpc.suna_vpc.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }
}

resource "aws_lb_listener" "frontend" {
  load_balancer_arn = aws_lb.suna_alb.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = aws_acm_certificate.suna_cert.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}
```

### **🔄 NGINX Configuration**
```nginx
# nginx/production.conf
upstream backend {
    least_conn;
    server backend-1:8000 max_fails=3 fail_timeout=30s;
    server backend-2:8000 max_fails=3 fail_timeout=30s;
    server backend-3:8000 max_fails=3 fail_timeout=30s;
}

upstream frontend {
    least_conn;
    server frontend-1:3000 max_fails=3 fail_timeout=30s;
    server frontend-2:3000 max_fails=3 fail_timeout=30s;
    server frontend-3:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/ssl/certs/yourdomain.com.pem;
    ssl_certificate_key /etc/ssl/private/yourdomain.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/ssl/certs/yourdomain.com.pem;
    ssl_certificate_key /etc/ssl/private/yourdomain.com.key;

    # Backend API
    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 💾 Backup & Recovery

### **🗄️ Database Backup Strategy**
```bash
# scripts/backup-database.sh
#!/bin/bash

DB_HOST="prod-db.cluster-xxx.us-east-1.rds.amazonaws.com"
DB_NAME="suna_prod"
DB_USER="suna_user"
BACKUP_DIR="/backups"
S3_BUCKET="suna-backups-prod"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME | gzip > $BACKUP_DIR/suna_prod_$DATE.sql.gz

# Upload to S3
aws s3 cp $BACKUP_DIR/suna_prod_$DATE.sql.gz s3://$S3_BUCKET/daily/

# Cleanup local files older than 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

# Cleanup S3 files older than 30 days
aws s3 ls s3://$S3_BUCKET/daily/ | \
  awk '$1 <= "'$(date -d '30 days ago' '+%Y-%m-%d')'" {print $4}' | \
  xargs -I {} aws s3 rm s3://$S3_BUCKET/daily/{}

echo "✅ Database backup completed: suna_prod_$DATE.sql.gz"
```

### **🔄 Automated Backup Schedule**
```yaml
# k8s/backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: database-backup
  namespace: suna
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15-alpine
            command:
            - /bin/bash
            - -c
            - |
              pg_dump $DATABASE_URL | gzip | aws s3 cp - s3://suna-backups/$(date +%Y%m%d_%H%M%S).sql.gz
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: suna-secrets
                  key: database-url
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: aws-credentials
                  key: access-key-id
            - name: AWS_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: aws-credentials
                  key: secret-access-key
          restartPolicy: OnFailure
```

### **🚀 Disaster Recovery Plan**
```bash
# scripts/disaster-recovery.sh
#!/bin/bash

# 1. Restore from latest backup
LATEST_BACKUP=$(aws s3 ls s3://suna-backups-prod/daily/ | sort | tail -n 1 | awk '{print $4}')
aws s3 cp s3://suna-backups-prod/daily/$LATEST_BACKUP /tmp/

# 2. Create new database instance
aws rds create-db-instance \
  --db-instance-identifier suna-prod-recovery \
  --db-instance-class db.r5.xlarge \
  --engine postgres \
  --master-username suna_user \
  --master-user-password $DB_PASSWORD \
  --allocated-storage 100

# 3. Wait for instance to be available
aws rds wait db-instance-available --db-instance-identifier suna-prod-recovery

# 4. Restore data
gunzip -c /tmp/$LATEST_BACKUP | psql -h recovery-endpoint -U suna_user -d suna_prod

# 5. Update application configuration
kubectl patch deployment backend -n suna -p '{"spec":{"template":{"spec":{"containers":[{"name":"backend","env":[{"name":"DATABASE_URL","value":"postgresql://suna_user:pass@recovery-endpoint:5432/suna_prod"}]}]}}}}'

echo "✅ Disaster recovery completed"
```

---

## ⚡ Performance Optimization

### **🚀 Application Performance**
```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: suna
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 3
  maxReplicas: 20
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

### **💾 Redis Optimization**
```redis
# redis/production.conf
maxmemory 4gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
tcp-keepalive 300
tcp-backlog 511
timeout 0
```

### **🗄️ PostgreSQL Optimization**
```postgresql
# postgresql/postgresql.conf
max_connections = 200
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 4MB
min_wal_size = 1GB
max_wal_size = 4GB
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
```

---

## 🔧 Troubleshooting

### **📊 Common Issues & Solutions**

#### **High Memory Usage**
```bash
# Check memory usage
kubectl top pods -n suna

# Scale up if needed
kubectl scale deployment backend --replicas=5 -n suna

# Check for memory leaks
kubectl logs -f deployment/backend -n suna | grep -i memory
```

#### **Database Connection Issues**
```bash
# Check database connectivity
kubectl exec -it deployment/backend -n suna -- pg_isready -h $DB_HOST

# Check connection pool
kubectl logs deployment/backend -n suna | grep -i "connection\|pool"

# Reset connections if needed
kubectl rollout restart deployment/backend -n suna
```

#### **SSL Certificate Issues**
```bash
# Check certificate status
kubectl describe certificate suna-tls -n suna

# Renew certificate manually if needed
kubectl delete certificate suna-tls -n suna
kubectl apply -f k8s/ingress.yaml
```

### **🚨 Emergency Procedures**

#### **Complete System Outage**
```bash
# 1. Check cluster status
kubectl get nodes
kubectl get pods --all-namespaces

# 2. Check external dependencies
curl -I https://api.openai.com
curl -I https://api.anthropic.com

# 3. Scale critical services
kubectl scale deployment backend --replicas=10 -n suna
kubectl scale deployment frontend --replicas=5 -n suna

# 4. Enable maintenance mode
kubectl apply -f k8s/maintenance-page.yaml
```

#### **Database Emergency**
```bash
# 1. Create read replica for failover
aws rds create-db-instance-read-replica \
  --db-instance-identifier suna-prod-replica \
  --source-db-instance-identifier suna-prod

# 2. Promote replica to standalone
aws rds promote-read-replica \
  --db-instance-identifier suna-prod-replica

# 3. Update application connection
kubectl patch deployment backend -n suna -p '{"spec":{"template":{"spec":{"containers":[{"name":"backend","env":[{"name":"DATABASE_URL","value":"new-database-endpoint"}]}]}}}}'
```

---

## 📋 Production Checklist

### **🚀 Go-Live Checklist**

#### **Infrastructure**
- [ ] DNS records configured and propagated
- [ ] SSL certificates installed and tested
- [ ] Load balancer configured with health checks
- [ ] Auto-scaling policies configured
- [ ] Backup strategies implemented and tested
- [ ] Monitoring and alerting configured
- [ ] Security groups and firewall rules applied

#### **Application**
- [ ] All services deployed and healthy
- [ ] Database migrations completed
- [ ] Environment variables configured
- [ ] External API integrations tested
- [ ] WebSocket connections tested
- [ ] File upload/download functionality tested
- [ ] Authentication and authorization working

#### **Security**
- [ ] Vulnerability scans completed
- [ ] Penetration testing performed
- [ ] Access controls reviewed
- [ ] Secrets properly managed
- [ ] Audit logging enabled
- [ ] HTTPS enforced everywhere

#### **Performance**
- [ ] Load testing completed
- [ ] Performance benchmarks established
- [ ] Database queries optimized
- [ ] CDN configured for static assets
- [ ] Caching strategies implemented

#### **Operations**
- [ ] Runbooks documented
- [ ] Escalation procedures defined
- [ ] Disaster recovery plan tested
- [ ] Team trained on production procedures
- [ ] Support channels established

---

**🧙 Generated by BMad Master Production Engineering**  
*Production is not a destination, it's a journey. Deploy with confidence, monitor with vigilance.*

**Last Updated**: January 15, 2025  
**Version**: 2.1.0
