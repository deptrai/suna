#!/bin/bash

# Dependency Security Scan Script for ChainLens
# Scans dependencies for known vulnerabilities

echo "🔍 ChainLens Dependency Security Scan"
echo "====================================="

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

SCAN_RESULTS="/tmp/chainlens_dependency_scan.log"
> $SCAN_RESULTS

echo "Scan started: $(date)" | tee -a $SCAN_RESULTS
echo "" | tee -a $SCAN_RESULTS

# Frontend dependency scan
echo -e "${YELLOW}1. Scanning Frontend Dependencies (npm audit)...${NC}"
cd frontend
if [ -f "package.json" ]; then
    echo "Frontend npm audit results:" | tee -a $SCAN_RESULTS
    npm audit --audit-level moderate --json > /tmp/frontend_audit.json 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ No vulnerabilities found in frontend dependencies${NC}"
        echo "✅ No vulnerabilities found in frontend dependencies" | tee -a $SCAN_RESULTS
    else
        echo -e "${RED}⚠️ Vulnerabilities found in frontend dependencies${NC}"
        echo "⚠️ Frontend vulnerabilities:" | tee -a $SCAN_RESULTS
        npm audit --audit-level moderate | tee -a $SCAN_RESULTS
    fi
else
    echo "⚠️ Frontend package.json not found" | tee -a $SCAN_RESULTS
fi
cd ..

echo "" | tee -a $SCAN_RESULTS

# Backend dependency scan
echo -e "${YELLOW}2. Scanning Backend Dependencies...${NC}"
cd backend
if [ -f "pyproject.toml" ] || [ -f "requirements.txt" ]; then
    # Check if pip-audit is installed
    if command -v pip-audit &> /dev/null; then
        echo "Backend pip-audit results:" | tee -a $SCAN_RESULTS
        pip-audit --format=json --output=/tmp/backend_audit.json 2>&1
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ No vulnerabilities found in backend dependencies${NC}"
            echo "✅ No vulnerabilities found in backend dependencies" | tee -a $SCAN_RESULTS
        else
            echo -e "${RED}⚠️ Vulnerabilities found in backend dependencies${NC}"
            echo "⚠️ Backend vulnerabilities:" | tee -a $SCAN_RESULTS
            pip-audit | tee -a $SCAN_RESULTS
        fi
    else
        echo "Installing pip-audit..." | tee -a $SCAN_RESULTS
        pip install pip-audit
        pip-audit | tee -a $SCAN_RESULTS
    fi
else
    echo "⚠️ Backend dependency files not found" | tee -a $SCAN_RESULTS
fi
cd ..

echo "" | tee -a $SCAN_RESULTS

# Microservices dependency scan
echo -e "${YELLOW}3. Scanning Microservices Dependencies...${NC}"
microservices_dirs=("onchain-service" "sentiment-service" "tokenomics-service" "team-service" "chainlens-core")

for service in "${microservices_dirs[@]}"; do
    service_path="microservices/$service"
    if [ -d "$service_path" ]; then
        echo "Scanning $service..." | tee -a $SCAN_RESULTS
        cd "$service_path"
        if [ -f "package.json" ]; then
            npm audit --audit-level moderate 2>&1 | tee -a $SCAN_RESULTS
            if [ ${PIPESTATUS[0]} -eq 0 ]; then
                echo "✅ $service: No vulnerabilities found" | tee -a $SCAN_RESULTS
            else
                echo "⚠️ $service: Vulnerabilities found" | tee -a $SCAN_RESULTS
            fi
        fi
        cd - > /dev/null
    else
        echo "⚠️ $service directory not found" | tee -a $SCAN_RESULTS
    fi
done

echo "" | tee -a $SCAN_RESULTS

# License compliance check
echo -e "${YELLOW}4. License Compliance Check...${NC}"
echo "License compliance results:" | tee -a $SCAN_RESULTS

# Check frontend licenses
cd frontend
if [ -f "package.json" ]; then
    echo "Frontend licenses:" | tee -a $SCAN_RESULTS
    if command -v license-checker &> /dev/null; then
        license-checker --summary 2>&1 | tee -a $SCAN_RESULTS
    else
        echo "Installing license-checker..."
        npm install -g license-checker
        license-checker --summary 2>&1 | tee -a $SCAN_RESULTS
    fi
fi
cd ..

echo "" | tee -a $SCAN_RESULTS

# Summary
echo "🔍 Dependency Security Scan Summary" | tee -a $SCAN_RESULTS
echo "===================================" | tee -a $SCAN_RESULTS

# Count vulnerabilities from audit results
frontend_vulns=0
backend_vulns=0
microservice_vulns=0

if [ -f "/tmp/frontend_audit.json" ]; then
    frontend_vulns=$(cat /tmp/frontend_audit.json | jq '.metadata.vulnerabilities.total // 0' 2>/dev/null || echo "0")
fi

if [ -f "/tmp/backend_audit.json" ]; then
    backend_vulns=$(cat /tmp/backend_audit.json | jq '. | length' 2>/dev/null || echo "0")
fi

echo "Frontend vulnerabilities: $frontend_vulns" | tee -a $SCAN_RESULTS
echo "Backend vulnerabilities: $backend_vulns" | tee -a $SCAN_RESULTS
echo "Microservices vulnerabilities: (manual check required)" | tee -a $SCAN_RESULTS
echo "" | tee -a $SCAN_RESULTS

total_vulns=$((frontend_vulns + backend_vulns))

echo "Total known vulnerabilities: $total_vulns" | tee -a $SCAN_RESULTS
echo "" | tee -a $SCAN_RESULTS
echo "Full scan log: $SCAN_RESULTS" | tee -a $SCAN_RESULTS

# Recommendations
echo "📝 Recommendations:" | tee -a $SCAN_RESULTS
echo "==================" | tee -a $SCAN_RESULTS
echo "1. Review and update vulnerable dependencies" | tee -a $SCAN_RESULTS
echo "2. Set up automated dependency scanning in CI/CD" | tee -a $SCAN_RESULTS
echo "3. Implement dependency update policies" | tee -a $SCAN_RESULTS
echo "4. Monitor security advisories for used packages" | tee -a $SCAN_RESULTS

# Clean up temp files
rm -f /tmp/frontend_audit.json /tmp/backend_audit.json

# Exit with appropriate code
if [ $total_vulns -gt 0 ]; then
    echo -e "${RED}⚠️  Found $total_vulns vulnerabilities - review required!${NC}"
    exit 1
else
    echo -e "${GREEN}✅ No critical vulnerabilities found!${NC}"
    exit 0
fi
