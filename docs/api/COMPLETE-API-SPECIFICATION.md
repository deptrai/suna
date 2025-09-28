# ChainLens Crypto Services - Complete API Specification

## 📋 Overview
Comprehensive API documentation for all ChainLens microservices including implemented and planned endpoints.

## 🏗️ Service Architecture

### Service Ports & URLs
- **ChainLens-Core Gateway:** `http://localhost:3000` (API Gateway & Orchestration)
- **OnChain Analysis Service:** `http://localhost:3001` (Blockchain Data Analysis)
- **Tokenomics Analysis Service:** `http://localhost:3002` (Token Economics - PLANNED)
- **Portfolio Management Service:** `http://localhost:3003` (Portfolio Tracking - PLANNED)
- **Alert & Notification Service:** `http://localhost:3004` (Alerts & Notifications - PLANNED)

---

## 🔗 1. ChainLens-Core Gateway (Port 3000) ✅ IMPLEMENTED

### Health & System APIs
```http
GET  /api/v1/health                    # Basic health check
GET  /api/v1/health/detailed           # Detailed health with dependencies
GET  /api/v1/health/ready              # Readiness probe
GET  /api/v1/health/live               # Liveness probe
GET  /api/v1/version                   # Service version info
GET  /api/v1/metrics                   # Prometheus metrics
GET  /api/v1/metrics/json              # JSON formatted metrics
```

### Orchestration APIs
```http
POST /api/v1/orchestration/analyze     # Orchestrate multi-service analysis
GET  /api/v1/orchestration/status/:id  # Get orchestration status
GET  /api/v1/orchestration/history     # Get orchestration history
POST /api/v1/orchestration/cancel/:id  # Cancel running orchestration
```

### Queue Management APIs
```http
GET  /api/v1/queue/status              # Queue status and metrics
GET  /api/v1/queue/jobs                # List active jobs
POST /api/v1/queue/jobs/:id/retry      # Retry failed job
POST /api/v1/queue/jobs/:id/cancel     # Cancel job
GET  /api/v1/queue/metrics             # Queue performance metrics
```

### Cache Management APIs
```http
GET    /api/v1/cache/stats             # Cache statistics
DELETE /api/v1/cache/clear             # Clear all cache
DELETE /api/v1/cache/clear/:key        # Clear specific cache key
GET    /api/v1/cache/keys              # List cache keys
```

---

## 📊 2. OnChain Analysis Service (Port 3001) ✅ IMPLEMENTED

### Health & System APIs
```http
GET  /api/v1/health                    # Basic health check
GET  /api/v1/health/detailed           # Detailed health with dependencies
GET  /api/v1/health/ready              # Readiness probe
GET  /api/v1/health/live               # Liveness probe
GET  /api/v1/metrics                   # Prometheus metrics
GET  /api/v1/metrics/json              # JSON formatted metrics
```

### Token Analysis APIs ✅ IMPLEMENTED
```http
POST /api/v1/onchain/analyze           # Comprehensive token analysis
GET  /api/v1/onchain/status/:projectId # Get analysis status
GET  /api/v1/onchain/history/:projectId # Get analysis history
```

### Transaction Analysis APIs ✅ IMPLEMENTED
```http
POST /api/v1/onchain/transactions/analyze # Analyze transaction patterns
```

### Risk Assessment APIs ✅ IMPLEMENTED
```http
POST /api/v1/onchain/risk/assess       # Comprehensive risk assessment
```

### DexScreener Integration APIs ✅ IMPLEMENTED
```http
POST /api/v1/onchain/dex/pairs         # Get token pairs from DEX
POST /api/v1/onchain/dex/pair/analyze  # Analyze specific DEX pair
POST /api/v1/onchain/dex/liquidity/analyze # Liquidity analysis
```

### Cross-Chain Analysis APIs 🔄 PLANNED (T2.1.5)
```http
POST /api/v1/onchain/cross-chain/compare    # Compare token across chains
POST /api/v1/onchain/cross-chain/arbitrage  # Find arbitrage opportunities
POST /api/v1/onchain/cross-chain/bridges    # Analyze bridge liquidity
```

### Yield Farming APIs 🔄 PLANNED (T2.1.6)
```http
POST /api/v1/onchain/yield/pools       # Get yield farming pools
POST /api/v1/onchain/yield/analyze     # Analyze yield opportunities
POST /api/v1/onchain/yield/compare     # Compare yield strategies
```

---

## 💰 3. Tokenomics Analysis Service (Port 3002) 🔄 PLANNED

### Token Metrics APIs
```http
POST /api/v1/tokenomics/metrics/analyze     # Comprehensive tokenomics analysis
GET  /api/v1/tokenomics/metrics/:token      # Get cached token metrics
POST /api/v1/tokenomics/metrics/compare     # Compare multiple tokens
```

### Holder Distribution APIs
```http
POST /api/v1/tokenomics/holders/distribution # Analyze holder distribution
POST /api/v1/tokenomics/holders/whale-watch # Whale movement tracking
POST /api/v1/tokenomics/holders/concentration # Holder concentration analysis
```

### Price Prediction APIs
```http
POST /api/v1/tokenomics/prediction/price    # Price prediction models
POST /api/v1/tokenomics/prediction/volume   # Volume prediction
POST /api/v1/tokenomics/prediction/trends   # Market trend analysis
```

### Market Sentiment APIs
```http
POST /api/v1/tokenomics/sentiment/analyze   # Sentiment analysis
GET  /api/v1/tokenomics/sentiment/social    # Social media sentiment
POST /api/v1/tokenomics/sentiment/news      # News sentiment analysis
```

---

## 📈 4. Portfolio Management Service (Port 3003) 🔄 PLANNED

### Portfolio Tracking APIs
```http
POST /api/v1/portfolio/create              # Create new portfolio
GET  /api/v1/portfolio/:id                 # Get portfolio details
PUT  /api/v1/portfolio/:id                 # Update portfolio
DELETE /api/v1/portfolio/:id               # Delete portfolio
GET  /api/v1/portfolio/user/:userId        # Get user portfolios
```

### Holdings Management APIs
```http
POST /api/v1/portfolio/:id/holdings        # Add holdings
PUT  /api/v1/portfolio/:id/holdings/:holdingId # Update holding
DELETE /api/v1/portfolio/:id/holdings/:holdingId # Remove holding
GET  /api/v1/portfolio/:id/holdings        # Get all holdings
```

### Performance Analytics APIs
```http
GET  /api/v1/portfolio/:id/performance     # Portfolio performance metrics
GET  /api/v1/portfolio/:id/analytics       # Detailed analytics
GET  /api/v1/portfolio/:id/risk            # Portfolio risk analysis
GET  /api/v1/portfolio/:id/diversification # Diversification analysis
```

### Rebalancing APIs
```http
POST /api/v1/portfolio/:id/rebalance/analyze # Analyze rebalancing needs
POST /api/v1/portfolio/:id/rebalance/suggest # Suggest rebalancing strategy
POST /api/v1/portfolio/:id/rebalance/execute # Execute rebalancing
```

---

## 🔔 5. Alert & Notification Service (Port 3004) 🔄 PLANNED

### Alert Management APIs
```http
POST /api/v1/alerts/create                 # Create new alert
GET  /api/v1/alerts/user/:userId           # Get user alerts
PUT  /api/v1/alerts/:id                    # Update alert
DELETE /api/v1/alerts/:id                  # Delete alert
POST /api/v1/alerts/:id/test               # Test alert
```

### Alert Types APIs
```http
POST /api/v1/alerts/price                  # Price-based alerts
POST /api/v1/alerts/volume                 # Volume-based alerts
POST /api/v1/alerts/portfolio              # Portfolio-based alerts
POST /api/v1/alerts/risk                   # Risk-based alerts
POST /api/v1/alerts/news                   # News-based alerts
```

### Notification Delivery APIs
```http
POST /api/v1/notifications/send            # Send notification
GET  /api/v1/notifications/history/:userId # Notification history
POST /api/v1/notifications/preferences     # Update preferences
GET  /api/v1/notifications/templates       # Get notification templates
```

### Webhook APIs
```http
POST /api/v1/webhooks/register             # Register webhook
GET  /api/v1/webhooks/user/:userId         # Get user webhooks
PUT  /api/v1/webhooks/:id                  # Update webhook
DELETE /api/v1/webhooks/:id                # Delete webhook
POST /api/v1/webhooks/:id/test             # Test webhook
```

---

## 🔐 Authentication & Authorization (Cross-Service)

### Auth APIs (Planned for all services)
```http
POST /api/v1/auth/login                    # User login
POST /api/v1/auth/logout                   # User logout
POST /api/v1/auth/refresh                  # Refresh token
POST /api/v1/auth/register                 # User registration
GET  /api/v1/auth/profile                  # Get user profile
PUT  /api/v1/auth/profile                  # Update user profile
```

### API Key Management
```http
POST /api/v1/auth/api-keys                 # Create API key
GET  /api/v1/auth/api-keys                 # List API keys
PUT  /api/v1/auth/api-keys/:id             # Update API key
DELETE /api/v1/auth/api-keys/:id           # Delete API key
```

---

## 📊 Implementation Status Summary

### ✅ COMPLETED (10h/10.5h = 95%)
- **ChainLens-Core Gateway:** Full orchestration, queue management, caching
- **OnChain Analysis Service:** Token analysis, risk assessment, DexScreener integration

### 🔄 IN PROGRESS
- **T2.1.5:** Cross-chain Analysis (2.5h) - NEXT
- **T2.1.6:** Performance Optimization (30min) - FINAL

### 🔄 PLANNED (Future Epics)
- **Epic 4:** Tokenomics Analysis Service (8h)
- **Epic 5:** Portfolio Management Service (12h)
- **Epic 6:** Alert & Notification Service (6h)

---

## 🎯 API Design Principles

### Consistency
- RESTful design patterns
- Consistent error responses
- Standardized pagination
- Uniform authentication

### Performance
- Response caching strategies
- Rate limiting implementation
- Async processing for heavy operations
- Optimized database queries

### Security
- JWT-based authentication
- API key management
- Input validation
- Rate limiting protection

### Monitoring
- Prometheus metrics on all endpoints
- Structured logging
- Health checks
- Performance tracking

---

**Total API Endpoints:** 100+ across all services  
**Current Implementation:** 25+ endpoints (25% complete)  
**Next Priority:** Complete Epic 2 (OnChain Analysis Service)
