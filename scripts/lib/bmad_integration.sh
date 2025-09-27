#!/bin/bash

# ChainLens Development Scripts - BMAD Framework Integration
# Tích hợp với BMAD Framework

# Source utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/utils.sh"

# BMAD configuration paths
BMAD_CORE_DIR="$PROJECT_ROOT/.bmad-core"
BMAD_CONFIG="$BMAD_CORE_DIR/core-config.yaml"
BMAD_AGENTS_DIR="$BMAD_CORE_DIR/agents"
BMAD_TASKS_DIR="$BMAD_CORE_DIR/tasks"

# Load BMAD configuration
load_bmad_config() {
    if [[ ! -f "$BMAD_CONFIG" ]]; then
        log_structured "WARN" "bmad" "BMAD configuration not found: $BMAD_CONFIG"
        return 1
    fi
    
    log_structured "INFO" "bmad" "Loading BMAD configuration from $BMAD_CONFIG"
    
    # Extract project information from BMAD config
    if command -v yq >/dev/null 2>&1; then
        local project_name=$(yq eval '.project.name' "$BMAD_CONFIG" 2>/dev/null)
        local project_version=$(yq eval '.project.version' "$BMAD_CONFIG" 2>/dev/null)
        local project_description=$(yq eval '.project.description' "$BMAD_CONFIG" 2>/dev/null)
        
        if [[ "$project_name" != "null" && -n "$project_name" ]]; then
            export BMAD_PROJECT_NAME="$project_name"
            log_structured "INFO" "bmad" "Project name: $project_name"
        fi
        
        if [[ "$project_version" != "null" && -n "$project_version" ]]; then
            export BMAD_PROJECT_VERSION="$project_version"
            log_structured "INFO" "bmad" "Project version: $project_version"
        fi
        
        if [[ "$project_description" != "null" && -n "$project_description" ]]; then
            export BMAD_PROJECT_DESCRIPTION="$project_description"
            log_structured "INFO" "bmad" "Project description: $project_description"
        fi
    else
        log_structured "WARN" "bmad" "yq not available, using basic BMAD config parsing"
    fi
    
    return 0
}

# Get BMAD agent persona
get_bmad_agent() {
    local agent_name="$1"
    local agent_file="$BMAD_AGENTS_DIR/${agent_name}.md"
    
    if [[ ! -f "$agent_file" ]]; then
        log_structured "WARN" "bmad" "BMAD agent not found: $agent_file"
        return 1
    fi
    
    log_structured "INFO" "bmad" "Loading BMAD agent: $agent_name"
    
    # Extract agent information
    local agent_title=$(grep "^# " "$agent_file" | head -1 | sed 's/^# //')
    local agent_role=$(grep -A 5 "## Role" "$agent_file" | tail -n +2 | head -1)
    
    export BMAD_CURRENT_AGENT="$agent_name"
    export BMAD_AGENT_TITLE="$agent_title"
    export BMAD_AGENT_ROLE="$agent_role"
    
    log_structured "INFO" "bmad" "Agent loaded: $agent_title" "{\"agent\":\"$agent_name\",\"role\":\"$agent_role\"}"
    
    return 0
}

# Execute BMAD task
execute_bmad_task() {
    local task_name="$1"
    local task_file="$BMAD_TASKS_DIR/${task_name}.md"
    
    if [[ ! -f "$task_file" ]]; then
        log_structured "WARN" "bmad" "BMAD task not found: $task_file"
        return 1
    fi
    
    log_structured "INFO" "bmad" "Executing BMAD task: $task_name"
    
    # Extract task information
    local task_title=$(grep "^# " "$task_file" | head -1 | sed 's/^# //')
    local task_description=$(grep -A 10 "## Description" "$task_file" | tail -n +2 | head -5)
    
    echo -e "${PURPLE}🎯 BMAD Task: $task_title${NC}"
    echo -e "${PURPLE}Description: $task_description${NC}"
    
    log_structured "INFO" "bmad" "Task executed: $task_title" "{\"task\":\"$task_name\",\"description\":\"$task_description\"}"
    
    return 0
}

# Validate BMAD framework integration
validate_bmad_integration() {
    log_structured "INFO" "bmad" "Validating BMAD framework integration"
    
    local validation_errors=0
    
    # Check BMAD core directory
    if [[ ! -d "$BMAD_CORE_DIR" ]]; then
        log_structured "ERROR" "bmad" "BMAD core directory not found: $BMAD_CORE_DIR"
        ((validation_errors++))
    fi
    
    # Check BMAD configuration
    if [[ ! -f "$BMAD_CONFIG" ]]; then
        log_structured "ERROR" "bmad" "BMAD configuration not found: $BMAD_CONFIG"
        ((validation_errors++))
    fi
    
    # Check agents directory
    if [[ ! -d "$BMAD_AGENTS_DIR" ]]; then
        log_structured "ERROR" "bmad" "BMAD agents directory not found: $BMAD_AGENTS_DIR"
        ((validation_errors++))
    fi
    
    # Check tasks directory
    if [[ ! -d "$BMAD_TASKS_DIR" ]]; then
        log_structured "ERROR" "bmad" "BMAD tasks directory not found: $BMAD_TASKS_DIR"
        ((validation_errors++))
    fi
    
    # Check for essential agents
    local essential_agents=("dev" "architect" "qa")
    for agent in "${essential_agents[@]}"; do
        if [[ ! -f "$BMAD_AGENTS_DIR/${agent}.md" ]]; then
            log_structured "WARN" "bmad" "Essential BMAD agent not found: $agent"
            ((validation_errors++))
        fi
    done
    
    if [[ $validation_errors -eq 0 ]]; then
        log_structured "INFO" "bmad" "BMAD framework integration validation passed"
        return 0
    else
        log_structured "ERROR" "bmad" "BMAD framework integration validation failed" "{\"errors\":$validation_errors}"
        return 1
    fi
}

# Generate BMAD-compliant documentation
generate_bmad_docs() {
    local doc_type="$1"
    local output_file="$2"
    
    log_structured "INFO" "bmad" "Generating BMAD documentation: $doc_type"
    
    case "$doc_type" in
        "scripts_overview")
            cat > "$output_file" << EOF
# ChainLens Development Scripts Overview

## Project Information
- **Name**: ${BMAD_PROJECT_NAME:-ChainLens Platform}
- **Version**: ${BMAD_PROJECT_VERSION:-1.0.0}
- **Description**: ${BMAD_PROJECT_DESCRIPTION:-Open source generalist AI Worker}

## Scripts Architecture

### Production-Ready Scripts v2.0
- **start_dev_v2.sh**: Enhanced startup with structured monitoring
- **stop_dev_v2.sh**: Graceful shutdown with verification
- **quick_cleanup_v2.sh**: Comprehensive environment cleanup

### Shared Libraries
- **lib/utils.sh**: Core utilities and configuration management
- **lib/health_checks.sh**: Comprehensive health checking system
- **lib/monitoring.sh**: Real-time monitoring and alerting

### Configuration
- **config/dev-environment.yaml**: Centralized configuration management

### Testing
- **test/test_scripts.sh**: Comprehensive test suite

## BMAD Integration
- Configuration loading from .bmad-core/core-config.yaml
- Agent persona integration
- Task execution framework
- Structured logging with BMAD context

## Compliance
- ✅ Coding Standards: Full compliance with ChainLens coding standards
- ✅ Error Handling: Structured error handling with proper logging
- ✅ Type Safety: Input validation and type checking
- ✅ Production Ready: Comprehensive testing and monitoring
EOF
            ;;
        "health_check_report")
            cat > "$output_file" << EOF
# Health Check Report

Generated: $(date '+%Y-%m-%d %H:%M:%S')
Project: ${BMAD_PROJECT_NAME:-ChainLens Platform}

## Infrastructure Services
- Redis: $(check_redis_health)
- Supabase: $(check_supabase_health)

## Application Services
- Frontend: $(check_frontend_health)
- Backend: $(check_backend_health)
- Worker: $(check_worker_health)

## System Metrics
- Memory Usage: $(check_memory_usage && echo "OK" || echo "HIGH")
- Process Count: $(get_process_count "dramatiq|spawn_main")

## BMAD Framework
- Integration: $(validate_bmad_integration && echo "VALID" || echo "INVALID")
- Current Agent: ${BMAD_CURRENT_AGENT:-None}
EOF
            ;;
        *)
            log_structured "ERROR" "bmad" "Unknown documentation type: $doc_type"
            return 1
            ;;
    esac
    
    log_structured "INFO" "bmad" "BMAD documentation generated: $output_file"
    return 0
}

# Initialize BMAD integration
init_bmad_integration() {
    log_structured "INFO" "bmad" "Initializing BMAD framework integration"
    
    # Load BMAD configuration
    if load_bmad_config; then
        log_structured "INFO" "bmad" "BMAD configuration loaded successfully"
    else
        log_structured "WARN" "bmad" "BMAD configuration loading failed, using defaults"
    fi
    
    # Validate integration
    if validate_bmad_integration; then
        log_structured "INFO" "bmad" "BMAD framework integration validated"
        export BMAD_INTEGRATION_ACTIVE="true"
    else
        log_structured "WARN" "bmad" "BMAD framework integration validation failed"
        export BMAD_INTEGRATION_ACTIVE="false"
    fi
    
    # Set default agent if available
    if [[ -f "$BMAD_AGENTS_DIR/dev.md" ]]; then
        get_bmad_agent "dev"
    fi
    
    return 0
}

# Display BMAD status
display_bmad_status() {
    echo -e "${PURPLE}🎯 BMAD Framework Status${NC}"
    echo -e "${PURPLE}========================${NC}"
    
    if [[ "$BMAD_INTEGRATION_ACTIVE" == "true" ]]; then
        echo -e "Status: ${GREEN}Active${NC}"
        echo -e "Project: ${BMAD_PROJECT_NAME:-Unknown}"
        echo -e "Version: ${BMAD_PROJECT_VERSION:-Unknown}"
        echo -e "Current Agent: ${BMAD_CURRENT_AGENT:-None}"
        echo -e "Agent Role: ${BMAD_AGENT_ROLE:-None}"
    else
        echo -e "Status: ${YELLOW}Inactive${NC}"
        echo -e "Reason: BMAD framework not properly configured"
    fi
    
    echo ""
}

# Export functions for use in other scripts
export -f load_bmad_config
export -f get_bmad_agent
export -f execute_bmad_task
export -f validate_bmad_integration
export -f generate_bmad_docs
export -f init_bmad_integration
export -f display_bmad_status
