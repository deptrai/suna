#!/bin/bash

# =====================================================
# ChainLens Core - Production Docker Management Script
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

# Check if production environment file exists
check_env_file() {
    if [ ! -f "$PROJECT_DIR/.env.production" ]; then
        log_error "Production environment file (.env.production) not found!"
        log_info "Please copy .env.production.example to .env.production and configure it."
        exit 1
    fi
}

# Build production images
build() {
    log_info "Building production Docker images..."
    cd "$PROJECT_DIR"
    docker-compose -f docker-compose.prod.yml build --no-cache
    log_success "Production images built successfully!"
}

# Deploy production environment
deploy() {
    log_info "Deploying production environment..."
    cd "$PROJECT_DIR"
    
    # Copy production environment file
    cp .env.production .env
    log_info "Using production environment configuration"
    
    # Pull latest images if not building locally
    docker-compose -f docker-compose.prod.yml pull
    
    # Start services
    docker-compose -f docker-compose.prod.yml up -d
    log_success "Production environment deployed!"
    
    # Show service status
    echo ""
    log_info "Service Status:"
    docker-compose -f docker-compose.prod.yml ps
    
    echo ""
    log_info "Production Services:"
    echo "  - ChainLens Core API: https://your-domain.com"
    echo "  - Health Check: https://your-domain.com/api/v1/health"
    echo "  - Prometheus: http://your-domain.com:9090"
    echo "  - Grafana: http://your-domain.com:3000"
}

# Stop production environment
stop() {
    log_warning "Stopping production environment..."
    read -p "Are you sure you want to stop production services? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$PROJECT_DIR"
        docker-compose -f docker-compose.prod.yml down
        log_success "Production environment stopped!"
    else
        log_info "Stop cancelled."
    fi
}

# Restart production environment
restart() {
    log_warning "Restarting production environment..."
    read -p "Are you sure you want to restart production services? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restarting production environment..."
        cd "$PROJECT_DIR"
        docker-compose -f docker-compose.prod.yml restart
        log_success "Production environment restarted!"
    else
        log_info "Restart cancelled."
    fi
}

# Show logs
logs() {
    cd "$PROJECT_DIR"
    if [ -n "$1" ]; then
        log_info "Showing logs for service: $1"
        docker-compose -f docker-compose.prod.yml logs -f "$1"
    else
        log_info "Showing logs for all services..."
        docker-compose -f docker-compose.prod.yml logs -f
    fi
}

# Show status
status() {
    cd "$PROJECT_DIR"
    log_info "Production Environment Status:"
    docker-compose -f docker-compose.prod.yml ps
    
    echo ""
    log_info "Docker System Info:"
    docker system df
    
    echo ""
    log_info "Resource Usage:"
    docker stats --no-stream
}

# Health check
health() {
    log_info "Checking production service health..."
    cd "$PROJECT_DIR"
    
    # Check if services are running
    if ! docker-compose -f docker-compose.prod.yml ps | grep -q "Up"; then
        log_error "No production services are running!"
        exit 1
    fi
    
    # Check ChainLens Core health
    if docker-compose -f docker-compose.prod.yml exec -T chainlens-core curl -f http://localhost:3006/api/v1/health > /dev/null 2>&1; then
        log_success "ChainLens Core is healthy"
    else
        log_error "ChainLens Core health check failed"
    fi
    
    # Check PostgreSQL health
    if docker-compose -f docker-compose.prod.yml exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        log_success "PostgreSQL is healthy"
    else
        log_error "PostgreSQL health check failed"
    fi
    
    # Check Redis health
    if docker-compose -f docker-compose.prod.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_success "Redis is healthy"
    else
        log_error "Redis health check failed"
    fi
}

# Backup production data
backup() {
    log_info "Creating production backup..."
    
    BACKUP_DIR="$PROJECT_DIR/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    cd "$PROJECT_DIR"
    
    # Backup PostgreSQL
    log_info "Backing up PostgreSQL database..."
    docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres chainlens_core > "$BACKUP_DIR/postgres_backup.sql"
    
    # Backup Redis
    log_info "Backing up Redis data..."
    docker-compose -f docker-compose.prod.yml exec -T redis redis-cli BGSAVE
    docker cp "$(docker-compose -f docker-compose.prod.yml ps -q redis):/data/dump.rdb" "$BACKUP_DIR/redis_backup.rdb"
    
    # Backup application logs
    log_info "Backing up application logs..."
    docker-compose -f docker-compose.prod.yml logs > "$BACKUP_DIR/application_logs.txt"
    
    # Create backup archive
    tar -czf "$PROJECT_DIR/backups/chainlens_backup_$(date +%Y%m%d_%H%M%S).tar.gz" -C "$BACKUP_DIR" .
    rm -rf "$BACKUP_DIR"
    
    log_success "Backup created successfully!"
}

# Update production environment
update() {
    log_warning "Updating production environment..."
    read -p "Are you sure you want to update production? This will cause downtime. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Creating backup before update..."
        backup
        
        log_info "Pulling latest images..."
        cd "$PROJECT_DIR"
        docker-compose -f docker-compose.prod.yml pull
        
        log_info "Restarting services with new images..."
        docker-compose -f docker-compose.prod.yml up -d
        
        log_info "Waiting for services to be ready..."
        sleep 30
        
        log_info "Running health checks..."
        health
        
        log_success "Production environment updated successfully!"
    else
        log_info "Update cancelled."
    fi
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
    docker-compose -f docker-compose.prod.yml exec "$service" "${@:-sh}"
}

# Show help
show_help() {
    echo "ChainLens Core - Production Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build     Build production Docker images"
    echo "  deploy    Deploy production environment"
    echo "  stop      Stop production environment"
    echo "  restart   Restart production environment"
    echo "  logs      Show logs (optionally for specific service)"
    echo "  status    Show environment status"
    echo "  health    Check service health"
    echo "  backup    Create production backup"
    echo "  update    Update production environment"
    echo "  exec      Execute command in container"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 deploy                   # Deploy production environment"
    echo "  $0 logs chainlens-core      # Show logs for chainlens-core service"
    echo "  $0 exec chainlens-core sh   # Open shell in chainlens-core container"
    echo "  $0 backup                   # Create production backup"
}

# Main script logic
main() {
    check_docker
    check_docker_compose
    
    case "${1:-help}" in
        build)
            check_env_file
            build
            ;;
        deploy)
            check_env_file
            deploy
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
        health)
            health
            ;;
        backup)
            backup
            ;;
        update)
            check_env_file
            update
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
