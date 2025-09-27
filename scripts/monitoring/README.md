# 📊 Monitoring Scripts

Advanced monitoring tools with 4-panel tmux dashboard and comprehensive service tracking.

## Scripts

### **`enhanced_dashboard_monitor.sh`**
4-panel tmux monitoring dashboard with real-time logs:
- Split-screen layout (Redis, Backend, Frontend, Worker)
- Color-coded log levels and timestamps
- Interactive tmux controls
- Background persistence

### **`start_monitoring_dashboard.sh`**
Quick launcher for monitoring dashboard:
- User confirmation prompt
- Seamless integration with startup scripts

### **`monitoring_utils.sh`**
Management utilities for dashboard:
- `status` - Check dashboard and services status
- `start` - Start dashboard manually
- `stop` - Stop dashboard
- `attach` - Attach to running dashboard
- `logs` - Show recent logs summary

### **`setup-monitoring.sh`**
Initial monitoring infrastructure setup

### **`view_logs.sh`**
Real-time log viewer for individual services

## Usage Examples

```bash
# Start dashboard
./start_monitoring_dashboard.sh

# Check status
./monitoring_utils.sh status

# Attach to running session
./monitoring_utils.sh attach

# View logs summary
./monitoring_utils.sh logs
```

## Dashboard Controls

- `Ctrl+B + ↑↓←→` - Switch between panels
- `Ctrl+B + z` - Zoom/unzoom current panel
- `Ctrl+B + d` - Detach (keeps running in background)
- `Ctrl+B + [` - Scroll mode (press `q` to exit)

## Features

- ✅ 4-panel real-time monitoring
- ✅ Automatic service discovery
- ✅ Color-coded log levels
- ✅ System metrics tracking
- ✅ Session management and persistence