#!/bin/bash

# 📊 ChainLens Monitoring Setup Script

set -euo pipefail

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Setup Prometheus monitoring
setup_prometheus() {
    log "Setting up Prometheus monitoring..."
    
    # Create Prometheus configuration
    cat > "../monitoring/prometheus.yml" << EOL
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'chainlens-backend'
    static_configs:
      - targets: ['backend:8000']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'chainlens-database'
    static_configs:
      - targets: ['postgres:5432']
    scrape_interval: 30s

  - job_name: 'chainlens-redis'
    static_configs:
      - targets: ['redis:6379']
    scrape_interval: 30s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
    scrape_interval: 30s
EOL
    
    log "✅ Prometheus configuration created"
}

# Setup Grafana dashboards
setup_grafana() {
    log "Setting up Grafana dashboards..."
    
    # Create basic dashboard configuration
    mkdir -p "../monitoring/grafana/dashboards"
    
    cat > "../monitoring/grafana/dashboards/chainlens-overview.json" << EOL
{
  "dashboard": {
    "title": "ChainLens Production Overview",
    "tags": ["chainlens", "production"],
    "timezone": "browser",
    "panels": [
      {
        "title": "API Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "avg(http_request_duration_seconds)",
            "legendFormat": "Avg Response Time"
          }
        ]
      },
      {
        "title": "Active Users",
        "type": "stat",
        "targets": [
          {
            "expr": "count(authenticated_users)",
            "legendFormat": "Active Users"
          }
        ]
      },
      {
        "title": "Database Connections",
        "type": "graph",
        "targets": [
          {
            "expr": "pg_stat_database_numbackends",
            "legendFormat": "DB Connections"
          }
        ]
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    }
  }
}
EOL
    
    log "✅ Grafana dashboards created"
}

# Setup alert rules
setup_alerts() {
    log "Setting up alerting rules..."
    
    cat > "../monitoring/alert_rules.yml" << EOL
groups:
  - name: chainlens.rules
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is above 10% for 5 minutes"

      - alert: DatabaseDown
        expr: up{job="chainlens-database"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database is down"
          description: "ChainLens database is not responding"

      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is above 90%"

      - alert: DiskSpaceLow
        expr: node_filesystem_free_bytes{fstype!="tmpfs"} / node_filesystem_size_bytes < 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Disk space low"
          description: "Disk space is below 10%"
EOL
    
    log "✅ Alert rules configured"
}

main() {
    log "📊 Starting monitoring setup..."
    
    setup_prometheus
    setup_grafana
    setup_alerts
    
    log "✅ Monitoring setup completed successfully"
}

main "$@"
