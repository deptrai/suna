# Pre-commit Hook Setup for Gate Decision Checking

**Date:** 2025-01-15  
**Status:** Active  
**Integration:** Git pre-commit hook

---

## 📋 Overview

The pre-commit hook automatically validates gate decision YAML files before allowing commits. This provides fast feedback and prevents committing code with FAIL gate decisions.

---

## 🚀 Quick Setup

### Option 1: Automatic Setup (Recommended)

```bash
./scripts/setup-pre-commit-hook.sh
```

This script will:
- ✅ Install the pre-commit hook automatically
- ✅ Check for Python 3 and PyYAML
- ✅ Backup existing hooks if they exist
- ✅ Make the hook executable

### Option 2: Manual Setup

The pre-commit hook is already installed at `.git/hooks/pre-commit`. Just make sure it's executable:

```bash
chmod +x .git/hooks/pre-commit
```

---

## 🔧 How It Works

### Trigger Conditions

The hook only runs when:
- Gate decision files (`docs/gate-decision-story-*.yaml`) are staged for commit
- If no gate decision files are staged, the hook skips (fast)

### Behavior

| Gate Decision | Pre-commit Action | Exit Code |
|--------------|-------------------|-----------|
| **PASS** | ✅ Allow commit | 0 |
| **CONCERNS** | ⚠️ Warn but allow commit | 0 |
| **WAIVED** | 🔓 Warn but allow commit | 0 |
| **FAIL** | ❌ Block commit | 1 |
| **ERROR** | ❌ Block commit | 1 |

**Note:** The hook uses `--strict` mode, so CONCERNS and WAIVED are treated as warnings but don't block commits (unlike CI/CD which blocks on FAIL only).

---

## 📝 Usage Examples

### Normal Commit (No Gate Decision Files)

```bash
git add backend/core/run.py
git commit -m "feat: add new feature"
# ✅ Commit succeeds (no gate decision files, hook skips)
```

### Commit with Gate Decision File (PASS)

```bash
git add docs/gate-decision-story-1.1.yaml
git commit -m "docs: add gate decision for story 1.1"

# Output:
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🚦 Quality Gate Decision Check (Pre-commit)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 
# Checking: docs/gate-decision-story-1.1.yaml
# ✅ PASS: docs/gate-decision-story-1.1.yaml
# 
# ✅ All gate decisions PASS
# ✅ Commit succeeds
```

### Commit with Gate Decision File (FAIL)

```bash
git add docs/gate-decision-story-1.2.yaml
git commit -m "docs: add gate decision for story 1.2"

# Output:
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🚦 Quality Gate Decision Check (Pre-commit)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 
# Checking: docs/gate-decision-story-1.2.yaml
# ❌ FAIL: docs/gate-decision-story-1.2.yaml (BLOCKING)
# 
# ❌ BLOCKING FAILURES: 1
# Commit blocked due to FAIL gate decisions.
# Please fix the gate decision issues before committing.
# 
# To bypass this check (not recommended):
#   git commit --no-verify
# 
# ❌ Commit fails
```

### Commit with Gate Decision File (CONCERNS)

```bash
git add docs/gate-decision-story-1.1.yaml
git commit -m "docs: update gate decision for story 1.1"

# Output:
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🚦 Quality Gate Decision Check (Pre-commit)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 
# Checking: docs/gate-decision-story-1.1.yaml
# ⚠️  CONCERNS: docs/gate-decision-story-1.1.yaml (non-blocking)
# 
# ⚠️  WARNINGS: 1 (non-blocking)
# Gate decisions have CONCERNS or WAIVED status.
# Commit will proceed, but please review the warnings.
# 
# ✅ Commit succeeds (with warning)
```

---

## 🔍 Troubleshooting

### Hook Not Running

**Problem:** Pre-commit hook doesn't run when committing gate decision files.

**Solution:**
1. Check if hook is executable: `ls -l .git/hooks/pre-commit`
2. Make it executable: `chmod +x .git/hooks/pre-commit`
3. Verify hook exists: `cat .git/hooks/pre-commit`

### Python 3 Not Found

**Problem:** `python3 not found` error.

**Solution:**
```bash
# Check if Python 3 is installed
which python3

# Install Python 3 (macOS)
brew install python3

# Install Python 3 (Ubuntu/Debian)
sudo apt-get install python3
```

### PyYAML Not Installed

**Problem:** `PyYAML not installed` error.

**Solution:**
```bash
# Install PyYAML
pip install pyyaml

# Or with pip3
pip3 install pyyaml
```

### Hook Blocks All Commits

**Problem:** Hook blocks commits even when no gate decision files are staged.

**Solution:**
1. Check if hook logic is correct (should skip if no gate files)
2. Verify hook file is the correct version
3. Reinstall hook: `./scripts/setup-pre-commit-hook.sh`

### Bypass Hook (Not Recommended)

If you need to bypass the hook temporarily:

```bash
git commit --no-verify -m "your message"
```

**⚠️ Warning:** Only use this if absolutely necessary. It bypasses all pre-commit hooks, including other quality checks.

---

## 🔄 Integration with CI/CD

The pre-commit hook works alongside the GitHub Actions workflow:

- **Pre-commit hook:** Fast local validation before commit
- **GitHub Actions:** Comprehensive validation on PR

**Benefits:**
- ✅ Catch issues early (before commit)
- ✅ Fast feedback loop
- ✅ Reduces failed CI/CD runs
- ✅ CI/CD still validates as backup

---

## 📊 Comparison: Pre-commit vs CI/CD

| Feature | Pre-commit Hook | CI/CD Workflow |
|---------|----------------|----------------|
| **Trigger** | Before commit | On PR |
| **Speed** | Fast (<5s) | Slower (2-5 min) |
| **Feedback** | Immediate | After push |
| **Blocking** | FAIL blocks commit | FAIL blocks merge |
| **CONCERNS** | Warning only | Non-blocking |
| **Scope** | Only staged files | All files in PR |

---

## 🎯 Best Practices

1. **Always run hook locally** before pushing
2. **Don't bypass hook** unless absolutely necessary
3. **Fix FAIL decisions** before committing
4. **Review CONCERNS warnings** but proceed if acceptable
5. **Keep hook updated** when gate decision format changes

---

## 📚 Related Documentation

- [Gate Decision Enforcer Script](../scripts/README-gate-decision.md)
- [Gate Decision YAML Format](gate-decision-story-1.1.yaml)
- [CI/CD Integration](gate-decision-enforcement-setup.md)
- [Workflow Status](bmm-workflow-status.yaml)

---

## ✅ Verification

Test the hook:

```bash
# Test with Story 1.1 (CONCERNS - should warn but allow)
git add docs/gate-decision-story-1.1.yaml
git commit -m "test: verify pre-commit hook"

# Expected: Commit succeeds with warning
```

---

## 🎉 Success!

Pre-commit hook is now active and will automatically check gate decision files before allowing commits.

---

**Last Updated:** 2025-01-15  
**Maintainer:** TEA Agent (Test Architect)

