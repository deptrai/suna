#!/bin/bash

# Local CI Pipeline Mirror
# Runs the same stages as CI locally for debugging
# 
# Usage: ./scripts/ci-local.sh
# 
# Reference: bmad/bmm/testarch/knowledge/ci-burn-in.md

set -e

echo "🔍 Running CI pipeline locally..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Stage 1: Lint
echo ""
echo "📋 Stage 1: Lint"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npm run lint || exit 1
echo "✅ Lint passed"
echo ""

# Stage 2: Tests
echo ""
echo "🧪 Stage 2: Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npm run test:e2e || exit 1
echo "✅ Tests passed"
echo ""

# Stage 3: Burn-in (reduced iterations for local)
echo ""
echo "🔥 Stage 3: Burn-in (3 iterations - reduced from CI's 10)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for i in {1..3}; do
  echo "🔥 Burn-in iteration $i/3"
  npm run test:e2e || exit 1
done
echo "✅ Burn-in complete - no flaky tests detected"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Local CI pipeline passed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"





