# OnChain Analysis Service - API Documentation

## 📋 Overview

The OnChain Analysis Service provides comprehensive blockchain data analysis capabilities including token analysis, risk assessment, liquidity analysis, and DeFi metrics. This service integrates with multiple external APIs (Moralis, DeFiLlama, DexScreener) to provide real-time and historical blockchain data analysis.

## 🔗 Base URL

```
Production: https://api.chainlens.io/api/v1
Development: http://localhost:3001/api/v1
```

## 🔐 Authentication

Currently, the service operates without authentication for development. Production deployment will include API key authentication.

## 📊 API Endpoints

### Health & Monitoring

#### GET /health
Returns the overall health status of the service and its dependencies.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-09-28T17:30:00.000Z",
  "uptime": 12345,
  "version": "1.0.0",
  "environment": "development",
  "services": {
    "database": { "status": "ok", "responseTime": 10 },
    "redis": { "status": "ok", "responseTime": 5 },
    "moralis": { "status": "ok", "responseTime": 100 },
    "defillama": { "status": "ok", "responseTime": 150 },
    "dexscreener": { "status": "ok", "responseTime": 80 }
  }
}
```

#### GET /health/readiness
Checks if the service is ready to accept requests.

#### GET /health/liveness
Checks if the service is alive and responsive.

#### GET /metrics
Returns Prometheus metrics for monitoring.

### OnChain Analysis

#### POST /onchain/analyze
Performs comprehensive on-chain analysis for a given token.

**Request Body:**
```json
{
  "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
  "chainId": "ethereum",
  "analysisDepth": "comprehensive"
}
```

**Response:**
```json
{
  "projectId": "proj_123",
  "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
  "chainId": "ethereum",
  "riskScore": 25.5,
  "confidence": 0.85,
  "analysis": {
    "price": {
      "current": 1.25,
      "change24h": 0.05,
      "volume24h": 1500000
    },
    "liquidity": {
      "totalLiquidity": 2000000,
      "liquidityScore": 85
    },
    "holders": {
      "totalHolders": 15000,
      "topHolderPercentage": 0.12
    },
    "transactions": {
      "count24h": 3000,
      "uniqueTraders24h": 1500
    }
  },
  "timestamp": "2025-09-28T17:30:00.000Z",
  "processingTime": 1250
}
```

#### POST /onchain/token/analyze
Detailed token analysis with holder and transaction data.

**Request Body:**
```json
{
  "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
  "chainId": "ethereum",
  "includeHolders": true,
  "includeTransactions": true,
  "includeMetadata": true
}
```

#### POST /onchain/transactions/analyze
Analyzes transaction patterns for a token.

**Request Body:**
```json
{
  "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
  "chainId": "ethereum",
  "timeframe": "24h",
  "includeDetails": true
}
```

### Risk Assessment

#### POST /onchain/risk/assess
Comprehensive risk assessment for a token.

**Request Body:**
```json
{
  "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
  "chainId": "ethereum",
  "analysisDepth": "comprehensive"
}
```

#### POST /onchain/risk/score
Calculate detailed risk score using the advanced scoring algorithm.

**Request Body:**
```json
{
  "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
  "chainId": "ethereum",
  "analysisDepth": "comprehensive"
}
```

**Response:**
```json
{
  "overallScore": 14.65,
  "riskCategory": "low",
  "confidence": 0.83,
  "factors": [
    {
      "name": "Liquidity Depth",
      "value": 10,
      "weight": 0.6,
      "category": "liquidity",
      "confidence": 0.9,
      "description": "Excellent liquidity depth"
    }
  ],
  "breakdown": {
    "liquidityRisk": 10,
    "volatilityRisk": 17,
    "holderRisk": 22.5,
    "marketRisk": 11.5,
    "technicalRisk": 13
  },
  "recommendations": [
    "Relatively low risk - suitable for most investment strategies",
    "Continue monitoring for any changes in risk profile"
  ],
  "warnings": []
}
```

#### POST /onchain/risk/score/custom
Calculate risk score with custom token data.

**Request Body:**
```json
{
  "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
  "chainId": "ethereum",
  "liquidityUsd": 2000000,
  "volume24h": 1500000,
  "priceChange24h": 0.03,
  "priceChange7d": 0.08,
  "marketCap": 100000000,
  "holders": 15000,
  "topHolderPercentage": 0.12,
  "contractAge": 400,
  "isVerified": true,
  "auditScore": 88,
  "transactionCount24h": 3000,
  "uniqueTraders24h": 1500,
  "liquidityConcentration": 0.3,
  "slippageEstimate": 0.015
}
```

#### POST /onchain/risk/score/bulk
Calculate risk scores for multiple tokens with comparison.

**Request Body:**
```json
{
  "tokens": [
    {
      "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
      "chainId": "ethereum",
      "liquidityUsd": 1000000,
      "volume24h": 500000
    },
    {
      "tokenAddress": "0x1234567890123456789012345678901234567890",
      "chainId": "ethereum",
      "liquidityUsd": 2000000,
      "volume24h": 1000000
    }
  ],
  "includeComparison": true
}
```

**Response:**
```json
{
  "results": [
    {
      "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
      "riskScore": {
        "overallScore": 25,
        "riskCategory": "low",
        "confidence": 0.8
      }
    }
  ],
  "comparison": {
    "averageScore": 35,
    "riskDistribution": {
      "low": 1,
      "medium": 1,
      "high": 0,
      "extreme": 0
    },
    "topRisks": [
      {
        "tokenAddress": "0x1234567890123456789012345678901234567890",
        "score": 45,
        "category": "medium"
      }
    ],
    "recommendations": [
      "Average risk score: 35.0",
      "Risk distribution: 1 low, 1 medium, 0 high, 0 extreme",
      "Consider diversification across different risk categories"
    ]
  }
}
```

### DeFi & DEX Analysis

#### POST /onchain/dex/liquidity/analyze
Analyzes liquidity across DEX platforms for a token.

**Request Body:**
```json
{
  "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
  "chainId": "ethereum"
}
```

#### POST /onchain/dex/pair/analyze
Analyzes a specific DEX trading pair.

**Request Body:**
```json
{
  "pairAddress": "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640"
}
```

#### POST /onchain/dex/pairs
Gets all trading pairs for a token.

**Request Body:**
```json
{
  "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b"
}
```

## 🔧 Supported Chains

- `ethereum` - Ethereum Mainnet
- `bsc` - Binance Smart Chain
- `polygon` - Polygon
- `arbitrum` - Arbitrum One
- `optimism` - Optimism
- `avalanche` - Avalanche C-Chain

## 📊 Risk Scoring Framework

### Risk Categories
- **Low Risk (0-25)**: Suitable for most investment strategies
- **Medium Risk (26-50)**: Suitable for experienced investors
- **High Risk (51-75)**: High-risk tolerance required
- **Extreme Risk (76-100)**: Extreme caution or avoidance advised

### Risk Factors
1. **Liquidity Risk (25% weight)**
   - Liquidity depth analysis
   - Liquidity concentration assessment

2. **Volatility Risk (20% weight)**
   - 24h price volatility
   - 7d price stability

3. **Holder Risk (20% weight)**
   - Total holder count
   - Top holder concentration

4. **Market Risk (20% weight)**
   - Trading volume
   - Market capitalization
   - Unique trader activity

5. **Technical Risk (15% weight)**
   - Contract age
   - Contract verification
   - Audit score

## 🚨 Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "INVALID_TOKEN_ADDRESS",
    "message": "The provided token address is not valid",
    "details": {
      "tokenAddress": "invalid-address",
      "expectedFormat": "0x followed by 40 hexadecimal characters"
    },
    "timestamp": "2025-09-28T17:30:00.000Z",
    "requestId": "req_123456"
  }
}
```

### Common Error Codes
- `INVALID_TOKEN_ADDRESS` (400): Invalid token address format
- `UNSUPPORTED_CHAIN` (400): Chain not supported
- `MISSING_REQUIRED_FIELD` (400): Required field missing
- `RATE_LIMIT_EXCEEDED` (429): Too many requests
- `EXTERNAL_API_ERROR` (502): External API unavailable
- `INTERNAL_SERVER_ERROR` (500): Internal server error

## 📈 Rate Limits

- **Default**: 100 requests per minute per IP
- **Burst**: 200 requests per minute
- **Daily**: 10,000 requests per day

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## 🔍 Response Times

- **Health endpoints**: < 50ms
- **Basic analysis**: < 2s
- **Comprehensive analysis**: < 5s
- **Bulk operations**: < 10s

## 📚 SDKs & Examples

### cURL Examples

```bash
# Health check
curl -X GET http://localhost:3001/api/v1/health

# Basic risk scoring
curl -X POST http://localhost:3001/api/v1/onchain/risk/score \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
    "chainId": "ethereum",
    "analysisDepth": "comprehensive"
  }'

# Custom risk scoring
curl -X POST http://localhost:3001/api/v1/onchain/risk/score/custom \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b",
    "chainId": "ethereum",
    "liquidityUsd": 2000000,
    "volume24h": 1500000,
    "priceChange24h": 0.03,
    "isVerified": true,
    "auditScore": 88
  }'
```

### JavaScript/TypeScript Example

```typescript
const response = await fetch('http://localhost:3001/api/v1/onchain/risk/score', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tokenAddress: '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b',
    chainId: 'ethereum',
    analysisDepth: 'comprehensive'
  })
});

const riskScore = await response.json();
console.log(`Risk Score: ${riskScore.overallScore} (${riskScore.riskCategory})`);
```

## 🔗 Interactive Documentation

Visit `/api/docs` for interactive Swagger documentation where you can test endpoints directly.

## 📞 Support

For API support and questions:
- Documentation: `/api/docs`
- Health Status: `/api/v1/health`
- Metrics: `/api/v1/metrics`

---

**Last Updated:** 2025-09-28  
**API Version:** 1.0.0  
**Service:** OnChain Analysis Service
