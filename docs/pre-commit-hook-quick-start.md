# Pre-commit Hook - Quick Start Guide

## ✅ Setup Complete!

Pre-commit hook đã được cài đặt tại `.git/hooks/pre-commit`

## 🚀 Sử dụng

### Normal Commit (Không có gate decision files)

```bash
git add backend/core/run.py
git commit -m "feat: add feature"
# ✅ Commit thành công (hook skip vì không có gate decision files)
```

### Commit với Gate Decision File

```bash
# Stage gate decision file
git add docs/gate-decision-story-1.1.yaml

# Commit sẽ tự động check gate decision
git commit -m "docs: add gate decision for story 1.1"

# Output:
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🚦 Quality Gate Decision Check (Pre-commit)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 
# Checking: docs/gate-decision-story-1.1.yaml
# ✅ PASS hoặc ⚠️ CONCERNS hoặc ❌ FAIL
```

## 📊 Behavior

| Gate Decision | Action | Result |
|--------------|--------|--------|
| **PASS** | ✅ Allow commit | Commit thành công |
| **CONCERNS** | ⚠️ Warn but allow | Commit thành công (có warning) |
| **WAIVED** | 🔓 Warn but allow | Commit thành công (có warning) |
| **FAIL** | ❌ Block commit | Commit bị block |

## 🔧 Troubleshooting

### Hook không chạy?

```bash
# Check hook có executable không
ls -l .git/hooks/pre-commit

# Make executable
chmod +x .git/hooks/pre-commit
```

### Python 3 không tìm thấy?

```bash
# Install Python 3
brew install python3  # macOS
sudo apt-get install python3  # Linux

# Install PyYAML
pip install pyyaml
```

### Bypass hook (không khuyến khích)

```bash
git commit --no-verify -m "your message"
```

## 📚 Documentation

- [Full Setup Guide](pre-commit-hook-setup.md)
- [Gate Decision Script](../scripts/README-gate-decision.md)

---

**Ready to use!** Hook sẽ tự động chạy khi commit có gate decision files.

