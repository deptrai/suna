#!/bin/bash

# ChainLens Development Scripts - Shared Utilities Library
# Thư viện tiện ích dùng chung cho các scripts phát triển ChainLens

# Colors for output (Màu sắc cho output) - Only set if not already defined
if [[ -z "$RED" ]]; then
    readonly RED='\033[0;31m'
    readonly GREEN='\033[0;32m'
    readonly YELLOW='\033[1;33m'
    readonly BLUE='\033[0;34m'
    readonly CYAN='\033[0;36m'
    readonly PURPLE='\033[0;35m'
    readonly NC='\033[0m' # No Color
fi

# Global variables (Biến toàn cục) - Use different names to avoid conflicts
UTILS_SCRIPT_DIR=""
PROJECT_ROOT=""
CONFIG_FILE=""
LOG_LEVEL="INFO"

# Initialize utilities (Khởi tạo utilities)
init_utils() {
    local temp_script_dir

    # Determine script directory from caller
    if [[ -n "$SCRIPT_DIR" ]]; then
        temp_script_dir="$SCRIPT_DIR"
    else
        temp_script_dir="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
    fi

    # Determine PROJECT_ROOT based on temp_script_dir
    if [[ "$(basename "$temp_script_dir")" == "scripts" ]]; then
        PROJECT_ROOT="$(dirname "$temp_script_dir")"
    elif [[ "$(basename "$temp_script_dir")" == "lib" || "$(basename "$temp_script_dir")" == "test" ]]; then
        PROJECT_ROOT="$(dirname "$(dirname "$temp_script_dir")")"
    else
        PROJECT_ROOT="$(dirname "$temp_script_dir")"
    fi

    # Set config file path relative to scripts directory
    local scripts_dir="$PROJECT_ROOT/scripts"
    CONFIG_FILE="$scripts_dir/config/dev-environment.yaml"

    # Create logs directory if not exists
    mkdir -p "$PROJECT_ROOT/logs"

    # Initialize structured logging
    init_structured_logging
}

# Structured logging functions (Hàm logging có cấu trúc)
init_structured_logging() {
    # Ensure PROJECT_ROOT is set
    if [[ -z "$PROJECT_ROOT" ]]; then
        echo "Warning: PROJECT_ROOT not set, using current directory"
        PROJECT_ROOT="$(pwd)"
    fi

    local structured_log="$PROJECT_ROOT/logs/structured.jsonl"
    local error_log="$PROJECT_ROOT/logs/errors.log"

    # Create logs directory if not exists
    mkdir -p "$PROJECT_ROOT/logs"

    # Initialize log files with headers
    echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",\"level\":\"INFO\",\"component\":\"utils\",\"message\":\"Structured logging initialized\"}" > "$structured_log"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR LOG INITIALIZED" > "$error_log"
}

# Structured logging function (Hàm logging có cấu trúc)
log_structured() {
    local level="$1"
    local component="$2"
    local message="$3"
    local extra="${4:-{}}"

    # Ensure PROJECT_ROOT is set
    if [[ -z "$PROJECT_ROOT" ]]; then
        PROJECT_ROOT="$(pwd)"
        mkdir -p "$PROJECT_ROOT/logs"
    fi

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
    local structured_log="$PROJECT_ROOT/logs/structured.jsonl"
    
    # Determine error category and severity
    local category="general"
    local severity="medium"

    case "$component" in
        "backend_errors"|"redis_errors"|"llm_errors"|"image_generation")
            category="application_error"
            case "$level" in
                "ERROR") severity="high" ;;
                "WARN") severity="medium" ;;
                *) severity="low" ;;
            esac
            ;;
        "health_check"|"monitoring")
            category="infrastructure"
            severity="low"
            ;;
        "alert")
            category="alert"
            severity="critical"
            ;;
        *)
            category="system"
            severity="low"
            ;;
    esac

    # Create enhanced JSON log entry with categorization
    local log_entry=$(cat <<EOF
{"timestamp":"$timestamp","level":"$level","component":"$component","category":"$category","severity":"$severity","message":"$message","extra":$extra}
EOF
)
    
    echo "$log_entry" >> "$structured_log"
    
    # Also log to console if appropriate level
    case "$level" in
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $component: $message" >&2
            if [[ -n "$PROJECT_ROOT" ]]; then
                echo "$(date '+%Y-%m-%d %H:%M:%S') - $component: $message" >> "$PROJECT_ROOT/logs/errors.log"
            fi
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $component: $message"
            ;;
        "INFO")
            if [[ "$LOG_LEVEL" == "DEBUG" || "$LOG_LEVEL" == "INFO" ]]; then
                echo -e "${CYAN}[INFO]${NC} $component: $message"
            fi
            ;;
        "DEBUG")
            if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
                echo -e "${BLUE}[DEBUG]${NC} $component: $message"
            fi
            ;;
    esac
}

# Configuration loading functions (Hàm load cấu hình)
load_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log_structured "ERROR" "config" "Configuration file not found: $CONFIG_FILE"
        return 1
    fi
    
    log_structured "INFO" "config" "Loading configuration from $CONFIG_FILE"
    return 0
}

# Get configuration value (Lấy giá trị cấu hình)
get_config_value() {
    local key="$1"
    local default_value="${2:-}"
    
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo "$default_value"
        return 1
    fi
    
    # Use yq to parse YAML (fallback to grep if yq not available)
    if command -v yq >/dev/null 2>&1; then
        local value=$(yq eval ".$key" "$CONFIG_FILE" 2>/dev/null)
        if [[ "$value" != "null" && -n "$value" ]]; then
            echo "$value"
        else
            echo "$default_value"
        fi
    else
        # Improved fallback parsing for nested YAML keys
        local search_key
        if [[ "$key" == *"."* ]]; then
            # Extract the last part of the key for nested keys
            search_key="${key##*.}"
        else
            search_key="$key"
        fi

        # Search for the key and extract value (remove comments)
        local value=$(grep -E "^\s*${search_key}:" "$CONFIG_FILE" | head -1 | sed 's/.*: *//' | sed 's/ *#.*//' | tr -d '"' 2>/dev/null)
        echo "${value:-$default_value}"
    fi
}

# Validation functions (Hàm validation)
validate_timeout() {
    local timeout="$1"
    local param_name="${2:-timeout}"
    
    if [[ ! "$timeout" =~ ^[0-9]+$ ]] || [[ "$timeout" -lt 1 ]] || [[ "$timeout" -gt 300 ]]; then
        log_structured "ERROR" "validation" "Invalid $param_name: $timeout (must be 1-300 seconds)"
        return 1
    fi
    return 0
}

validate_port() {
    local port="$1"
    local param_name="${2:-port}"
    
    if [[ ! "$port" =~ ^[0-9]+$ ]] || [[ "$port" -lt 1 ]] || [[ "$port" -gt 65535 ]]; then
        log_structured "ERROR" "validation" "Invalid $param_name: $port (must be 1-65535)"
        return 1
    fi
    return 0
}

validate_url() {
    local url="$1"
    local param_name="${2:-URL}"
    
    if [[ ! "$url" =~ ^https?:// ]]; then
        log_structured "ERROR" "validation" "Invalid $param_name: $url (must start with http:// or https://)"
        return 1
    fi
    return 0
}

# Error handling functions (Hàm xử lý lỗi)
handle_error() {
    local error_code="$1"
    local component="$2"
    local message="$3"
    local suggestion="${4:-Check logs for more details}"
    
    log_structured "ERROR" "$component" "$message" "{\"error_code\":\"$error_code\",\"suggestion\":\"$suggestion\"}"
    
    echo -e "${RED}❌ Error [$error_code]:${NC} $message"
    echo -e "${YELLOW}💡 Suggestion:${NC} $suggestion"
    
    return "$error_code"
}

handle_service_error() {
    local service_name="$1"
    local error_type="$2"
    local details="${3:-No additional details}"
    
    case "$error_type" in
        "timeout")
            handle_error 124 "$service_name" "Service health check timed out" "Check if $service_name is running and accessible"
            ;;
        "connection_refused")
            handle_error 111 "$service_name" "Connection refused" "Ensure $service_name is started and listening on correct port"
            ;;
        "not_found")
            handle_error 404 "$service_name" "Service endpoint not found" "Verify $service_name configuration and endpoints"
            ;;
        "unauthorized")
            handle_error 401 "$service_name" "Authentication failed" "Check API keys and credentials for $service_name"
            ;;
        *)
            handle_error 1 "$service_name" "Unknown error: $error_type" "$details"
            ;;
    esac
}

# Process management functions (Hàm quản lý process)
get_process_count() {
    local pattern="$1"
    local count=$(ps aux | grep -E "$pattern" | grep -v grep | wc -l 2>/dev/null || echo "0")
    # Trim whitespace and ensure it's a number
    count=$(echo "$count" | tr -d ' ')
    echo "${count:-0}"
}

get_process_memory() {
    local pattern="$1"
    local memory=$(ps aux | grep -E "$pattern" | grep -v grep | awk '{sum += $6} END {print sum/1024}' 2>/dev/null)
    echo "${memory:-0}"
}

kill_processes_by_pattern() {
    local pattern="$1"
    local signal="${2:-TERM}"
    local component="${3:-process}"
    
    local pids=$(pgrep -f "$pattern" 2>/dev/null)
    if [[ -n "$pids" ]]; then
        log_structured "INFO" "$component" "Killing processes matching pattern: $pattern"
        echo "$pids" | xargs kill -"$signal" 2>/dev/null || true
        sleep 2
        
        # Force kill if still running
        local remaining_pids=$(pgrep -f "$pattern" 2>/dev/null)
        if [[ -n "$remaining_pids" ]]; then
            log_structured "WARN" "$component" "Force killing remaining processes"
            echo "$remaining_pids" | xargs kill -KILL 2>/dev/null || true
        fi
    fi
}

# Network utility functions (Hàm tiện ích mạng)
check_port_available() {
    local port="$1"
    local host="${2:-localhost}"
    
    if command -v nc >/dev/null 2>&1; then
        ! nc -z "$host" "$port" 2>/dev/null
    else
        ! timeout 1 bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null
    fi
}

wait_for_service() {
    local host="$1"
    local port="$2"
    local timeout="${3:-30}"
    local service_name="${4:-service}"
    
    validate_timeout "$timeout" "wait timeout" || return 1
    validate_port "$port" "service port" || return 1
    
    log_structured "INFO" "wait_service" "Waiting for $service_name at $host:$port (timeout: ${timeout}s)"
    
    local count=0
    while [[ $count -lt $timeout ]]; do
        if ! check_port_available "$port" "$host"; then
            log_structured "INFO" "wait_service" "$service_name is ready at $host:$port"
            return 0
        fi
        sleep 1
        ((count++))
    done
    
    handle_service_error "$service_name" "timeout" "Service did not start within ${timeout} seconds"
    return 124
}

# Cleanup functions (Hàm dọn dẹp)
cleanup_logs() {
    local retention_days="${1:-7}"
    local logs_dir="$PROJECT_ROOT/logs"
    
    if [[ -d "$logs_dir" ]]; then
        log_structured "INFO" "cleanup" "Cleaning up logs older than $retention_days days"
        find "$logs_dir" -name "*.log" -type f -mtime +$retention_days -delete 2>/dev/null || true
        find "$logs_dir" -name "*.jsonl" -type f -mtime +$retention_days -delete 2>/dev/null || true
    fi
}

# Don't auto-initialize when sourced - let the main script call init_utils explicitly
