#!/bin/bash

# ChainLens Security Audit Script
# Scans the codebase for potential security issues

echo "🔐 ChainLens Security Audit"
echo "=========================="

AUDIT_RESULTS="/tmp/chainlens_security_audit.log"
> $AUDIT_RESULTS

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to log results
log_issue() {
    local severity=$1
    local description=$2
    local file=$3
    local line=$4
    
    echo "[$severity] $description" | tee -a $AUDIT_RESULTS
    if [ ! -z "$file" ]; then
        echo "    File: $file:$line" | tee -a $AUDIT_RESULTS
    fi
    echo "" | tee -a $AUDIT_RESULTS
}

echo "🔍 Starting security audit..." | tee -a $AUDIT_RESULTS
echo "Scan started: $(date)" | tee -a $AUDIT_RESULTS
echo "" | tee -a $AUDIT_RESULTS

# 1. Check for hardcoded secrets
echo -e "${YELLOW}1. Checking for hardcoded secrets...${NC}"

# API Keys patterns
api_key_patterns=(
    "api[_-]?key['\"]?\s*[:=]\s*['\"][a-zA-Z0-9]{20,}"
    "secret[_-]?key['\"]?\s*[:=]\s*['\"][a-zA-Z0-9]{20,}"
    "password['\"]?\s*[:=]\s*['\"][^'\"]{8,}"
    "bearer\s+[a-zA-Z0-9_\-\.=]{20,}"
    "sk-[a-zA-Z0-9]{32,}"  # OpenAI API key pattern
    "xoxp-[a-zA-Z0-9-]{50,}"  # Slack token pattern
)

for pattern in "${api_key_patterns[@]}"; do
    matches=$(grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude="*.log" "$pattern" . 2>/dev/null || true)
    if [ ! -z "$matches" ]; then
        log_issue "HIGH" "Potential hardcoded secret found" "" ""
        echo "$matches" | tee -a $AUDIT_RESULTS
    fi
done

# 2. Check for .env files in git
echo -e "${YELLOW}2. Checking for .env files in git...${NC}"
env_in_git=$(git ls-files | grep "\.env$" 2>/dev/null || true)
if [ ! -z "$env_in_git" ]; then
    log_issue "CRITICAL" ".env files found in git (should be in .gitignore)" "" ""
    echo "$env_in_git" | tee -a $AUDIT_RESULTS
else
    echo -e "${GREEN}✓ No .env files in git${NC}"
fi

# 3. Check for TODO/FIXME security comments
echo -e "${YELLOW}3. Checking for security TODOs...${NC}"
security_todos=$(grep -rn --exclude-dir=node_modules --exclude-dir=.git "TODO.*security\|FIXME.*security\|TODO.*auth\|FIXME.*auth" . 2>/dev/null || true)
if [ ! -z "$security_todos" ]; then
    log_issue "MEDIUM" "Security-related TODO/FIXME comments found" "" ""
    echo "$security_todos" | tee -a $AUDIT_RESULTS
fi

# 4. Check for HTTP URLs (should be HTTPS in production)
echo -e "${YELLOW}4. Checking for insecure HTTP URLs...${NC}"
http_urls=$(grep -rn --exclude-dir=node_modules --exclude-dir=.git "http://(?!localhost\|127\.0\.0\.1)" . 2>/dev/null | grep -v ".env.example" | grep -v "health" || true)
if [ ! -z "$http_urls" ]; then
    log_issue "MEDIUM" "HTTP URLs found (should use HTTPS in production)" "" ""
    echo "$http_urls" | tee -a $AUDIT_RESULTS
fi

# 5. Check for console.log/print statements (potential info leak)
echo -e "${YELLOW}5. Checking for debug statements...${NC}"
debug_statements=$(grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude="*.log" "console\.log\|print(" . 2>/dev/null | grep -v "logger\|debug" || true)
if [ ! -z "$debug_statements" ]; then
    log_issue "LOW" "Debug statements found (review for sensitive data)" "" ""
    echo "$debug_statements" | head -10 | tee -a $AUDIT_RESULTS
fi

# 6. Check package.json for known vulnerable packages
echo -e "${YELLOW}6. Checking for vulnerable dependencies...${NC}"
if command -v npm &> /dev/null; then
    echo "Running npm audit..." | tee -a $AUDIT_RESULTS
    cd backend && npm audit --audit-level high 2>/dev/null | tee -a $AUDIT_RESULTS || true
    cd ../frontend && npm audit --audit-level high 2>/dev/null | tee -a $AUDIT_RESULTS || true
    cd ..
fi

# 7. Check for SQL injection patterns
echo -e "${YELLOW}7. Checking for potential SQL injection...${NC}"
sql_patterns=(
    "query.*\+.*request\|req\."
    "execute.*\+.*params"
    "\$\{.*\}.*SELECT\|INSERT\|UPDATE\|DELETE"
)

for pattern in "${sql_patterns[@]}"; do
    matches=$(grep -rn --exclude-dir=node_modules --exclude-dir=.git "$pattern" . 2>/dev/null || true)
    if [ ! -z "$matches" ]; then
        log_issue "HIGH" "Potential SQL injection vulnerability" "" ""
        echo "$matches" | tee -a $AUDIT_RESULTS
    fi
done

# 8. Check CORS configuration
echo -e "${YELLOW}8. Checking CORS configuration...${NC}"
cors_any=$(grep -rn --exclude-dir=node_modules --exclude-dir=.git "origin.*\*\|Access-Control-Allow-Origin.*\*" . 2>/dev/null || true)
if [ ! -z "$cors_any" ]; then
    log_issue "MEDIUM" "Wildcard CORS origin found (security risk in production)" "" ""
    echo "$cors_any" | tee -a $AUDIT_RESULTS
fi

# 9. Check for weak JWT secrets
echo -e "${YELLOW}9. Checking JWT configuration...${NC}"
weak_jwt=$(grep -rn --exclude-dir=node_modules --exclude-dir=.git "jwt.*secret.*=.*['\"][^'\"]{1,16}['\"]" . 2>/dev/null || true)
if [ ! -z "$weak_jwt" ]; then
    log_issue "HIGH" "Weak JWT secret found (should be >32 characters)" "" ""
    echo "$weak_jwt" | tee -a $AUDIT_RESULTS
fi

# 10. Check for insecure randomness
echo -e "${YELLOW}10. Checking for insecure randomness...${NC}"
insecure_random=$(grep -rn --exclude-dir=node_modules --exclude-dir=.git "Math\.random\|random\.randint" . 2>/dev/null | grep -v "test\|example" || true)
if [ ! -z "$insecure_random" ]; then
    log_issue "MEDIUM" "Insecure randomness found (use crypto.randomBytes)" "" ""
    echo "$insecure_random" | head -5 | tee -a $AUDIT_RESULTS
fi

# Summary
echo "" | tee -a $AUDIT_RESULTS
echo "🔍 Security Audit Summary" | tee -a $AUDIT_RESULTS
echo "========================" | tee -a $AUDIT_RESULTS

critical_count=$(grep -c "\[CRITICAL\]" $AUDIT_RESULTS 2>/dev/null || echo "0")
high_count=$(grep -c "\[HIGH\]" $AUDIT_RESULTS 2>/dev/null || echo "0")
medium_count=$(grep -c "\[MEDIUM\]" $AUDIT_RESULTS 2>/dev/null || echo "0")
low_count=$(grep -c "\[LOW\]" $AUDIT_RESULTS 2>/dev/null || echo "0")

echo "Critical Issues: $critical_count" | tee -a $AUDIT_RESULTS
echo "High Issues: $high_count" | tee -a $AUDIT_RESULTS
echo "Medium Issues: $medium_count" | tee -a $AUDIT_RESULTS
echo "Low Issues: $low_count" | tee -a $AUDIT_RESULTS
echo "" | tee -a $AUDIT_RESULTS
echo "Full audit log: $AUDIT_RESULTS" | tee -a $AUDIT_RESULTS

# Exit with error code if critical or high issues found
total_serious=$((critical_count + high_count))
if [ $total_serious -gt 0 ]; then
    echo -e "${RED}⚠️  Found $total_serious serious security issues!${NC}" | tee -a $AUDIT_RESULTS
    echo "Please review and fix before production deployment." | tee -a $AUDIT_RESULTS
    exit 1
else
    echo -e "${GREEN}✅ No critical or high-severity issues found!${NC}" | tee -a $AUDIT_RESULTS
    exit 0
fi
