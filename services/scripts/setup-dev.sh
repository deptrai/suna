#!/bin/bash

# =====================================================
# ChainLens Crypto Services - Development Setup Script
# =====================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_deps=()
    
    if ! command_exists node; then
        missing_deps+=("Node.js 18+")
    else
        local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -lt 18 ]; then
            missing_deps+=("Node.js 18+ (current: $(node --version))")
        fi
    fi
    
    if ! command_exists npm; then
        missing_deps+=("npm")
    fi
    
    if ! command_exists docker; then
        missing_deps+=("Docker")
    fi
    
    if ! command_exists docker-compose; then
        missing_deps+=("Docker Compose")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing prerequisites:"
        for dep in "${missing_deps[@]}"; do
            echo "  - $dep"
        done
        echo ""
        echo "Please install the missing dependencies and run this script again."
        exit 1
    fi
    
    log_success "All prerequisites are installed"
}

# Setup environment variables
setup_environment() {
    log_info "Setting up environment variables..."
    
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            log_success "Created .env file from .env.example"
            log_warning "Please edit .env file with your API keys and configuration"
        else
            log_error ".env.example file not found"
            exit 1
        fi
    else
        log_info ".env file already exists"
    fi
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies for all services..."
    
    # Install root dependencies
    log_info "Installing root dependencies..."
    npm install
    
    # Install service dependencies
    local services=("chainlens-core" "onchain-analysis" "sentiment-analysis" "tokenomics-analysis" "team-verification")
    
    for service in "${services[@]}"; do
        if [ -d "$service" ]; then
            log_info "Installing dependencies for $service..."
            cd "$service"
            npm install
            cd ..
            log_success "Dependencies installed for $service"
        else
            log_warning "Service directory $service not found, skipping..."
        fi
    done
    
    log_success "All dependencies installed"
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    # Check if PostgreSQL is running in Docker
    if docker ps | grep -q chainlens-postgres-microservices; then
        log_info "PostgreSQL container is already running"
    else
        log_info "Starting PostgreSQL container..."
        docker-compose -f docker-compose.dev.yml up -d postgres-microservices
        
        # Wait for PostgreSQL to be ready
        log_info "Waiting for PostgreSQL to be ready..."
        sleep 10
        
        local retries=30
        while [ $retries -gt 0 ]; do
            if docker exec chainlens-postgres-microservices pg_isready -U chainlens -d chainlens_microservices >/dev/null 2>&1; then
                log_success "PostgreSQL is ready"
                break
            fi
            retries=$((retries - 1))
            sleep 2
        done
        
        if [ $retries -eq 0 ]; then
            log_error "PostgreSQL failed to start"
            exit 1
        fi
    fi
    
    # Run database migrations
    log_info "Running database migrations..."
    if [ -d "chainlens-core" ]; then
        cd chainlens-core
        if [ -f "package.json" ] && grep -q "migration:run" package.json; then
            npm run migration:run
            log_success "Database migrations completed"
        else
            log_warning "Migration script not found in chainlens-core"
        fi
        cd ..
    fi
}

# Setup Redis
setup_redis() {
    log_info "Setting up Redis..."
    
    # Check if Redis is running in Docker
    if docker ps | grep -q chainlens-redis; then
        log_info "Redis container is already running"
    else
        log_info "Starting Redis container..."
        docker-compose -f docker-compose.dev.yml up -d redis
        
        # Wait for Redis to be ready
        log_info "Waiting for Redis to be ready..."
        sleep 5
        
        local retries=15
        while [ $retries -gt 0 ]; do
            if docker exec chainlens-redis redis-cli ping >/dev/null 2>&1; then
                log_success "Redis is ready"
                break
            fi
            retries=$((retries - 1))
            sleep 2
        done
        
        if [ $retries -eq 0 ]; then
            log_error "Redis failed to start"
            exit 1
        fi
    fi
}

# Setup monitoring
setup_monitoring() {
    log_info "Setting up monitoring stack..."
    
    # Start Prometheus and Grafana
    docker-compose -f docker-compose.dev.yml up -d prometheus grafana
    
    log_success "Monitoring stack started"
    log_info "Prometheus: http://localhost:9090"
    log_info "Grafana: http://localhost:3000 (admin/admin)"
}

# Build services
build_services() {
    log_info "Building all services..."
    
    npm run build:all
    
    log_success "All services built successfully"
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    # Start all services
    log_info "Starting all services..."
    npm run dev:all &
    
    # Wait for services to start
    sleep 30
    
    # Check service health
    local services=(
        "chainlens-core:3006"
        "onchain-analysis:3001"
        "sentiment-analysis:3002"
        "tokenomics-analysis:3003"
        "team-verification:3004"
    )
    
    local healthy_services=0
    
    for service in "${services[@]}"; do
        local service_name=$(echo $service | cut -d':' -f1)
        local port=$(echo $service | cut -d':' -f2)
        
        if curl -f "http://localhost:$port/health" >/dev/null 2>&1; then
            log_success "$service_name is healthy"
            healthy_services=$((healthy_services + 1))
        else
            log_warning "$service_name is not responding"
        fi
    done
    
    if [ $healthy_services -eq ${#services[@]} ]; then
        log_success "All services are healthy"
    else
        log_warning "$healthy_services/${#services[@]} services are healthy"
    fi
    
    # Stop services
    pkill -f "npm run dev"
}

# Create development directories
create_directories() {
    log_info "Creating development directories..."
    
    local dirs=("logs" "data" "uploads" "temp")
    
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            log_success "Created directory: $dir"
        fi
    done
}

# Setup Git hooks
setup_git_hooks() {
    log_info "Setting up Git hooks..."
    
    if [ -d ".git" ]; then
        # Install husky if not already installed
        if command_exists npx; then
            npx husky install
            log_success "Git hooks installed"
        else
            log_warning "npx not found, skipping Git hooks setup"
        fi
    else
        log_warning "Not a Git repository, skipping Git hooks setup"
    fi
}

# Main setup function
main() {
    echo "======================================================"
    echo "ChainLens Crypto Services - Development Setup"
    echo "======================================================"
    echo ""
    
    # Change to script directory
    cd "$(dirname "$0")/.."
    
    check_prerequisites
    echo ""
    
    setup_environment
    echo ""
    
    create_directories
    echo ""
    
    install_dependencies
    echo ""
    
    setup_database
    echo ""
    
    setup_redis
    echo ""
    
    setup_monitoring
    echo ""
    
    build_services
    echo ""
    
    setup_git_hooks
    echo ""
    
    health_check
    echo ""
    
    echo "======================================================"
    log_success "Development environment setup completed!"
    echo "======================================================"
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file with your API keys"
    echo "2. Start development servers: npm run dev:all"
    echo "3. Open API documentation: http://localhost:3006/api/docs"
    echo "4. Monitor services: http://localhost:9090 (Prometheus)"
    echo "5. View dashboards: http://localhost:3000 (Grafana)"
    echo ""
    echo "Useful commands:"
    echo "- npm run dev:all          # Start all services in development mode"
    echo "- npm run test:all         # Run all tests"
    echo "- npm run health:all       # Check service health"
    echo "- npm run docker:logs      # View Docker logs"
    echo "- npm run docker:down      # Stop Docker services"
    echo ""
}

# Run main function
main "$@"
