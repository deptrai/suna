#!/bin/bash
#
# Setup pre-commit hook for gate decision checking
# This script installs the pre-commit hook automatically
#

set -e

HOOK_FILE=".git/hooks/pre-commit"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Setting up pre-commit hook for gate decision checking"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if .git directory exists
if [ ! -d "$PROJECT_ROOT/.git" ]; then
    echo "❌ ERROR: .git directory not found. This doesn't appear to be a git repository."
    exit 1
fi

# Check if hooks directory exists
if [ ! -d "$PROJECT_ROOT/.git/hooks" ]; then
    echo "Creating .git/hooks directory..."
    mkdir -p "$PROJECT_ROOT/.git/hooks"
fi

# Check if pre-commit hook already exists
if [ -f "$PROJECT_ROOT/$HOOK_FILE" ]; then
    echo "⚠️  WARNING: Pre-commit hook already exists at $HOOK_FILE"
    echo ""
    read -p "Do you want to backup the existing hook and install the new one? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
    
    # Backup existing hook
    BACKUP_FILE="$PROJECT_ROOT/.git/hooks/pre-commit.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$PROJECT_ROOT/$HOOK_FILE" "$BACKUP_FILE"
    echo "✅ Backed up existing hook to: $BACKUP_FILE"
fi

# Check if enforce-gate-decision.py exists
if [ ! -f "$PROJECT_ROOT/scripts/enforce-gate-decision.py" ]; then
    echo "❌ ERROR: Gate decision script not found at scripts/enforce-gate-decision.py"
    exit 1
fi

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ ERROR: python3 not found"
    echo "Please install Python 3 to use gate decision checking"
    exit 1
fi

# Check if PyYAML is installed
if ! python3 -c "import yaml" 2>/dev/null; then
    echo "⚠️  WARNING: PyYAML not installed"
    echo "Installing PyYAML..."
    pip install pyyaml || {
        echo "❌ ERROR: Failed to install PyYAML"
        echo "Please install it manually: pip install pyyaml"
        exit 1
    }
fi

# The hook file is already created, just make it executable
chmod +x "$PROJECT_ROOT/$HOOK_FILE"

echo "✅ Pre-commit hook installed successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 What happens now:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "The pre-commit hook will automatically check gate decision files"
echo "before allowing commits. It will:"
echo ""
echo "  ✅ Allow commits if gate decision is PASS"
echo "  ⚠️  Warn (but allow) if gate decision is CONCERNS or WAIVED"
echo "  ❌ Block commits if gate decision is FAIL"
echo ""
echo "To test the hook:"
echo "  git add docs/gate-decision-story-1.1.yaml"
echo "  git commit -m 'test: gate decision check'"
echo ""
echo "To bypass the hook (not recommended):"
echo "  git commit --no-verify"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

