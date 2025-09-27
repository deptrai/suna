# 🚀 ChainLens Scripts Directory

Organized collection of scripts for managing the ChainLens development environment with comprehensive tools for startup, monitoring, testing, and maintenance.

## 📁 Directory Structure

```
scripts/
├── 🚀 core/           # Main startup and management scripts
├── 📊 monitoring/     # Dashboard and monitoring tools
├── 🧪 testing/        # Test scripts and validation tools  
├── 🛠️  maintenance/    # Cleanup, security, and backup scripts
├── 🔧 utils/          # Helper and utility scripts
├── 📚 lib/            # Shared libraries and functions
├── ⚙️  config/         # Configuration files
├── 📄 logs/           # Log files and output
├── 📦 archive/        # Deprecated scripts (v1, v2)
└── 📖 docs/           # Documentation files
```

## 🎯 Quick Start

### **Start Development Environment**
```bash
# Start all services with automatic monitoring dashboard
./core/start_dev_v3_enhanced.sh
```

### **Monitor Services**
```bash  
# Check status
./monitoring/monitoring_utils.sh status

# Start dashboard manually
./monitoring/monitoring_utils.sh start

# Attach to running dashboard  
./monitoring/monitoring_utils.sh attach
```

### **Run Tests**
```bash
# Run all tests
./testing/run-all-tests.sh

# Test integration
./testing/test_startup_integration.sh
```

### **Cleanup & Maintenance**
```bash
# Quick cleanup
./core/quick_cleanup_v2.sh

# Security audit
./maintenance/security-audit.sh
```

## 📊 Core Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| **`core/start_dev_v3_enhanced.sh`** | Enhanced startup script with circuit breakers, dependency management, and automatic dashboard launch | `./core/start_dev_v3_enhanced.sh` |
| **`core/quick_cleanup_v2.sh`** | Production-ready cleanup script for development environment | `./core/quick_cleanup_v2.sh [--quiet]` |

## 📈 Monitoring Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| **`monitoring/enhanced_dashboard_monitor.sh`** | 4-panel tmux monitoring dashboard with real-time logs | Direct execution (called by startup) |
| **`monitoring/start_monitoring_dashboard.sh`** | Quick launcher for monitoring dashboard | `./monitoring/start_monitoring_dashboard.sh` |
| **`monitoring/monitoring_utils.sh`** | Management utilities for dashboard | `./monitoring/monitoring_utils.sh [status\|start\|stop\|logs]` |
| **`monitoring/setup-monitoring.sh`** | Initial monitoring setup | `./monitoring/setup-monitoring.sh` |
| **`monitoring/view_logs.sh`** | Real-time log viewer | `./monitoring/view_logs.sh [service]` |

## 🧪 Testing Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| **`testing/test_startup_integration.sh`** | Integration test for startup → dashboard flow | `./testing/test_startup_integration.sh` |
| **`testing/test_chainlens_integration.sh`** | Complete integration test for ChainLens | `./testing/test_chainlens_integration.sh` |
| **`testing/run-all-tests.sh`** | Comprehensive test runner | `./testing/run-all-tests.sh` |
| **`testing/setup-testing-framework.sh`** | Testing infrastructure setup | `./testing/setup-testing-framework.sh` |

## 🛠️ Maintenance Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| **`maintenance/security-audit.sh`** | Security vulnerability scan | `./maintenance/security-audit.sh` |
| **`maintenance/security-hardening.sh`** | Production security hardening | `./maintenance/security-hardening.sh` |
| **`maintenance/dependency-security-scan.sh`** | Dependency vulnerability scan | `./maintenance/dependency-security-scan.sh` |
| **`maintenance/backup-verification.sh`** | Backup integrity verification | `./maintenance/backup-verification.sh` |
| **`maintenance/reset_db_and_migrate.sh`** | Database reset and migration | `./maintenance/reset_db_and_migrate.sh` |

## 🔧 Utility Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| **`utils/quick_test_models.sh`** | Quick LLM model testing | `./utils/quick_test_models.sh [models]` |
| **`utils/setup-redis-sentinel.sh`** | Redis Sentinel cluster setup | `./utils/setup-redis-sentinel.sh [start\|stop\|test]` |
| **`utils/generate-logo-pngs.js`** | Logo generation utility | `node ./utils/generate-logo-pngs.js` |

## 📚 Shared Libraries

The `lib/` directory contains shared functions and utilities used across scripts:

- **`lib/utils.sh`** - Common utility functions
- **`lib/enhanced_health_checks.sh`** - Health check functions  
- **`lib/dependency_manager.sh`** - Service dependency management
- **`lib/error_handler.sh`** - Error handling and recovery
- **`lib/monitoring.sh`** - Monitoring and metrics collection

## ⚙️ Configuration

Configuration files in `config/` directory:

- **`config/dev-environment.yaml`** - Development environment configuration
- Configuration is loaded automatically by core scripts

## 📄 Logs

Log files are stored in `logs/` directory:

- **`logs/backend.log`** - Backend service logs
- **`logs/frontend.log`** - Frontend service logs  
- **`logs/worker.log`** - Worker service logs
- **`logs/enhanced_monitor_output.log`** - Dashboard monitoring logs
- **`logs/structured.jsonl`** - Structured logging output

## 🎮 Features

### **Enhanced Development Environment**
- ✅ Circuit breaker patterns for resilience
- ✅ Smart dependency management with topological sorting
- ✅ Advanced error handling with graceful degradation
- ✅ Comprehensive health monitoring
- ✅ Optimized service startup sequences

### **4-Panel Monitoring Dashboard**
- ✅ Real-time service logs (Redis, Backend, Frontend, Worker)
- ✅ Interactive tmux interface with hotkeys
- ✅ Color-coded log levels and timestamps
- ✅ System metrics and resource monitoring
- ✅ Background persistence and session management

### **Comprehensive Testing**
- ✅ Unit, integration, and end-to-end tests
- ✅ Load testing and performance benchmarks
- ✅ Security vulnerability scanning
- ✅ Automated test framework setup

### **Production-Ready Operations**
- ✅ Security hardening and audit tools
- ✅ Backup verification and recovery
- ✅ Dependency security scanning
- ✅ Environment cleanup and management

## 🎯 Common Workflows

### **Daily Development**
```bash
# 1. Start development environment
./core/start_dev_v3_enhanced.sh

# 2. Monitor services (automatic dashboard)
# Use Ctrl+B + arrows to navigate panels
# Use Ctrl+B + d to detach and keep running

# 3. Run tests when needed
./testing/test_startup_integration.sh
```

### **Maintenance & Cleanup**
```bash
# 1. Clean environment
./core/quick_cleanup_v2.sh

# 2. Security checks
./maintenance/security-audit.sh

# 3. Dependency scan
./maintenance/dependency-security-scan.sh
```

### **Troubleshooting**
```bash
# 1. Check service status
./monitoring/monitoring_utils.sh status

# 2. View specific logs
./monitoring/view_logs.sh backend

# 3. Restart services
./core/quick_cleanup_v2.sh
./core/start_dev_v3_enhanced.sh
```

## 📖 Documentation

Detailed documentation available in `docs/` directory:

- **[README_MONITORING_INTEGRATION.md](docs/README_MONITORING_INTEGRATION.md)** - Monitoring dashboard guide
- **[DEV_SCRIPTS.md](docs/DEV_SCRIPTS.md)** - Development script reference
- **[README.md](docs/README.md)** - Legacy documentation

## 📦 Archive

Deprecated scripts are moved to `archive/` directory:

- **`archive/start_dev_v2.sh`** - Legacy startup script (replaced by v3)
- **`archive/stop_dev_v2.sh`** - Legacy stop script (replaced by cleanup)

These are kept for reference but should not be used in current development.

## 🎉 Getting Help

- **Issues**: Check logs in `logs/` directory
- **Status**: Use `./monitoring/monitoring_utils.sh status`
- **Tests**: Run `./testing/test_startup_integration.sh` 
- **Cleanup**: Use `./core/quick_cleanup_v2.sh` for fresh start

---

**🚀 Enjoy your organized and enhanced ChainLens development environment!**