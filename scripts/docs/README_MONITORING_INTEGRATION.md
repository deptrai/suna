# 🚀 Chain Lens Enhanced Monitoring Integration

## 📋 Overview

The `start_dev_v3_enhanced.sh` script has been enhanced to automatically launch the **4-panel monitoring dashboard** after all services are started. This provides a seamless development experience with comprehensive real-time monitoring.

## 🎯 What's New

### **Automatic Dashboard Launch**
- After starting all services (Redis, Backend, Frontend, Worker)
- Displays startup summary with service URLs and status
- Automatically launches 4-panel tmux monitoring dashboard
- No manual intervention needed for monitoring setup

### **Integrated Workflow**
```bash
./start_dev_v3_enhanced.sh
│
├─ 🔍 Environment validation
├─ 🏗️  Infrastructure checks  
├─ 🚀 Service startup (Redis → Backend → Frontend → Worker)
├─ 📊 Status summary display
└─ 🖥️  Auto-launch monitoring dashboard (NEW!)
```

## 📊 Dashboard Layout

```
┌─────────────────┬─────────────────┐
│ 🔄 Redis Monitor│ 🌐 Frontend Logs│  
│ Memory, Clients │ Request logs    │
├─────────────────┼─────────────────┤
│ 🔧 Backend Logs │ ⚙️ Worker Logs   │
│ API requests    │ Dramatiq tasks  │
└─────────────────┴─────────────────┘
```

## 🎮 Dashboard Controls

### **Navigation**
- `Ctrl+B + ↑↓←→` - Switch between panels
- `Ctrl+B + z` - Zoom/unzoom current panel
- `Ctrl+B + [` - Scroll mode (press `q` to exit)

### **Session Management** 
- `Ctrl+B + d` - Detach (dashboard continues in background)
- `Ctrl+C` - Exit dashboard (services continue running)
- `tmux attach -t chainlens-monitor` - Reattach to dashboard

## 🛠️ Management Commands

### **Dashboard Control**
```bash
# Check dashboard status
./monitoring_utils.sh status

# Start dashboard manually (if not auto-launched)
./monitoring_utils.sh start

# Attach to running dashboard
./monitoring_utils.sh attach

# View logs summary
./monitoring_utils.sh logs

# Stop dashboard
./monitoring_utils.sh stop
```

### **Service Control**
```bash
# Restart everything with dashboard
./start_dev_v3_enhanced.sh

# Quick cleanup if needed
./quick_cleanup_v2.sh
```

## 🔧 Service URLs

After startup completion, services are available at:

- **Frontend**: http://localhost:3000
- **Backend**: http://127.0.0.1:8000  
- **API Docs**: http://127.0.0.1:8000/docs
- **Dashboard**: Launched automatically in tmux

## 📱 Features

### **Real-time Monitoring**
- ✅ Service health checks every 20 seconds
- ✅ System metrics every 10 seconds  
- ✅ Color-coded log levels (Error/Warning/Info)
- ✅ Auto-timestamps on all logs
- ✅ Resource usage tracking (CPU, Memory, Disk)

### **Enhanced Logging**
- 🔄 **Redis**: Memory usage, connections, slow queries
- 🔧 **Backend**: API requests, health checks, error tracking
- 🌐 **Frontend**: Page requests, build status, performance
- ⚙️  **Worker**: Dramatiq tasks, LLM API calls, job status

### **Smart Recovery**
- 🔄 Circuit breaker patterns
- 🛡️  Graceful error handling  
- ⚡ Automatic service restart on failures
- 📊 Comprehensive error tracking

## 🚀 Getting Started

### **Quick Start**
```bash
cd /Users/mac_1/Documents/GitHub/chainlens/apps/chainlens-automation/scripts
./start_dev_v3_enhanced.sh
```

### **What Happens**
1. 🔍 Environment validation and cleanup
2. 🏗️  Infrastructure checks (Redis, Supabase)  
3. 🚀 Service startup with dependency management
4. 📊 Status summary and service URLs
5. 🖥️  **Auto-launch 4-panel monitoring dashboard**

### **Expected Output**
```
🎉 ENHANCED STARTUP COMPLETED SUCCESSFULLY!

🌐 Frontend:   http://localhost:3000
🔧 Backend:    http://127.0.0.1:8000
📚 API Docs:   http://127.0.0.1:8000/docs
🔄 Worker:     Running with circuit breakers
📊 Monitor:    Enhanced monitoring active

💡 Enhanced Management Commands:
   Dashboard status: ./monitoring_utils.sh status
   Start dashboard:  ./monitoring_utils.sh start
   Attach dashboard: ./monitoring_utils.sh attach

📊 ENHANCED MONITORING DASHBOARD
=================================
🚀 Launching 4-panel monitoring dashboard...
✨ Features: Split-screen logs, real-time metrics, interactive controls

🎯 Ready to start? (y/N): y
```

## 🔧 Troubleshooting

### **Dashboard Issues**
```bash
# Check if dashboard is running
./monitoring_utils.sh status

# Restart dashboard
./monitoring_utils.sh restart

# View recent logs
./monitoring_utils.sh logs
```

### **Service Issues**
```bash
# Check individual service status
curl http://127.0.0.1:8000/api/health    # Backend
curl http://localhost:3000               # Frontend  
redis-cli ping                          # Redis
ps aux | grep dramatiq                  # Worker
```

### **Tmux Issues**
```bash
# List tmux sessions
tmux list-sessions

# Kill stuck session
tmux kill-session -t chainlens-monitor

# Restart from clean state
./monitoring_utils.sh clean
./start_dev_v3_enhanced.sh
```

## 📈 Monitoring Data

### **Available Metrics**
- 📊 System: CPU usage, memory, disk space
- 🔄 Redis: Connections, memory usage, keyspace
- 🔧 Backend: Request rates, response times, health status
- 🌐 Frontend: Page loads, build status, assets
- ⚙️  Worker: Job queues, processing rates, errors

### **Log Locations**
- 📁 **Logs Directory**: `../logs/`
- 📄 **Backend**: `backend.log`
- 📄 **Frontend**: `frontend.log`
- 📄 **Worker**: `worker.log`  
- 📄 **Redis**: `redis_live.log` (auto-generated)
- 📄 **Dashboard**: `enhanced_monitor_output.log`

## 🎉 Benefits

### **Developer Experience**
- ✅ Zero manual setup for monitoring
- ✅ Instant visibility into all services  
- ✅ Interactive debugging capabilities
- ✅ Professional development environment

### **Operational Excellence**  
- ✅ Proactive issue detection
- ✅ Historical log analysis
- ✅ Performance trend monitoring
- ✅ Simplified troubleshooting workflow

---

**🚀 Enjoy your enhanced Chain Lens development environment with automatic 4-panel monitoring!**