.PHONY: help test test-fast test-unit test-integration test-e2e test-coverage test-watch clean

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

test: ## Run all tests
	@echo "🧪 Running all tests..."
	uv run pytest tests/ -v

test-fast: ## Run fast tests only (unit + integration)
	@echo "⚡ Running fast tests (unit + integration)..."
	uv run pytest tests/ -v -m "unit or integration"

test-unit: ## Run unit tests only
	@echo "🔬 Running unit tests..."
	uv run pytest tests/ -v -m "unit"

test-integration: ## Run integration tests only
	@echo "🔗 Running integration tests..."
	uv run pytest tests/ -v -m "integration"

test-e2e: ## Run E2E tests only
	@echo "🌐 Running E2E tests..."
	uv run pytest tests/ -v -m "e2e"

test-chat: ## Run chat flow tests
	@echo "💬 Running chat flow tests..."
	uv run pytest tests/chat_flow/ -v

test-routing: ## Run routing tests
	@echo "🔀 Running routing tests..."
	uv run pytest tests/routing/ -v

test-performance: ## Run performance tests
	@echo "⚡ Running performance tests..."
	uv run pytest tests/performance/ -v

test-regression: ## Run regression tests
	@echo "🔄 Running regression tests..."
	uv run pytest tests/regression/ -v

test-phase1: ## Run Phase 1 tests
	@echo "1️⃣  Running Phase 1 tests..."
	uv run pytest tests/phase1/ -v

test-phase2: ## Run Phase 2 tests
	@echo "2️⃣  Running Phase 2 tests..."
	uv run pytest tests/phase2/ -v

test-phase3: ## Run Phase 3 tests
	@echo "3️⃣  Running Phase 3 tests..."
	uv run pytest tests/phase3/ -v

test-coverage: ## Run tests with coverage report
	@echo "📊 Running tests with coverage..."
	uv run pytest tests/ --cov=core --cov-report=html --cov-report=term
	@echo "📊 Coverage report generated in htmlcov/index.html"

test-coverage-xml: ## Generate XML coverage report
	@echo "📊 Generating XML coverage report..."
	uv run pytest tests/ --cov=core --cov-report=xml
	@echo "📊 Coverage report: coverage.xml"

test-watch: ## Run tests in watch mode
	@echo "👀 Running tests in watch mode..."
	uv run pytest-watch tests/ -v

test-failed: ## Re-run only failed tests
	@echo "🔴 Re-running failed tests..."
	uv run pytest tests/ -v --lf

test-verbose: ## Run tests with verbose output
	@echo "📢 Running tests with verbose output..."
	uv run pytest tests/ -vv -s

test-quiet: ## Run tests with minimal output
	@echo "🤫 Running tests quietly..."
	uv run pytest tests/ -q

test-parallel: ## Run tests in parallel (requires pytest-xdist)
	@echo "⚡ Running tests in parallel..."
	uv run pytest tests/ -v -n auto

test-markers: ## Show all available test markers
	@echo "🏷️  Available test markers:"
	@uv run pytest --markers | grep "^@pytest.mark"

test-collect: ## Show all tests without running them
	@echo "📋 Collecting tests..."
	@uv run pytest tests/ --collect-only -q

test-summary: ## Show test summary
	@echo "📊 Test Summary:"
	@echo ""
	@echo "Total tests:"
	@uv run pytest tests/ --collect-only -q | tail -1
	@echo ""
	@echo "By category:"
	@echo "  Chat Flow:    $$(uv run pytest tests/chat_flow/ --collect-only -q | tail -1)"
	@echo "  Routing:      $$(uv run pytest tests/routing/ --collect-only -q | tail -1)"
	@echo "  Performance:  $$(uv run pytest tests/performance/ --collect-only -q | tail -1)"
	@echo "  Regression:   $$(uv run pytest tests/regression/ --collect-only -q | tail -1)"
	@echo "  Phase 1:      $$(uv run pytest tests/phase1/ --collect-only -q | tail -1)"
	@echo "  Phase 2:      $$(uv run pytest tests/phase2/ --collect-only -q | tail -1)"
	@echo "  Phase 3:      $$(uv run pytest tests/phase3/ --collect-only -q | tail -1)"

clean: ## Clean test artifacts
	@echo "🧹 Cleaning test artifacts..."
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -f coverage.xml
	rm -f .coverage
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@echo "✅ Cleaned!"

install: ## Install dependencies
	@echo "📦 Installing dependencies..."
	uv sync

install-dev: ## Install dev dependencies
	@echo "📦 Installing dev dependencies..."
	uv sync --all-extras

check: ## Run all checks (tests + coverage)
	@echo "✅ Running all checks..."
	@make test-fast
	@make test-coverage
	@echo "✅ All checks passed!"

ci: ## Run CI checks locally
	@echo "🤖 Running CI checks..."
	@make clean
	@make install
	@make test
	@make test-coverage
	@echo "✅ CI checks passed!"

.DEFAULT_GOAL := help

