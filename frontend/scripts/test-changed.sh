#!/bin/bash

# Selective Testing Script
# Runs only tests for changed files (optimized for fast feedback)
# 
# Usage: ./scripts/test-changed.sh
# 
# Reference: bmad/bmm/testarch/knowledge/selective-testing.md

set -e

echo "🔍 Detecting changed test files..."

# Get changed files from git diff (compare with base branch)
BASE_BRANCH="${1:-origin/main}"
CHANGED_FILES=$(git diff --name-only $BASE_BRANCH...HEAD | grep -E '(frontend/)?tests/.*\.(spec|test)\.(ts|js|tsx|jsx)$' || echo "")

if [ -z "$CHANGED_FILES" ]; then
  echo "ℹ️  No test files changed, running P0 tests only"
  npm run test:e2e:p0
else
  echo "📝 Changed test files:"
  echo "$CHANGED_FILES" | sed 's/^/  - /'
  echo ""
  echo "🚀 Running affected tests..."
  
  # Run tests for changed spec files
  cd frontend
  npm run test:e2e -- $(echo "$CHANGED_FILES" | sed 's|frontend/||g' | tr '\n' ' ')
fi


