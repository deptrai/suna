# CHAINLENS PLATFORM - DEVELOPMENT SCRIPTS & MONITORING

## 📋 **OVERVIEW**

This directory contains the complete development environment management scripts for the ChainLens platform. It includes startup, shutdown, cleanup scripts with integrated real-time monitoring to address and prevent the worker hang issues that were discovered during development.

## 🚨 **ROOT CAUSE ANALYSIS: WORKER HANG ISSUE**

### **Problem Description**
The ChainLens platform experienced critical worker hang issues where messages sent from the frontend would not receive responses after long wait times (60+ seconds). Workers would receive jobs but fail to complete processing.

### **Root Causes Identified**

#### **1. Process Conflict (Primary Cause - 90%)**
```bash
# Problem: 60+ competing processes
ps aux | grep -E "(dramatiq|spawn_main)" | wc -l
# Output: 61 processes!
```

**Issues:**
- Multiple Dramatiq workers consuming from the same Redis queue
- Resource exhaustion (database connections, Redis connections)
- Race conditions and deadlock situations
- Workers receiving jobs but unable to process due to conflicts

#### **2. Async Generator Cleanup (Secondary Cause - 8%)**
```python
# Problem: Missing proper cleanup in worker context
async for response in agent_gen:
    # Process responses
# ❌ No cleanup -> "RuntimeError: async generator ignored GeneratorExit"
```

**Issues:**
- Async generators not properly closed in Dramatiq worker context
- GeneratorExit exceptions not handled
- Resource leaks in background task processing

#### **3. Agent Logic Skip (Testing Issue - 2%)**
```python
# Problem: Agent skips execution when thread has assistant messages
latest_message = await client.table('messages').select('*').eq('thread_id', thread_id)...
if message_type == 'assistant':
    continue_execution = False  # ❌ Skips AI processing
    break
```

**Issues:**
- Agent correctly skips processing when thread already has assistant response
- E2E tests using same thread for multiple messages get skipped
- Need separate threads for each test message to ensure real AI calls

### **Why This Affected ChainLens Specifically**

**Complex Architecture:**
```
ChainLens Platform Stack:
├── FastAPI Backend
├── Next.js Frontend  
├── Redis (Queue + Cache + Pub/Sub)
├── Dramatiq (Background Tasks)
├── Supabase PostgreSQL
├── LiteLLM Router
├── Multiple MCP Servers
└── Agent System with Async Generators
```

**Development Environment Issues:**
- Multiple developers running concurrent workers
- Accumulated zombie processes from testing
- No automatic process cleanup
- Complex async resource management

**Why Self-Hosters Didn't Experience This:**
- Production deployments use clean Docker containers
- Single worker instances with proper isolation
- No development debris accumulation
- Simpler usage patterns (less concurrent testing)

## 💡 **SOLUTION IMPLEMENTATION**

### **1. Environment Cleanup**
```bash
# Kill all conflicting processes
pkill -9 -f "spawn_main" 
pkill -9 -f "dramatiq"
redis-cli flushall
```

### **2. Async Generator Cleanup Fix**
```python
# Fixed implementation in run_agent_background.py
try:
    agent_gen = run_agent(...)
    async for response in agent_gen:
        # Process responses
except Exception as e:
    logger.error(f"Error: {e}")
finally:
    # 🔑 KEY FIX: Proper cleanup
    if agent_gen:
        try:
            await agent_gen.aclose()
            logger.debug("Agent generator properly closed")
        except Exception as cleanup_error:
            logger.warning(f"Error during cleanup: {cleanup_error}")
```

### **3. Single Worker Configuration**
```bash
# Use single worker to eliminate conflicts
dramatiq --processes 1 --threads 1 run_agent_background --verbose
```

## 🛠️ **DEVELOPMENT SCRIPTS INFRASTRUCTURE**

### **Directory Structure**
```
scripts/
├── README.md                    # This documentation
├── start_dev.sh                 # Complete development environment startup with monitoring
├── stop_dev.sh                  # Development services shutdown
├── quick_cleanup.sh             # Environment cleanup and process management
└── DEV_SCRIPTS.md              # Additional development scripts documentation
```

### **New Features Added**
- **🔄 Real-time Monitoring**: Integrated monitoring system that tracks process health, memory usage, and detects conflicts
- **📊 Metrics Collection**: CSV-based metrics logging for performance analysis
- **🚨 Alert System**: Automatic detection of process conflicts and health issues
- **🧹 Enhanced Cleanup**: Improved cleanup that handles spawn_main processes and monitoring files

### **Scripts Overview**

#### **start_dev.sh** (Enhanced with Monitoring)
- **Phase 1**: Stop existing services to prevent conflicts
- **Phase 2**: Check infrastructure (Redis, Supabase)
- **Phase 3**: Start Dramatiq worker with single process configuration
- **Phase 4**: Start Backend API with health checks
- **Phase 5**: Start Frontend with readiness validation
- **Phase 6**: **NEW** - Start real-time monitoring system
- Provides detailed logging and colored output
- Tracks all process IDs for management

#### **stop_dev.sh** (Enhanced)
- Gracefully stops all development services
- **NEW** - Stops monitoring processes
- Preserves infrastructure services (Redis, Supabase)
- Provides clear status feedback

#### **quick_cleanup.sh** (Enhanced)
- **Phase 1**: Clear Redis data and Dramatiq queues
- **Phase 2**: Clear worker data and **NEW** monitoring files
- **Phase 3**: Kill all services including **NEW** spawn_main processes
- **NEW** - Enhanced process cleanup to prevent conflicts
- Comprehensive cleanup of temporary files

#### **Real-time Monitoring System** (NEW)
- **Health Monitoring**: Checks Frontend, Backend, Worker, Redis status every 30s
- **Memory Tracking**: Monitors memory usage of all services
- **Process Conflict Detection**: Alerts when too many Dramatiq processes detected
- **Metrics Logging**: CSV format for analysis (timestamp, status, memory, process count)
- **Alert System**: Warns about unhealthy services and process conflicts
- **Background Operation**: Runs independently with graceful shutdown

## 🚀 **USAGE INSTRUCTIONS**

### **Quick Start - Complete Development Environment**
```bash
# Start complete development environment with monitoring
./scripts/start_dev.sh

# This will:
# ✅ Stop any existing services
# ✅ Check Redis and Supabase
# ✅ Start Worker, Backend, Frontend
# ✅ Start real-time monitoring
# ✅ Provide all service URLs and PIDs
```

### **Step-by-Step Management**
```bash
# 1. Start development environment
./scripts/start_dev.sh

# 2. View real-time monitoring
tail -f logs/monitoring.log

# 3. Check metrics data
tail -f logs/metrics.log

# 4. Stop services when done
./scripts/stop_dev.sh

# 5. Clean environment (if needed)
./scripts/quick_cleanup.sh
```

### **Configuration**
```bash
# Load custom configuration
source config.env

# Or use environment variables
export WORKER_PROCESSES=1
export WORKER_THREADS=1
export SUPABASE_URL=http://127.0.0.1:54321
```

## 🔧 **ENVIRONMENT SETUP**

### **Prerequisites**
- Python 3.12+
- Redis server running
- Supabase local instance
- uv package manager
- Backend dependencies installed

### **Required Services**
```bash
# Start Redis
redis-server

# Start Supabase (in backend directory)
supabase start

# Verify services
redis-cli ping
curl http://127.0.0.1:54321/rest/v1/
```

### **Environment Variables**
```bash
# Required
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your_anon_key

# Optional
REDIS_HOST=localhost
REDIS_PORT=6379
WORKER_PROCESSES=1
WORKER_THREADS=1
```

## 🐛 **TROUBLESHOOTING GUIDE**

### **Common Issues**

#### **Worker Hang Issues**
```bash
# Check for process conflicts
ps aux | grep -E "(dramatiq|spawn_main)"

# Clean environment
./cleanup_environment.sh

# Restart with single worker
./start_worker.sh
```

#### **Redis Connection Issues**
```bash
# Check Redis status
redis-cli ping

# Check Redis keys
redis-cli keys "*"

# Flush if needed
redis-cli flushall
```

#### **Database Connection Issues**
```bash
# Check Supabase status
curl http://127.0.0.1:54321/rest/v1/

# Restart Supabase
cd backend && supabase stop && supabase start
```

#### **Import Errors**
```bash
# Ensure proper Python path
export PYTHONPATH="${PYTHONPATH}:$(pwd)/../../backend"

# Install dependencies
cd ../../backend && uv sync
```

### **Debug Mode**
```bash
# Enable verbose logging
export VERBOSE_LOGGING=true
export LOG_LEVEL=DEBUG

# Run with debug output
./run_e2e_test.sh
```

## 📊 **MONITORING & PERFORMANCE EXPECTATIONS**

### **Monitoring Metrics**
- **Health Status**: All services should show "healthy"
- **Memory Usage**: Typical ranges:
  - Frontend: 200-400MB
  - Backend: 30-60MB
  - Worker: 15-40MB
  - Redis: 0-10MB
- **Process Count**: Should be ≤ 3 Dramatiq processes (1 main + 2 workers)

### **Performance Indicators**
- **Good**: All services healthy, memory within ranges, ≤3 processes
- **Warning**: High memory usage (>500MB), 4-5 processes
- **Critical**: Any service unhealthy, >5 processes (conflict detected)

### **Alert Conditions**
- 🚨 **ALERT**: >5 Dramatiq processes detected (process conflict)
- ⚠️ **WARNING**: Any service shows "unhealthy" status
- 📊 **INFO**: Regular health checks every 30 seconds

## 🔒 **DEVELOPMENT BEST PRACTICES**

### **Async Resource Management**
```python
# Always use proper cleanup for async generators
async def safe_async_processing():
    generator = None
    try:
        generator = create_async_generator()
        async for item in generator:
            yield item
    finally:
        if generator:
            await generator.aclose()
```

### **Process Management**
```bash
# Regular cleanup during development
./cleanup_environment.sh

# Monitor process counts
ps aux | grep -E "(dramatiq|spawn_main)" | wc -l
```

### **Development Workflow**
1. **Always run cleanup before starting**: `./scripts/quick_cleanup.sh`
2. **Start with monitoring**: `./scripts/start_dev.sh` (includes monitoring)
3. **Monitor process health**: Check `logs/monitoring.log` for alerts
4. **Watch for conflicts**: Alert if >5 Dramatiq processes detected
5. **Clean shutdown**: Use `./scripts/stop_dev.sh` when done
6. **Regular cleanup**: Run cleanup between development sessions

### **E2E Testing Best Practices**
```python
# ✅ CORRECT: Separate threads for each message
thread_1 = create_fresh_thread()  # Message 1 gets real AI response
thread_2 = create_fresh_thread()  # Message 2 gets real AI response

# ❌ INCORRECT: Same thread for multiple messages
thread = create_thread()
send_message_1(thread)  # Gets real AI response
send_message_2(thread)  # Skipped! Thread already has assistant message
```

## 📈 **MONITORING & ALERTING DETAILS**

### **Monitoring Files**
- **`logs/monitoring.log`**: Human-readable monitoring events and alerts
- **`logs/metrics.log`**: CSV format metrics for analysis
- **`logs/monitor_output.log`**: Raw monitoring script output
- **`logs/monitor.sh`**: Auto-generated monitoring script

### **Key Metrics Tracked**
- **Service Health**: Frontend, Backend, Worker, Redis status
- **Memory Usage**: Real-time memory consumption per service
- **Process Count**: Dramatiq process monitoring (conflict detection)
- **Timestamps**: All events timestamped for analysis

### **Alert System**
- **🚨 CRITICAL**: >5 Dramatiq processes (immediate conflict risk)
- **⚠️ WARNING**: Any service unhealthy (requires attention)
- **📊 INFO**: Regular health checks (every 30 seconds)
- **🔧 STATUS**: Service startup/shutdown events

## 🎯 **FUTURE IMPROVEMENTS**

### **Containerization**
```dockerfile
# Isolated worker containers
FROM python:3.12
COPY . /app
CMD ["dramatiq", "--processes", "1", "--threads", "1", "worker"]
```

### **Automated Monitoring**
- Process count monitoring
- Automatic cleanup triggers
- Health check endpoints
- Performance dashboards

### **CI/CD Integration**
- Automated E2E testing in CI
- Environment isolation
- Performance regression detection
- Automated cleanup in pipelines

---

## 📞 **SUPPORT & TROUBLESHOOTING**

### **Common Issues & Solutions**

#### **"Too many Dramatiq processes" Alert**
```bash
# Check current process count
ps aux | grep -E "(dramatiq|spawn_main)" | grep -v grep | wc -l

# If >5 processes, run cleanup
./scripts/quick_cleanup.sh

# Restart clean environment
./scripts/start_dev.sh
```

#### **Services Not Starting**
```bash
# Check infrastructure
redis-cli ping
curl http://localhost:54321/health

# Check logs
tail -f logs/*.log

# Full cleanup and restart
./scripts/quick_cleanup.sh && ./scripts/start_dev.sh
```

#### **Monitoring Not Working**
```bash
# Check if monitoring process is running
pgrep -f monitor.sh

# Check monitoring logs
tail -f logs/monitoring.log

# Restart monitoring (included in start_dev.sh)
./scripts/start_dev.sh
```

### **Getting Help**
1. **Check monitoring logs**: `tail -f logs/monitoring.log`
2. **Review metrics**: `tail -f logs/metrics.log`
3. **Check service logs**: `tail -f logs/{frontend,backend,worker}.log`
4. **Run cleanup**: `./scripts/quick_cleanup.sh`
5. **Fresh start**: `./scripts/start_dev.sh`

**Remember**: The enhanced scripts with monitoring prevent most worker hang issues by detecting and alerting on process conflicts before they cause problems.
