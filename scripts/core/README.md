# 🚀 Core Scripts

Essential scripts for starting and managing the ChainLens development environment.

## Scripts

### **`start_dev_v3_enhanced.sh`**
Enhanced startup script with comprehensive features:
- Circuit breaker patterns for resilience
- Smart dependency management
- Automatic monitoring dashboard launch
- Advanced error handling

**Usage:**
```bash
./start_dev_v3_enhanced.sh
```

### **`quick_cleanup_v2.sh`**
Production-ready cleanup script for development environment:
- Graceful service shutdown
- Process cleanup
- Log rotation
- Port release

**Usage:**
```bash
./quick_cleanup_v2.sh [--quiet]
```

## Features

- ✅ Zero-downtime startup with dependency ordering
- ✅ Automatic health checks and monitoring
- ✅ Error recovery and graceful degradation
- ✅ Integrated 4-panel monitoring dashboard
- ✅ Comprehensive cleanup and maintenance