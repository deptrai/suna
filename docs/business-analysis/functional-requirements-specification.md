# ChainLens Crypto Services - Functional Requirements Specification (FRS)

**Version:** 1.0  
**Date:** 27/01/2025  
**Author:** Business Analyst  
**Status:** Approved for Development  
**Project:** ChainLens Crypto Services MVP  

---

## 1. Introduction

### 1.1 Purpose
This document specifies the detailed functional requirements for ChainLens Crypto Services, extending ChainLens-Automation with comprehensive cryptocurrency analysis capabilities.

### 1.2 Scope
The system encompasses 5 microservices providing crypto analysis, subscription management, và integration với existing ChainLens-Automation platform.

### 1.3 Document Conventions
- **FR-XXX:** Functional Requirement identifier
- **Priority:** Critical/High/Medium/Low
- **Complexity:** High/Medium/Low

---

## 2. System Overview

### 2.1 System Context
```
ChainLens-Automation (Existing) + ChainLens Crypto Services (New)
├── Frontend: Next.js (Port 3000)
├── Backend: FastAPI (Port 8000) 
└── Crypto Services:
    ├── ChainLens-Core (Port 3006) - API Gateway
    ├── OnChain Analysis (Port 3001)
    ├── Sentiment Analysis (Port 3002)
    ├── Tokenomics Analysis (Port 3003)
    └── Team Verification (Port 3004)
```

### 2.2 User Roles
| Role | Description | Permissions |
|------|-------------|-------------|
| **Free User** | Basic access | 10 queries/day, 5 projects |
| **Pro User** | Premium access | Unlimited queries, 50 projects |
| **Enterprise User** | Full access | All features + API access |
| **Admin** | System management | All permissions + admin panel |

---

## 3. Core Functional Requirements

### 3.1 Crypto Project Analysis Module

#### FR-001: Project Analysis Request
**Priority:** Critical  
**Complexity:** High  

**Description:** System shall accept và process crypto project analysis requests

**Detailed Requirements:**
1. **Input Validation:**
   - Accept project identifier (name, symbol, or contract address)
   - Validate input format và existence
   - Return appropriate error messages for invalid inputs

2. **Request Processing:**
   - Generate unique correlation ID for tracking
   - Determine analysis scope based on user tier
   - Route request to appropriate microservices
   - Aggregate responses from all services

3. **Response Format:**
   ```json
   {
     "projectId": "string",
     "analysisType": "full|onchain|sentiment|tokenomics|team",
     "overallScore": "number (0-100)",
     "confidence": "number (0-1)",
     "riskLevel": "very-high|high|medium|low",
     "timestamp": "ISO 8601",
     "processingTime": "number (milliseconds)",
     "services": {
       "onchain": { "status": "success|failed", "data": {} },
       "sentiment": { "status": "success|failed", "data": {} },
       "tokenomics": { "status": "success|failed", "data": {} },
       "team": { "status": "success|failed", "data": {} }
     },
     "warnings": ["string"],
     "recommendations": ["string"]
   }
   ```

**Acceptance Criteria:**
- Response time <5 seconds for 95% of requests
- Support for 1000+ cryptocurrency projects
- Graceful handling of partial service failures
- Comprehensive error logging với correlation IDs

---

#### FR-002: OnChain Analysis Service
**Priority:** Critical  
**Complexity:** High  

**Description:** Analyze blockchain data for comprehensive on-chain metrics

**Detailed Requirements:**
1. **Price Analysis:**
   - Current price và market cap
   - Price changes (1h, 24h, 7d, 30d)
   - Volume analysis và trends
   - Price volatility metrics

2. **Liquidity Analysis:**
   - Total liquidity across DEXs
   - Liquidity distribution by exchange
   - Liquidity depth analysis
   - Slippage estimation for different trade sizes

3. **Holder Analysis:**
   - Total holder count
   - Top holder concentration (top 10, 100, 1000)
   - Holder distribution fairness score
   - Whale activity monitoring

4. **Transaction Analysis:**
   - Daily transaction count và volume
   - Average transaction size
   - Bot activity detection
   - Transaction pattern analysis

**External API Integration:**
- Moralis API for blockchain data
- DexScreener API for DEX information
- DeFiLlama API for protocol data

**Data Sources:**
- Ethereum, BSC, Polygon, Arbitrum, Optimism
- Major DEXs: Uniswap, PancakeSwap, SushiSwap
- CEX data where available

---

#### FR-003: Sentiment Analysis Service
**Priority:** High  
**Complexity:** High  

**Description:** Analyze social media và news sentiment for market mood assessment

**Detailed Requirements:**
1. **Twitter Sentiment:**
   - Mention count và frequency
   - Sentiment scoring (-1 to +1)
   - Trending hashtags related to project
   - Influencer mention tracking
   - Engagement metrics (likes, retweets, replies)

2. **Reddit Sentiment:**
   - Post count in relevant subreddits
   - Comment sentiment analysis
   - Subreddit activity levels
   - Community engagement metrics

3. **News Sentiment:**
   - News article count và frequency
   - Article sentiment scoring
   - Key headline extraction
   - Source credibility weighting

4. **Aggregated Metrics:**
   - Overall sentiment score
   - Sentiment trend analysis (24h, 7d, 30d)
   - Sentiment volatility
   - Confidence level based on data volume

**NLP Requirements:**
- Real-time sentiment analysis
- Multi-language support (English priority)
- Spam và bot detection
- Context-aware sentiment scoring

---

#### FR-004: Tokenomics Analysis Service
**Priority:** High  
**Complexity:** Medium  

**Description:** Analyze token economics và financial metrics

**Detailed Requirements:**
1. **Supply Analysis:**
   - Total supply và circulating supply
   - Supply inflation/deflation rate
   - Token burn mechanisms
   - Vesting schedule analysis

2. **Distribution Analysis:**
   - Initial distribution breakdown
   - Team/investor allocations
   - Community distribution fairness
   - Lock-up periods và vesting

3. **DeFi Integration:**
   - Yield farming opportunities
   - Staking rewards và APY
   - Liquidity mining programs
   - Protocol revenue sharing

4. **Financial Metrics:**
   - Market cap và fully diluted valuation
   - Price-to-sales ratio (if applicable)
   - Token velocity
   - Network value metrics

**Data Sources:**
- DeFiLlama for protocol data
- CoinGecko for market data
- On-chain data for supply metrics
- Protocol documentation parsing

---

#### FR-005: Team Verification Service
**Priority:** Medium  
**Complexity:** Medium  

**Description:** Verify team credibility và project legitimacy

**Detailed Requirements:**
1. **Team Member Analysis:**
   - LinkedIn profile verification
   - Professional background assessment
   - Previous project involvement
   - Industry experience evaluation

2. **Development Activity:**
   - GitHub repository analysis
   - Commit frequency và quality
   - Developer count và activity
   - Code quality metrics

3. **Social Presence:**
   - Team member social media presence
   - Community engagement
   - Public speaking và conferences
   - Industry recognition

4. **Credibility Scoring:**
   - Overall team credibility score (0-100)
   - Individual member scores
   - Risk flags identification
   - Verification confidence level

**Verification Methods:**
- GitHub API for development metrics
- LinkedIn API for professional data
- Manual verification for key team members
- Cross-reference với known databases

---

### 3.2 Subscription Management Module

#### FR-006: Subscription Tiers
**Priority:** Critical  
**Complexity:** Medium  

**Description:** Implement tiered subscription model với feature gating

**Tier Specifications:**
| Feature | Free | Pro ($29/mo) | Enterprise ($299/mo) |
|---------|------|--------------|---------------------|
| Daily Queries | 10 | Unlimited | Unlimited |
| Projects Tracked | 5 | 50 | Unlimited |
| Data Refresh Rate | 5 minutes | 1 minute | Real-time |
| Export Features | ❌ | CSV/JSON | CSV/JSON/API |
| API Access | ❌ | ❌ | Full REST API |
| Support Level | Community | Email | Priority + Phone |
| Custom Alerts | ❌ | 5 alerts | Unlimited |
| Team Seats | 1 | 3 | Unlimited |

**Implementation Requirements:**
- Real-time tier validation
- Feature gating middleware
- Usage tracking per tier
- Automatic tier upgrades/downgrades
- Prorated billing calculations

---

#### FR-007: Payment Processing
**Priority:** Critical  
**Complexity:** Medium  

**Description:** Secure payment processing với Stripe integration

**Requirements:**
1. **Payment Methods:**
   - Credit/debit cards
   - PayPal integration
   - Bank transfers (Enterprise)
   - Cryptocurrency payments (future)

2. **Billing Cycles:**
   - Monthly subscriptions
   - Annual subscriptions (20% discount)
   - Usage-based billing (Enterprise)
   - Prorated upgrades/downgrades

3. **Security:**
   - PCI DSS compliance
   - Secure token storage
   - Fraud detection
   - Chargeback handling

4. **Customer Portal:**
   - Subscription management
   - Payment history
   - Invoice downloads
   - Billing address updates

---

### 3.3 Rate Limiting và Usage Control

#### FR-008: Rate Limiting System
**Priority:** Critical  
**Complexity:** Low  

**Description:** Implement tier-based rate limiting to prevent abuse

**Rate Limits:**
| User Tier | Requests/Minute | Daily Limit | Burst Allowance |
|-----------|----------------|-------------|-----------------|
| Free | 10 | 10 queries | 2x for 1 minute |
| Pro | 100 | Unlimited | 5x for 5 minutes |
| Enterprise | 1000 | Unlimited | 10x for 10 minutes |

**Implementation:**
- Redis-based sliding window
- Per-user rate tracking
- Graceful degradation
- Clear error messages
- Rate limit headers in responses

---

#### FR-009: Usage Analytics
**Priority:** High  
**Complexity:** Medium  

**Description:** Track và analyze user behavior for business intelligence

**Metrics to Track:**
1. **User Metrics:**
   - Query frequency và patterns
   - Feature usage statistics
   - Session duration
   - User journey analysis

2. **System Metrics:**
   - Response times per service
   - Error rates và types
   - Cache hit rates
   - External API usage

3. **Business Metrics:**
   - Conversion funnel analysis
   - Feature adoption rates
   - Churn prediction indicators
   - Revenue attribution

**Reporting:**
- Real-time dashboards
- Daily/weekly/monthly reports
- Custom date range analysis
- Export capabilities for stakeholders

---

### 3.4 Integration Requirements

#### FR-010: ChainLens-Automation Integration
**Priority:** Critical  
**Complexity:** Medium  

**Description:** Seamless integration với existing platform

**Requirements:**
1. **Authentication:**
   - Single sign-on với existing users
   - JWT token sharing
   - Session management
   - Permission inheritance

2. **User Experience:**
   - Unified navigation
   - Consistent UI/UX patterns
   - Shared user preferences
   - Cross-platform notifications

3. **Data Sharing:**
   - User profile synchronization
   - Subscription status sharing
   - Usage data aggregation
   - Billing integration

---

#### FR-011: External API Management
**Priority:** High  
**Complexity:** Medium  

**Description:** Robust external API integration với fallback mechanisms

**API Integrations:**
| Service | API | Rate Limit | Fallback |
|---------|-----|------------|----------|
| OnChain | Moralis | 1000/min | DexScreener |
| OnChain | DexScreener | 300/min | CoinGecko |
| Sentiment | Twitter | 300/15min | Reddit only |
| Sentiment | Reddit | 60/min | News only |
| Tokenomics | DeFiLlama | No limit | CoinGecko |
| Team | GitHub | 5000/hour | Manual verification |

**Requirements:**
- Circuit breaker pattern
- Automatic retry với exponential backoff
- API key rotation
- Usage monitoring và alerting
- Graceful degradation

---

### 3.5 Data Management

#### FR-012: Caching Strategy
**Priority:** High  
**Complexity:** Low  

**Description:** Implement intelligent caching for performance optimization

**Cache Layers:**
1. **Application Cache:**
   - Analysis results: 5 minutes TTL
   - User data: 1 hour TTL
   - Configuration: 24 hours TTL

2. **Database Cache:**
   - Query result caching
   - Connection pooling
   - Read replicas for analytics

3. **CDN Cache:**
   - Static assets
   - API documentation
   - Public data endpoints

**Cache Invalidation:**
- TTL-based expiration
- Manual invalidation for critical updates
- Event-driven invalidation (future)

---

#### FR-013: Data Export
**Priority:** Medium  
**Complexity:** Low  

**Description:** Enable data export for Pro và Enterprise users

**Export Formats:**
1. **CSV Export:**
   - Tabular data format
   - Excel compatibility
   - Custom column selection
   - Date range filtering

2. **JSON Export:**
   - Structured data format
   - API-compatible format
   - Nested data preservation
   - Programmatic access

3. **PDF Reports:**
   - Executive summaries
   - Branded templates
   - Charts và visualizations
   - Enterprise tier only

**Requirements:**
- Asynchronous export processing
- Download progress tracking
- Export history và management
- File size limitations (100MB max)

---

## 4. Non-Functional Requirements

### 4.1 Performance Requirements
| Requirement | Target | Measurement |
|-------------|--------|-------------|
| Response Time | <5 seconds | 95th percentile |
| Throughput | 100 req/sec | Sustained load |
| Availability | 99.5% | Monthly uptime |
| Cache Hit Rate | >60% | Redis metrics |

### 4.2 Security Requirements
- JWT-based authentication
- API rate limiting
- Data encryption (AES-256)
- HTTPS enforcement
- Input validation và sanitization
- SQL injection prevention
- XSS protection

### 4.3 Scalability Requirements
- Horizontal scaling capability
- Auto-scaling based on load
- Database sharding support
- CDN integration
- Load balancer compatibility

---

## 5. Constraints và Assumptions

### 5.1 Technical Constraints
- Must integrate với existing ChainLens-Automation
- External API rate limits
- Budget constraints for infrastructure
- Development timeline: 14 days MVP

### 5.2 Business Constraints
- Regulatory compliance requirements
- Data privacy regulations (GDPR)
- Financial data handling restrictions
- Competitive market pressures

### 5.3 Assumptions
- External APIs maintain current availability
- User adoption follows projected growth
- Market demand for crypto analysis continues
- Development team has required expertise

---

## 6. Acceptance Criteria Summary

### 6.1 MVP Launch Criteria
- [ ] All functional requirements implemented
- [ ] Performance targets met
- [ ] Security requirements satisfied
- [ ] Integration testing completed
- [ ] User acceptance testing passed
- [ ] Documentation completed

### 6.2 Success Metrics
- Response time <5 seconds for 95% requests
- System uptime >99% during business hours
- User satisfaction >4.5/5 rating
- Zero critical security vulnerabilities
- Successful payment processing >99.5%

---

**Document Approval:**
- [ ] Business Analyst: ________________
- [ ] Product Manager: ________________
- [ ] Technical Architect: ________________
- [ ] Development Lead: ________________

**Next Steps:**
1. Technical design document creation
2. Database schema design
3. API specification documentation
4. Test plan development
5. Sprint planning và task breakdown
