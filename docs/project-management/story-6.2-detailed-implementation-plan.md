# Story 6.2: Backend Tool Integration - Detailed Implementation Plan

**Date:** October 2, 2025  
**Story Points:** 5  
**Priority:** P0 (Critical)  
**Sprint:** 5

---

## Architecture Review

### Current Tool Pattern Analysis

#### 1. Tool Base Class Structure
```python
class SandboxToolsBase(Tool):
    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__()
        self.project_id = project_id
        self.thread_manager = thread_manager
        self.workspace_path = "/workspace"
        self._sandbox = None
```

#### 2. Tool Registration Pattern
**Location:** `backend/core/run.py`

```python
def _register_sandbox_tools(self, disabled_tools: List[str]):
    sandbox_tools = [
        ('web_search_tool', SandboxWebSearchTool, {
            'project_id': self.project_id, 
            'thread_manager': self.thread_manager
        }),
        # ... other tools
    ]
```

#### 3. Tool Method Decorators
```python
@openapi_schema({
    "type": "function",
    "function": {
        "name": "tool_name",
        "description": "Tool description for LLM",
        "parameters": {
            "type": "object",
            "properties": {...},
            "required": [...]
        }
    }
})
@usage_example('''
    <function_calls>
    <invoke name="tool_name">
    <parameter name="param1">value1</parameter>
    </invoke>
    </function_calls>
''')
async def tool_method(self, param1: str) -> ToolResult:
    try:
        # Implementation
        return ToolResult(success=True, output=result)
    except Exception as e:
        return self.fail_response(error_message)
```

---

## Task Breakdown

### T6.2.1: Create Crypto Services Tool (2 hours)

#### File: `backend/core/tools/crypto_services_tool.py`

**Imports Required:**
```python
import httpx
import json
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv
from core.agentpress.tool import Tool, ToolResult, openapi_schema, usage_example
from core.utils.config import config
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
import logging
```

**Class Structure:**
```python
class SandboxCryptoServicesTool(SandboxToolsBase):
    """Tool for analyzing cryptocurrency projects using ChainLens-Core microservices."""
    
    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        load_dotenv()
        
        # ChainLens-Core API Gateway configuration
        self.chainlens_core_url = config.CHAINLENS_CORE_URL or "http://localhost:3006"
        self.chainlens_core_api_key = config.CHAINLENS_CORE_API_KEY
        
        # Supabase JWT for authentication
        self.supabase_jwt = None  # Will be set from thread_manager
```

**Methods to Implement:**

#### 1. `analyze_crypto_project` - Full Analysis
```python
@openapi_schema({...})
@usage_example('''...''')
async def analyze_crypto_project(
    self,
    project_id: str,
    analysis_type: str = "full"
) -> ToolResult:
    """
    Perform comprehensive cryptocurrency project analysis.
    
    Parameters:
    - project_id: Project identifier (e.g., "uniswap", "bitcoin")
    - analysis_type: Type of analysis ("full", "quick", "deep")
    
    Returns comprehensive analysis including:
    - OnChain metrics (liquidity, holders, transactions)
    - Sentiment analysis (social media, news)
    - Tokenomics (supply, distribution, economics)
    - Team verification (background, credibility)
    """
```

**API Call:**
```python
POST http://localhost:3006/api/v1/analyze
Headers:
  Authorization: Bearer {supabase_jwt}
  Content-Type: application/json
Body:
  {
    "projectId": "uniswap",
    "analysisType": "full"
  }
```

#### 2. `get_onchain_analysis` - OnChain Metrics
```python
@openapi_schema({...})
@usage_example('''...''')
async def get_onchain_analysis(
    self,
    token_address: str,
    chain: str = "ethereum"
) -> ToolResult:
    """
    Get detailed onchain analysis for a specific token.
    
    Parameters:
    - token_address: Token contract address
    - chain: Blockchain network (ethereum, bsc, polygon, etc.)
    
    Returns:
    - Liquidity analysis
    - Holder distribution
    - Transaction patterns
    - Whale activity
    - Contract security
    """
```

**API Call:**
```python
POST http://localhost:3006/api/v1/onchain/analyze
Body:
  {
    "tokenAddress": "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    "chainId": "ethereum"
  }
```

#### 3. `get_sentiment_analysis` - Social Sentiment
```python
@openapi_schema({...})
@usage_example('''...''')
async def get_sentiment_analysis(
    self,
    project_id: str,
    timeframe: str = "7d"
) -> ToolResult:
    """
    Get sentiment analysis from social media and news.
    
    Parameters:
    - project_id: Project identifier
    - timeframe: Analysis timeframe (7d, 30d, 90d)
    
    Returns:
    - Sentiment trend
    - Influencer impact
    - Fear & Greed index
    - Social volume
    - Sentiment-price correlation
    """
```

**API Calls:**
```python
GET http://localhost:3006/api/v1/sentiment/trend/{project_id}?timeframe=7d
GET http://localhost:3006/api/v1/sentiment/fear-greed/{project_id}
GET http://localhost:3006/api/v1/sentiment/influencers/{project_id}
```

#### 4. `get_tokenomics_analysis` - Token Economics
```python
@openapi_schema({...})
@usage_example('''...''')
async def get_tokenomics_analysis(
    self,
    project_id: str,
    analysis_type: str = "basic"
) -> ToolResult:
    """
    Get tokenomics analysis including supply, distribution, and economics.
    
    Parameters:
    - project_id: Project identifier
    - analysis_type: "basic" or "defi"
    
    Returns:
    - Supply metrics
    - Distribution analysis
    - Vesting schedules
    - Inflation/deflation
    - DeFi protocol metrics (if applicable)
    """
```

**API Calls:**
```python
POST http://localhost:3006/api/v1/tokenomics/analyze
GET http://localhost:3006/api/v1/tokenomics/defi/tvl/{project_id}
GET http://localhost:3006/api/v1/tokenomics/defi/yield/{project_id}
```

#### 5. `verify_team` - Team Background Check
```python
@openapi_schema({...})
@usage_example('''...''')
async def verify_team(
    self,
    project_id: str,
    github_org: Optional[str] = None
) -> ToolResult:
    """
    Verify team background and credibility.
    
    Parameters:
    - project_id: Project identifier
    - github_org: GitHub organization name (optional)
    
    Returns:
    - Team member profiles
    - GitHub activity
    - LinkedIn verification
    - Credibility score
    - Red flags
    """
```

**API Calls:**
```python
POST http://localhost:3006/api/v1/team/verify
GET http://localhost:3006/api/v1/team/analytics/red-flags/{project_id}
GET http://localhost:3006/api/v1/team/analytics/network/{project_id}
```

#### 6. `get_advanced_analytics` - Advanced Metrics
```python
@openapi_schema({...})
@usage_example('''...''')
async def get_advanced_analytics(
    self,
    project_id: str,
    metrics: List[str]
) -> ToolResult:
    """
    Get advanced analytics for specific metrics.
    
    Parameters:
    - project_id: Project identifier
    - metrics: List of metrics to analyze
      ["liquidity", "holders", "whales", "sentiment", "team"]
    
    Returns:
    - Detailed metrics for requested categories
    """
```

**Helper Methods:**

```python
async def _call_chainlens_core(
    self,
    method: str,
    endpoint: str,
    data: Optional[Dict] = None,
    params: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Make HTTP request to ChainLens-Core API Gateway.
    
    Handles:
    - JWT authentication
    - Error handling
    - Response parsing
    - Retry logic
    """
    
async def _get_jwt_token(self) -> str:
    """
    Get Supabase JWT token from thread_manager or user session.
    """
    
async def _format_analysis_response(
    self,
    response: Dict[str, Any],
    analysis_type: str
) -> str:
    """
    Format API response into human-readable output for LLM.
    """
```

---

### T6.2.2: Register Tool in Backend (30 minutes)

#### File: `backend/core/run.py`

**Step 1: Add Import**
```python
from core.tools.crypto_services_tool import SandboxCryptoServicesTool
```

**Step 2: Register in `_register_sandbox_tools`**
```python
def _register_sandbox_tools(self, disabled_tools: List[str]):
    sandbox_tools = [
        # ... existing tools ...
        ('crypto_services_tool', SandboxCryptoServicesTool, {
            'project_id': self.project_id, 
            'thread_manager': self.thread_manager
        }),
    ]
```

#### File: `backend/core/utils/config.py`

**Add Configuration:**
```python
CHAINLENS_CORE_URL: str = os.getenv("CHAINLENS_CORE_URL", "http://localhost:3006")
CHAINLENS_CORE_API_KEY: str = os.getenv("CHAINLENS_CORE_API_KEY", "")
```

#### File: `backend/.env`

**Add Environment Variables:**
```bash
CHAINLENS_CORE_URL=http://localhost:3006
CHAINLENS_CORE_API_KEY=your_api_key_here
```

---

### T6.2.3: Add Documentation (30 minutes)

#### Update Agent Builder Prompt

**File:** `backend/core/prompts/agent_builder_prompt.py`

**Add to Tool List:**
```python
- **`crypto_services_tool`**: Analyze cryptocurrency projects, get onchain metrics, sentiment analysis, tokenomics, team verification
```

**Add to Use Case Mapping:**
```python
**🪙 Cryptocurrency Analysis**
- Required: `crypto_services_tool`, `web_search_tool`
- Optional: `sb_files_tool` (for reports)
- Integrations: CoinGecko, DexScreener, Twitter, GitHub
```

---

### T6.2.4: Test End-to-End Integration (1 hour)

#### Test Cases

**1. Test Crypto Query Detection**
```python
# Test that LLM detects crypto queries and calls tool
user_query = "Analyze Uniswap token"
# Expected: LLM calls crypto_services_tool.analyze_crypto_project("uniswap")
```

**2. Test Tool Calling**
```python
# Test direct tool invocation
result = await crypto_tool.analyze_crypto_project("uniswap", "full")
assert result.success == True
assert "liquidity" in result.output
```

**3. Test ChainLens-Core API Calls**
```python
# Test HTTP client to ChainLens-Core
response = await crypto_tool._call_chainlens_core(
    "POST",
    "/api/v1/analyze",
    data={"projectId": "uniswap"}
)
assert response["success"] == True
```

**4. Test Response Formatting**
```python
# Test response formatting for LLM
formatted = await crypto_tool._format_analysis_response(
    response,
    "full"
)
assert isinstance(formatted, str)
assert len(formatted) > 0
```

**5. Test Error Handling**
```python
# Test error handling for invalid project
result = await crypto_tool.analyze_crypto_project("invalid_project")
assert result.success == False
assert "error" in result.output.lower()
```

**6. Test with Different User Tiers**
```python
# Test rate limiting for different user tiers
# Free tier: 10 requests/day
# Pro tier: 100 requests/day
# Enterprise tier: unlimited
```

---

## Implementation Checklist

### Phase 1: Core Implementation (2h)
- [ ] Create `crypto_services_tool.py`
- [ ] Implement `SandboxCryptoServicesTool` class
- [ ] Implement `analyze_crypto_project` method
- [ ] Implement `get_onchain_analysis` method
- [ ] Implement `get_sentiment_analysis` method
- [ ] Implement `get_tokenomics_analysis` method
- [ ] Implement `verify_team` method
- [ ] Implement `get_advanced_analytics` method
- [ ] Implement helper methods (`_call_chainlens_core`, `_get_jwt_token`, `_format_analysis_response`)

### Phase 2: Registration (30min)
- [ ] Add import to `run.py`
- [ ] Register tool in `_register_sandbox_tools`
- [ ] Add configuration to `config.py`
- [ ] Add environment variables to `.env`

### Phase 3: Documentation (30min)
- [ ] Update agent builder prompt
- [ ] Add tool to use case mapping
- [ ] Add usage examples
- [ ] Document error handling

### Phase 4: Testing (1h)
- [ ] Test crypto query detection
- [ ] Test tool calling
- [ ] Test ChainLens-Core API calls
- [ ] Test response formatting
- [ ] Test error handling
- [ ] Test with different user tiers
- [ ] Test end-to-end flow

---

## Success Criteria

1. ✅ Tool successfully calls ChainLens-Core API Gateway
2. ✅ LLM can detect crypto queries and invoke tool
3. ✅ All 6 methods working correctly
4. ✅ Error handling graceful and informative
5. ✅ Response formatting clear for LLM
6. ✅ End-to-end flow tested: Frontend → Backend → ChainLens-Core → Microservices
7. ✅ Documentation complete and accurate

---

## Estimated Timeline

- **T6.2.1:** 2 hours (Core implementation)
- **T6.2.2:** 30 minutes (Registration)
- **T6.2.3:** 30 minutes (Documentation)
- **T6.2.4:** 1 hour (Testing)

**Total:** 4 hours

---

## Next Steps After Completion

1. Deploy to staging environment
2. Test with real users
3. Monitor performance and errors
4. Gather feedback
5. Iterate and improve

---

**Status:** ❌ NOT STARTED  
**Assigned To:** AI Agent  
**Due Date:** TBD

