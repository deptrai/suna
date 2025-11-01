# 🚀 Testing Setup Guide - ChainLens Platform

**Document Version**: 1.0  
**Last Updated**: 2025-09-10  
**Sprint**: Foundation & Infrastructure (Sprint 1)

## 📋 Quick Start

This guide helps you set up and run tests across all components of the ChainLens platform.

## 🏗️ Prerequisites

### **System Requirements**
- **Python**: 3.11+ with `uv` package manager
- **Node.js**: 18+ with `pnpm` package manager  
- **Docker**: Latest version for integration tests
- **Git**: For pre-commit hooks

### **Development Tools**
```bash
# Install uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install pnpm (Node.js package manager)
npm install -g pnpm@9

# Install Docker Desktop
# Download from: https://www.docker.com/products/docker-desktop
```

## 🔧 Backend Testing Setup

### **1. Navigate to Backend Directory**
```bash
cd backend
```

### **2. Install Dependencies**
```bash
# Install all dependencies including dev dependencies
uv sync --all-extras --dev
```

### **3. Environment Setup**
```bash
# Copy environment template (if exists)
cp .env.example .env.test

# Or create minimal test environment
cat > .env.test << EOF
ENVIRONMENT=TEST
TESTING=true
DATABASE_URL=sqlite:///:memory:
REDIS_URL=redis://localhost:6379/1
DISABLE_AUTH=true
LOG_LEVEL=ERROR
EOF
```

### **4. Run Backend Tests**
```bash
# Run all tests with coverage
uv run pytest

# Run specific test types
uv run pytest tests/unit/          # Unit tests only
uv run pytest tests/integration/   # Integration tests only
uv run pytest tests/e2e/          # E2E tests only

# Run with specific markers
uv run pytest -m "not slow"       # Skip slow tests
uv run pytest -m integration      # Integration tests only
```

### **5. Coverage Reports**
```bash
# Generate HTML coverage report
uv run pytest --cov --cov-report=html

# Open coverage report
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
```

## 🎨 Frontend Testing Setup

### **1. Navigate to Frontend Directory**
```bash
cd frontend
```

### **2. Install Dependencies**
```bash
# Install all dependencies
pnpm install
```

### **3. Environment Setup**
```bash
# Create test environment file
cat > .env.test.local << EOF
NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
EOF
```

### **4. Run Frontend Tests**
```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test -- --coverage

# Run tests in watch mode
pnpm test -- --watch

# Run specific test files
pnpm test -- --testPathPattern=components
```

### **5. Coverage Reports**
```bash
# Coverage is automatically generated in coverage/ directory
# Open coverage report
open coverage/lcov-report/index.html  # macOS
xdg-open coverage/lcov-report/index.html  # Linux
```

## 🧱 Microservices Testing Setup

### **1. Navigate to Service Directory**
```bash
cd microservices/[service-name]
# Example: cd microservices/sentiment-service
```

### **2. Install Dependencies**
```bash
# Install dependencies for specific service
pnpm install
```

### **3. Environment Setup**
```bash
# Create test environment (if needed)
cat > .env.test << EOF
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/test_sentiment
REDIS_URL=redis://localhost:6379
EOF
```

### **4. Run Service Tests**
```bash
# Run all tests for the service
pnpm test

# Run with coverage
pnpm test -- --coverage

# Run integration tests
pnpm run test:e2e

# Run specific test patterns
pnpm test -- --testPathPattern=controller
pnpm test -- --testPathPattern=service
```

### **5. Test All Microservices**
```bash
# From microservices root directory
cd microservices

# Run tests for all services
for service in onchain-service sentiment-service tokenomics-service team-service; do
  echo "Testing $service..."
  cd $service && pnpm test && cd ..
done
```

## 🔄 CI/CD Testing Setup

### **1. GitHub Actions**
The repository includes GitHub Actions workflows:

- **Backend Tests**: `.github/workflows/test-backend.yml`
- **Frontend Tests**: `.github/workflows/test-frontend.yml`  
- **Microservices Tests**: `.github/workflows/test-microservices.yml`

### **2. Local CI Simulation**
```bash
# Test backend like CI
cd backend
uv run pytest -v --cov --cov-report=xml

# Test frontend like CI
cd frontend
pnpm test -- --coverage --watchAll=false

# Test microservices like CI
cd microservices/sentiment-service
pnpm test -- --coverage --watchAll=false
```

## 🛠️ Development Workflow

### **1. Pre-commit Hooks Setup**
```bash
# Install pre-commit hooks (from project root)
pre-commit install

# Run pre-commit hooks manually
pre-commit run --all-files
```

### **2. Test-Driven Development (TDD)**
```bash
# 1. Write a failing test
cd backend
cat > tests/unit/test_new_feature.py << EOF
def test_new_feature_should_work():
    # This test should fail initially
    assert False, "Not implemented yet"
EOF

# 2. Run the test (should fail)
uv run pytest tests/unit/test_new_feature.py

# 3. Implement the feature
# 4. Run the test again (should pass)
```

### **3. Watch Mode Development**
```bash
# Backend - pytest with file watching
uv run pytest --watch

# Frontend - Jest in watch mode
cd frontend && pnpm test -- --watch

# Microservices - Jest in watch mode
cd microservices/sentiment-service && pnpm test -- --watch
```

## 🔍 Debugging Tests

### **1. Debug Failing Tests**
```bash
# Backend - Run with verbose output
uv run pytest -vvv --tb=long

# Backend - Run specific test with debugging
uv run pytest tests/unit/test_specific.py::test_function -vvv

# Frontend - Debug with Node inspector
cd frontend
pnpm test -- --runInBand --no-cache tests/components/Button.test.tsx
```

### **2. Test Coverage Analysis**
```bash
# Backend - Show missing lines
uv run pytest --cov --cov-report=term-missing

# Frontend - Detailed coverage
pnpm test -- --coverage --verbose

# Check coverage thresholds
uv run pytest --cov --cov-fail-under=85
```

## 📊 Performance Testing

### **1. Backend Performance Tests**
```bash
# Run benchmark tests
uv run pytest -m benchmark

# Profile test execution time
uv run pytest --durations=10
```

### **2. Frontend Performance Tests**
```bash
# Run tests with performance tracking
pnpm test -- --verbose --reporters=default
```

## 🚨 Troubleshooting

### **Common Issues**

#### **Backend Issues**
```bash
# Issue: Module not found errors
# Solution: Ensure uv sync was run
cd backend && uv sync --all-extras --dev

# Issue: Database connection errors
# Solution: Check test database configuration
export DATABASE_URL="sqlite:///:memory:"

# Issue: Redis connection errors  
# Solution: Start Redis locally or mock it
docker run -d -p 6379:6379 redis:7-alpine
```

#### **Frontend Issues**
```bash
# Issue: Next.js import errors
# Solution: Clear cache and reinstall
cd frontend
rm -rf .next node_modules
pnpm install

# Issue: Jest configuration errors
# Solution: Verify jest.config.ts syntax
pnpm test -- --showConfig
```

#### **Microservices Issues**
```bash
# Issue: NestJS module loading errors
# Solution: Check tsconfig.json and jest.config
cd microservices/[service]
pnpm run build
pnpm test

# Issue: Port conflicts during testing
# Solution: Use different ports for tests
export PORT=0  # Random available port
```

### **Getting Help**

1. **Check Documentation**: Review `/docs/testing/` directory
2. **Run Diagnostics**: Use `--verbose` flags for detailed output
3. **Check CI/CD**: Compare with GitHub Actions workflow runs
4. **Team Support**: Ask questions in team chat with error logs

## ✅ Success Checklist

Before committing code, ensure:

- [ ] All tests pass locally
- [ ] Coverage meets minimum thresholds (70% minimum, 85% target)
- [ ] Pre-commit hooks pass
- [ ] No flaky or intermittent test failures
- [ ] New features have corresponding tests
- [ ] Integration tests cover critical paths

---

*This setup guide is maintained by the BMad Master Testing Framework. For questions or improvements, please create an issue or submit a PR.*
