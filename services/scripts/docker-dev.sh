#!/bin/bash

# =====================================================
# ChainLens Core - Development Docker Management Script
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker-compose > /dev/null 2>&1; then
        log_error "Docker Compose is not installed. Please install Docker Compose and try again."
        exit 1
    fi
}

# Build development images
build() {
    log_info "Building development Docker images..."
    cd "$PROJECT_DIR"
    docker-compose build --no-cache
    log_success "Development images built successfully!"
}

# Start development environment
start() {
    log_info "Starting development environment..."
    cd "$PROJECT_DIR"
    
    # Copy environment file if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.development .env
        log_info "Created .env file from .env.development"
    fi
    
    docker-compose up -d
    log_success "Development environment started!"
    
    # Show service status
    echo ""
    log_info "Service Status:"
    docker-compose ps
    
    echo ""
    log_info "Available Services:"
    echo "  - ChainLens Core API: http://localhost:3006"
    echo "  - Swagger Documentation: http://localhost:3006/api/docs"
    echo "  - Health Check: http://localhost:3006/api/v1/health"
    echo "  - Database (Adminer): http://localhost:8080"
    echo "  - Redis Commander: http://localhost:8081"
    echo "  - Prometheus: http://localhost:9090"
    echo "  - Grafana: http://localhost:3000"
}

# Stop development environment
stop() {
    log_info "Stopping development environment..."
    cd "$PROJECT_DIR"
    docker-compose down
    log_success "Development environment stopped!"
}

# Restart development environment
restart() {
    log_info "Restarting development environment..."
    stop
    start
}

# Show logs
logs() {
    cd "$PROJECT_DIR"
    if [ -n "$1" ]; then
        log_info "Showing logs for service: $1"
        docker-compose logs -f "$1"
    else
        log_info "Showing logs for all services..."
        docker-compose logs -f
    fi
}

# Clean up development environment
clean() {
    log_warning "This will remove all containers, networks, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up development environment..."
        cd "$PROJECT_DIR"
        docker-compose down -v --remove-orphans
        docker system prune -f
        log_success "Development environment cleaned up!"
    else
        log_info "Cleanup cancelled."
    fi
}

# Reset development environment
reset() {
    log_warning "This will reset the entire development environment!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        clean
        build
        start
        log_success "Development environment reset complete!"
    else
        log_info "Reset cancelled."
    fi
}

# Show status
status() {
    cd "$PROJECT_DIR"
    log_info "Development Environment Status:"
    docker-compose ps
    
    echo ""
    log_info "Docker System Info:"
    docker system df
}

# Execute command in container
exec_cmd() {
    if [ -z "$1" ]; then
        log_error "Please specify a service name"
        exit 1
    fi
    
    service="$1"
    shift
    
    cd "$PROJECT_DIR"
    log_info "Executing command in $service container..."
    docker-compose exec "$service" "${@:-sh}"
}

# Show help
show_help() {
    echo "ChainLens Core - Development Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build     Build development Docker images"
    echo "  start     Start development environment"
    echo "  stop      Stop development environment"
    echo "  restart   Restart development environment"
    echo "  logs      Show logs (optionally for specific service)"
    echo "  status    Show environment status"
    echo "  clean     Clean up containers, networks, and volumes"
    echo "  reset     Reset entire development environment"
    echo "  exec      Execute command in container"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start development environment"
    echo "  $0 logs chainlens-core      # Show logs for chainlens-core service"
    echo "  $0 exec chainlens-core bash # Open bash in chainlens-core container"
    echo "  $0 exec postgres psql -U postgres -d chainlens_core"
}

# Main script logic
main() {
    check_docker
    check_docker_compose
    
    case "${1:-help}" in
        build)
            build
            ;;
        start)
            start
            ;;
        stop)
            stop
            ;;
        restart)
            restart
            ;;
        logs)
            logs "$2"
            ;;
        status)
            status
            ;;
        clean)
            clean
            ;;
        reset)
            reset
            ;;
        exec)
            shift
            exec_cmd "$@"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Unknown command: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
