# Development Scripts

This directory contains utility scripts for the ChainLens project development workflow.

## Available Scripts

### `start_dev.sh` 🚀
Comprehensive development environment startup script:
- **Phase 1:** Cleanup existing processes and Redis cache
- **Phase 2:** Start backend services (Dramatiq worker + FastAPI server)
- **Phase 3:** Start frontend development server (Next.js)
- **Health checks:** Waits for all services to be ready
- **Logging:** Saves logs to `logs/` directory

Usage:
```bash
./scripts/start_dev.sh
```

Features:
- ✅ Automatic cleanup before starting
- ✅ Process health monitoring
- ✅ Colored output with progress indicators
- ✅ Error handling and validation
- ✅ Log file management
- ✅ Token compression enabled by default

### `stop_dev.sh` 🛑
Stops all development services gracefully:
- Stops frontend (port 3000)
- Stops backend API (port 8000)
- Stops Dramatiq workers
- Preserves log files

Usage:
```bash
./scripts/stop_dev.sh
```

### `quick_cleanup.sh` 🧹
Performs a quick cleanup of the development environment:
- Kills running processes (dramatiq workers, uvicorn servers)
- Clears Redis cache
- Removes temporary files

Usage:
```bash
./scripts/quick_cleanup.sh
```

## Development Workflow

### Quick Start
```bash
# Start everything (with cleanup)
./scripts/start_dev.sh

# Your development work here...

# Stop everything
./scripts/stop_dev.sh
```

### Services URLs
- **Frontend:** http://localhost:3000
- **Backend API:** http://127.0.0.1:8000
- **API Documentation:** http://127.0.0.1:8000/docs

### Log Monitoring
```bash
# View all logs
tail -f logs/*.log

# View specific service logs
tail -f logs/frontend.log
tail -f logs/backend.log
tail -f logs/worker.log
```

### Troubleshooting
If services fail to start:
1. Check log files in `logs/` directory
2. Ensure all dependencies are installed
3. Verify ports 3000 and 8000 are available
4. Run cleanup script manually if needed

## Token Compression

The development environment automatically enables token compression by default:
- **Compression Rate:** ~59.4% token reduction
- **Performance:** Faster response times
- **Cost Savings:** Significant reduction in API costs
- **Monitoring:** Check worker logs for compression statistics

## Process Management

The scripts handle process management automatically:
- **PID Tracking:** All process IDs are logged
- **Port Management:** Automatic port conflict resolution
- **Graceful Shutdown:** Clean termination of all services
- **Health Checks:** Ensures services are ready before proceeding
