# ChainLens Crypto Services - API Design Specification

**Version:** 1.0  
**Date:** 27/01/2025  
**Author:** Winston - System Architect  
**Status:** Approved for Implementation  

---

## 1. API Overview

### 1.1 Design Principles
- **RESTful Design:** Standard HTTP methods và status codes
- **Consistent Naming:** Clear, predictable endpoint patterns
- **Versioning:** API versioning for backward compatibility
- **Security First:** Authentication, authorization, rate limiting
- **Performance:** Caching, pagination, compression
- **Developer Experience:** Clear documentation, examples, SDKs

### 1.2 API Architecture
```
Base URL: https://api.chainlens.com
Version: /api/v1
Authentication: Bearer JWT tokens
Content-Type: application/json
Rate Limiting: Tier-based limits
```

### 1.3 Global Response Format
```json
{
  "success": true,
  "data": {},
  "meta": {
    "timestamp": "2025-01-27T10:00:00Z",
    "version": "1.0",
    "requestId": "req_123456789"
  },
  "errors": []
}
```

---

## 2. ChainLens-Core API Gateway

### 2.1 Authentication Endpoints

#### POST /api/v1/auth/login
**Purpose:** User authentication  
**Rate Limit:** 5 requests/minute per IP  

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "refresh_token_here",
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "tier": "pro",
      "permissions": ["crypto:analyze", "data:export"]
    },
    "expiresIn": 3600
  }
}
```

#### POST /api/v1/auth/refresh
**Purpose:** Token refresh  
**Rate Limit:** 10 requests/minute per user  

**Request:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

### 2.2 Core Analysis Endpoints

#### POST /api/v1/analyze
**Purpose:** Comprehensive crypto project analysis  
**Rate Limit:** Tier-based (Free: 10/day, Pro: unlimited)  
**Cache TTL:** 5 minutes  

**Request:**
```json
{
  "projectId": "uniswap",
  "analysisType": "full",
  "options": {
    "includeHistorical": true,
    "timeframe": "30d",
    "chains": ["ethereum", "polygon"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "projectId": "uniswap",
    "analysisType": "full",
    "overallScore": 85,
    "confidence": 0.92,
    "riskLevel": "low",
    "timestamp": "2025-01-27T10:00:00Z",
    "processingTime": 3247,
    "services": {
      "onchain": {
        "status": "success",
        "data": {
          "price": {
            "current": 12.45,
            "change24h": 2.3,
            "change7d": -1.2,
            "marketCap": 12500000000
          },
          "liquidity": {
            "totalLiquidity": 850000000,
            "topPools": [
              {
                "exchange": "Uniswap V3",
                "pair": "UNI/ETH",
                "liquidity": 125000000,
                "volume24h": 45000000
              }
            ]
          },
          "holders": {
            "totalHolders": 285000,
            "top10Concentration": 0.15,
            "distributionScore": 78
          },
          "riskScore": 25
        },
        "responseTime": 1250
      },
      "sentiment": {
        "status": "success",
        "data": {
          "overallSentiment": 0.65,
          "sources": {
            "twitter": {
              "sentiment": 0.7,
              "mentions": 1250,
              "engagement": 85000
            },
            "reddit": {
              "sentiment": 0.6,
              "posts": 45,
              "comments": 320
            },
            "news": {
              "sentiment": 0.65,
              "articles": 12,
              "sources": ["CoinDesk", "CoinTelegraph"]
            }
          },
          "trend": "positive",
          "confidence": 0.88
        },
        "responseTime": 1850
      },
      "tokenomics": {
        "status": "success",
        "data": {
          "supply": {
            "total": 1000000000,
            "circulating": 753000000,
            "inflation": 2.5
          },
          "distribution": {
            "team": 0.2,
            "investors": 0.18,
            "community": 0.62,
            "fairnessScore": 82
          },
          "defi": {
            "stakingAPY": 8.5,
            "yieldOpportunities": [
              {
                "protocol": "Compound",
                "apy": 6.2,
                "tvl": 45000000
              }
            ]
          },
          "tokenomicsScore": 78
        },
        "responseTime": 2100
      },
      "team": {
        "status": "success",
        "data": {
          "teamSize": 45,
          "credibilityScore": 88,
          "members": [
            {
              "name": "Hayden Adams",
              "role": "Founder",
              "linkedin": "verified",
              "github": "verified",
              "experience": 8
            }
          ],
          "development": {
            "githubActivity": 95,
            "commits30d": 234,
            "contributors": 67
          },
          "verification": "high"
        },
        "responseTime": 1650
      }
    },
    "warnings": [],
    "recommendations": [
      "low_risk_positive_indicators",
      "strong_community_support",
      "active_development"
    ]
  },
  "meta": {
    "timestamp": "2025-01-27T10:00:00Z",
    "version": "1.0",
    "requestId": "req_analyze_123456",
    "cached": false,
    "correlationId": "corr_abc123"
  }
}
```

#### GET /api/v1/analyze/{projectId}/history
**Purpose:** Historical analysis data  
**Rate Limit:** Pro tier required  

**Query Parameters:**
- `timeframe`: 7d, 30d, 90d, 1y
- `metrics`: price,sentiment,volume
- `format`: json, csv

**Response:**
```json
{
  "success": true,
  "data": {
    "projectId": "uniswap",
    "timeframe": "30d",
    "dataPoints": [
      {
        "date": "2025-01-01",
        "overallScore": 82,
        "price": 11.50,
        "sentiment": 0.6,
        "volume": 35000000
      }
    ]
  }
}
```

### 2.3 User Management Endpoints

#### GET /api/v1/user/profile
**Purpose:** Get user profile và subscription info  

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "tier": "pro",
      "createdAt": "2025-01-01T00:00:00Z"
    },
    "subscription": {
      "tier": "pro",
      "status": "active",
      "renewsAt": "2025-02-27T00:00:00Z",
      "features": ["unlimited_queries", "csv_export", "priority_support"]
    },
    "usage": {
      "queriesThisMonth": 245,
      "queriesRemaining": "unlimited",
      "lastQuery": "2025-01-27T09:30:00Z"
    }
  }
}
```

#### GET /api/v1/user/usage
**Purpose:** Detailed usage analytics  

**Query Parameters:**
- `period`: day, week, month, year
- `startDate`: ISO date string
- `endDate`: ISO date string

### 2.4 Export Endpoints

#### POST /api/v1/export/analysis
**Purpose:** Export analysis data (Pro+ only)  
**Rate Limit:** 10 exports/hour  

**Request:**
```json
{
  "projectIds": ["uniswap", "chainlink"],
  "format": "csv",
  "fields": ["price", "sentiment", "risk_score"],
  "timeframe": "30d"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "exportId": "export_123456",
    "status": "processing",
    "estimatedTime": 30,
    "downloadUrl": null
  }
}
```

#### GET /api/v1/export/{exportId}/status
**Purpose:** Check export status  

**Response:**
```json
{
  "success": true,
  "data": {
    "exportId": "export_123456",
    "status": "completed",
    "downloadUrl": "https://exports.chainlens.com/export_123456.csv",
    "expiresAt": "2025-01-28T10:00:00Z",
    "fileSize": 2048576
  }
}
```

---

## 3. Microservice APIs

### 3.1 OnChain Analysis Service

#### POST /analyze
**Purpose:** Blockchain data analysis  
**Internal API:** Service-to-service communication  

**Request:**
```json
{
  "projectId": "uniswap",
  "tokenAddress": "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
  "chainId": 1,
  "correlationId": "corr_abc123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "price": {
      "current": 12.45,
      "change24h": 2.3,
      "change7d": -1.2,
      "change30d": 15.8,
      "marketCap": 12500000000,
      "volume24h": 125000000,
      "volatility": 0.45
    },
    "liquidity": {
      "totalLiquidity": 850000000,
      "liquidityScore": 85,
      "topPools": [
        {
          "exchange": "Uniswap V3",
          "pair": "UNI/ETH",
          "liquidity": 125000000,
          "volume24h": 45000000,
          "fee": 0.3
        }
      ],
      "slippageEstimate": {
        "1000": 0.1,
        "10000": 0.5,
        "100000": 2.1
      }
    },
    "holders": {
      "totalHolders": 285000,
      "holderGrowth24h": 150,
      "top10Concentration": 0.15,
      "top100Concentration": 0.45,
      "distributionScore": 78,
      "whaleActivity": "low"
    },
    "transactions": {
      "count24h": 15000,
      "volume24h": 125000000,
      "avgTransactionSize": 8333,
      "botActivity": 0.12,
      "uniqueTraders24h": 8500
    },
    "riskScore": 25,
    "confidence": 0.91
  }
}
```

### 3.2 Sentiment Analysis Service

#### POST /analyze
**Purpose:** Social sentiment analysis  

**Request:**
```json
{
  "projectId": "uniswap",
  "keywords": ["uniswap", "UNI", "$UNI"],
  "timeframe": "24h",
  "correlationId": "corr_abc123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overallSentiment": 0.65,
    "sentimentTrend": "positive",
    "sources": {
      "twitter": {
        "sentiment": 0.7,
        "mentions": 1250,
        "engagement": 85000,
        "topHashtags": ["#DeFi", "#Uniswap", "#Ethereum"],
        "influencerMentions": 15,
        "botDetection": 0.08
      },
      "reddit": {
        "sentiment": 0.6,
        "posts": 45,
        "comments": 320,
        "upvoteRatio": 0.78,
        "subreddits": ["r/ethereum", "r/defi", "r/uniswap"]
      },
      "news": {
        "sentiment": 0.65,
        "articles": 12,
        "sources": ["CoinDesk", "CoinTelegraph", "Decrypt"],
        "categories": ["technology", "market", "regulation"]
      }
    },
    "historicalTrend": {
      "7d": 0.62,
      "30d": 0.58,
      "trend": "improving"
    },
    "alerts": [
      {
        "type": "positive_spike",
        "description": "Unusual positive sentiment increase",
        "confidence": 0.85
      }
    ],
    "confidence": 0.88
  }
}
```

### 3.3 Tokenomics Analysis Service

#### POST /analyze
**Purpose:** Token economics analysis  

**Request:**
```json
{
  "projectId": "uniswap",
  "tokenAddress": "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
  "protocolName": "uniswap",
  "correlationId": "corr_abc123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "supply": {
      "total": 1000000000,
      "circulating": 753000000,
      "maxSupply": 1000000000,
      "inflation": 2.5,
      "burnRate": 0,
      "vestingSchedule": {
        "team": {
          "total": 200000000,
          "vested": 150000000,
          "nextUnlock": "2025-03-01"
        }
      }
    },
    "distribution": {
      "team": 0.2,
      "investors": 0.18,
      "community": 0.62,
      "fairnessScore": 82,
      "giniCoefficient": 0.45
    },
    "defi": {
      "stakingAPY": 8.5,
      "totalStaked": 125000000,
      "stakingRatio": 0.166,
      "yieldOpportunities": [
        {
          "protocol": "Compound",
          "apy": 6.2,
          "tvl": 45000000,
          "risk": "low"
        },
        {
          "protocol": "Aave",
          "apy": 5.8,
          "tvl": 38000000,
          "risk": "low"
        }
      ]
    },
    "utility": {
      "governance": true,
      "fees": true,
      "staking": true,
      "utilityScore": 85
    },
    "metrics": {
      "velocityScore": 65,
      "hodlRatio": 0.72,
      "activeAddresses": 45000
    },
    "tokenomicsScore": 78,
    "confidence": 0.89
  }
}
```

### 3.4 Team Verification Service

#### POST /analyze
**Purpose:** Team credibility analysis  

**Request:**
```json
{
  "projectId": "uniswap",
  "teamMembers": [
    {
      "name": "Hayden Adams",
      "role": "Founder",
      "linkedin": "hayden-adams-uniswap",
      "github": "haydenadams",
      "twitter": "haydenzadams"
    }
  ],
  "projectWebsite": "https://uniswap.org",
  "githubOrg": "Uniswap",
  "correlationId": "corr_abc123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "teamSize": 45,
    "credibilityScore": 88,
    "verification": "high",
    "members": [
      {
        "name": "Hayden Adams",
        "role": "Founder",
        "verification": {
          "linkedin": {
            "verified": true,
            "connections": 5000,
            "experience": 8,
            "credibilityScore": 92
          },
          "github": {
            "verified": true,
            "followers": 2500,
            "repositories": 45,
            "contributions": 1250,
            "credibilityScore": 95
          },
          "twitter": {
            "verified": true,
            "followers": 125000,
            "engagement": 0.08,
            "credibilityScore": 88
          }
        },
        "overallScore": 92
      }
    ],
    "development": {
      "githubActivity": 95,
      "commits30d": 234,
      "contributors": 67,
      "codeQuality": 88,
      "documentation": 85,
      "testCoverage": 78
    },
    "background": {
      "previousProjects": [
        {
          "name": "Ethereum Foundation",
          "role": "Developer",
          "success": true
        }
      ],
      "education": "verified",
      "experience": "high"
    },
    "riskFlags": [],
    "confidence": 0.91
  }
}
```

---

## 4. Error Handling

### 4.1 Standard Error Responses

#### 400 Bad Request
```json
{
  "success": false,
  "data": null,
  "errors": [
    {
      "code": "INVALID_PROJECT_ID",
      "message": "Project ID 'invalid-project' not found",
      "field": "projectId",
      "details": {
        "validFormats": ["string", "contract_address"],
        "examples": ["bitcoin", "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"]
      }
    }
  ],
  "meta": {
    "timestamp": "2025-01-27T10:00:00Z",
    "requestId": "req_error_123456"
  }
}
```

#### 429 Rate Limit Exceeded
```json
{
  "success": false,
  "data": null,
  "errors": [
    {
      "code": "RATE_LIMIT_EXCEEDED",
      "message": "Rate limit exceeded. Upgrade to Pro for unlimited queries.",
      "details": {
        "limit": 10,
        "remaining": 0,
        "resetTime": "2025-01-28T00:00:00Z",
        "upgradeUrl": "https://chainlens.com/upgrade"
      }
    }
  ]
}
```

### 4.2 Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_PROJECT_ID` | 400 | Project not found or invalid format |
| `RATE_LIMIT_EXCEEDED` | 429 | User exceeded tier limits |
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `SERVICE_UNAVAILABLE` | 503 | External service temporarily down |
| `ANALYSIS_TIMEOUT` | 504 | Analysis took too long to complete |
| `INSUFFICIENT_DATA` | 422 | Not enough data for reliable analysis |

---

## 5. Rate Limiting

### 5.1 Rate Limit Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1643284800
X-RateLimit-Tier: pro
```

### 5.2 Tier-Based Limits

| Tier | Requests/Minute | Daily Limit | Burst Allowance |
|------|----------------|-------------|-----------------|
| **Free** | 10 | 10 queries | 2x for 1 minute |
| **Pro** | 100 | Unlimited | 5x for 5 minutes |
| **Enterprise** | 1000 | Unlimited | 10x for 10 minutes |

---

## 6. Webhooks (Enterprise)

### 6.1 Webhook Events

#### analysis.completed
```json
{
  "event": "analysis.completed",
  "data": {
    "projectId": "uniswap",
    "analysisId": "analysis_123456",
    "overallScore": 85,
    "riskLevel": "low",
    "completedAt": "2025-01-27T10:00:00Z"
  },
  "webhook": {
    "id": "webhook_789",
    "attempt": 1,
    "timestamp": "2025-01-27T10:00:01Z"
  }
}
```

### 6.2 Webhook Security
- HMAC-SHA256 signature verification
- Retry logic với exponential backoff
- Webhook endpoint validation

---

**API Design Status:** ✅ Complete Specification Ready for Implementation

**Next Steps:**
1. OpenAPI/Swagger documentation generation
2. SDK development (JavaScript, Python)
3. Postman collection creation
4. API testing framework setup
5. Developer portal documentation
