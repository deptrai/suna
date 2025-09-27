#!/bin/bash

# Script to display the organized ChainLens scripts directory structure

echo "🚀 ChainLens Scripts Directory Structure"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}📁 Organized Directory Structure:${NC}"
echo ""

echo -e "${GREEN}🚀 core/${NC}           - Main startup and management scripts"
ls core/ | sed 's/^/    /'

echo ""
echo -e "${GREEN}📊 monitoring/${NC}     - Dashboard and monitoring tools"
ls monitoring/ | sed 's/^/    /'

echo ""
echo -e "${GREEN}🧪 testing/${NC}        - Test scripts and validation tools"
ls testing/ | head -5 | sed 's/^/    /'
echo "    ... ($(ls testing/ | wc -l | tr -d ' ') total files)"

echo ""
echo -e "${GREEN}🛠️  maintenance/${NC}    - Cleanup, security, and backup scripts"
ls maintenance/ | sed 's/^/    /'

echo ""
echo -e "${GREEN}🔧 utils/${NC}          - Helper and utility scripts"
ls utils/ | sed 's/^/    /'

echo ""
echo -e "${GREEN}📚 lib/${NC}            - Shared libraries and functions"
ls lib/ | head -5 | sed 's/^/    /'

echo ""
echo -e "${GREEN}📦 archive/${NC}        - Deprecated scripts"
ls archive/ | sed 's/^/    /'

echo ""
echo -e "${GREEN}📖 docs/${NC}           - Documentation files"
ls docs/ | sed 's/^/    /'

echo ""
echo -e "${BLUE}📊 Statistics:${NC}"
echo -e "  Total directories: $(find . -maxdepth 1 -type d | wc -l | tr -d ' ')"
echo -e "  Total scripts: $(find . -name "*.sh" | wc -l | tr -d ' ')"
echo -e "  Core scripts: $(ls core/*.sh 2>/dev/null | wc -l | tr -d ' ')"
echo -e "  Monitoring tools: $(ls monitoring/*.sh 2>/dev/null | wc -l | tr -d ' ')"
echo -e "  Test scripts: $(ls testing/*.sh 2>/dev/null | wc -l | tr -d ' ')"

echo ""
echo -e "${YELLOW}🎯 Quick Commands:${NC}"
echo -e "  Start environment:     ${CYAN}./core/start_dev_v3_enhanced.sh${NC}"
echo -e "  Monitor services:      ${CYAN}./monitoring/monitoring_utils.sh status${NC}"
echo -e "  Run tests:             ${CYAN}./testing/test_startup_integration.sh${NC}"
echo -e "  Clean environment:     ${CYAN}./core/quick_cleanup_v2.sh${NC}"

echo ""
echo -e "${PURPLE}✨ Features:${NC}"
echo -e "  ✅ Organized by function and purpose"
echo -e "  ✅ Latest versions only (v1, v2 archived)"
echo -e "  ✅ Clear documentation and examples"
echo -e "  ✅ Integrated monitoring dashboard"
echo -e "  ✅ Comprehensive testing suite"

echo ""