#!/bin/bash

# Script để reset database và chạy migration lại
# Reset Database and Run Migrations Script

set -e  # Exit on any error

echo "🔄 CHAINLENS DATABASE RESET & MIGRATION SCRIPT"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory and navigate to backend
if [ ! -f "backend/supabase/config.toml" ]; then
    print_error "backend/supabase/config.toml not found. Please run this script from the project root directory."
    exit 1
fi

# Navigate to backend directory where supabase config is located
cd backend
print_status "Changed to backend directory: $(pwd)"

print_status "Starting database reset and migration process..."

# Step 1: Check if Supabase is running
print_status "Checking Supabase status..."
if ! supabase status > /dev/null 2>&1; then
    print_warning "Supabase is not running. Starting Supabase..."
    supabase start
    if [ $? -eq 0 ]; then
        print_success "Supabase started successfully"
    else
        print_error "Failed to start Supabase"
        exit 1
    fi
else
    print_success "Supabase is already running"
fi

# Step 2: Reset the database
print_status "Resetting database..."
supabase db reset
if [ $? -eq 0 ]; then
    print_success "Database reset completed"
else
    print_error "Database reset failed"
    exit 1
fi

# Step 3: Check migration files
print_status "Checking migration files..."
MIGRATION_DIR="supabase/migrations"
if [ -d "$MIGRATION_DIR" ]; then
    MIGRATION_COUNT=$(find "$MIGRATION_DIR" -name "*.sql" | wc -l)
    print_status "Found $MIGRATION_COUNT migration files"
    
    if [ $MIGRATION_COUNT -gt 0 ]; then
        print_status "Listing migration files:"
        find "$MIGRATION_DIR" -name "*.sql" | sort | while read -r file; do
            echo "  - $(basename "$file")"
        done
    fi
else
    print_warning "Migration directory not found: $MIGRATION_DIR"
fi

# Step 4: Migrations are already applied during db reset
print_status "All migrations have been applied during database reset"
print_success "Migration process completed successfully"

# Step 5: Verify database is accessible (local verification)
print_status "Verifying database connection..."
if supabase status | grep -q "API URL.*http://127.0.0.1:54321"; then
    print_success "Database is accessible and running"
else
    print_warning "Database might not be fully ready"
fi

# Step 6: Show database status
print_status "Database connection info:"
supabase status | grep -E "(API URL|DB URL|Studio URL)"

# Step 7: Optional - Run seed data if exists
SEED_FILE="supabase/seed.sql"
if [ -f "$SEED_FILE" ]; then
    print_status "Found seed file. Running seed data..."
    supabase db reset
    print_success "Seed data applied"
else
    print_status "No seed file found (this is normal)"
fi

print_success "✅ Database reset and migration completed successfully!"
print_status "You can now start your application services."

echo ""
echo "🔗 Quick Access Links:"
echo "  - Database Studio: http://127.0.0.1:54323"
echo "  - API Docs: http://127.0.0.1:54321/rest/v1/"
echo "  - Inbucket (Email): http://127.0.0.1:54324"
echo ""
