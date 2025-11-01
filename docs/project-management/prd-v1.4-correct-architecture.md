# ChainLens PRD v1.4 - Correct Architecture Edition
*Phiên bản chính xác với architecture thực tế*

**Version:** 1.4  
**Ngày:** 18/01/2025  
**Tác giả:** Product Manager + Technical Architect  
**Trạng thái:** ✅ Architecture-Verified - Ready for Implementation  
**Timeline:** 14 ngày MVP launch

---

## 🏗️ System Architecture (Corrected)

### Actual Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                             USER                                  │
│                    "Research Uniswap project"                     │
└────────────────────────────┬─────────────────────────────────────┘
                            │ Request
┌────────────────────────────▼─────────────────────────────────────┐
│         ChainLens-Automation Frontend (Port 3000)                │
│              (Formerly ChainLens - Chat Interface)                    │
└────────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/WebSocket
┌────────────────────────────▼─────────────────────────────────────┐
│        ChainLens-Automation Backend (Port 8000)                  │
│                   Python/FastAPI + LiteLLM                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. Receive user message                                  │   │
│  │ 2. Detect if crypto tool needed → Yes!                   │   │
│  │ 3. [NEW] Check user tier & rate limits                   │   │
│  │ 4. Call ChainLens-Core API                               │   │
│  │ 5. Process response with LLM                             │   │
│  │ 6. [NEW] Track usage & analytics                         │   │
│  │ 7. Return formatted response to user                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬─────────────────────────────────────┘
                            │ If crypto query
┌────────────────────────────▼─────────────────────────────────────┐
│            ChainLens-Core (Port 3006) - API Gateway              │
│                      Orchestrator & Cache                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. Receive request with projectId (e.g., "uniswap")      │   │
│  │ 2. Check cache for existing data                         │   │
│  │ 3. If stale/missing → Parallel calls to services         │   │
│  │ 4. Aggregate all responses                               │   │
│  │ 5. Store in cache with TTL                               │   │
│  │ 6. [NEW] Track projectId usage for billing               │   │
│  │ 7. Return comprehensive analysis                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────┬───────────┬───────────┬───────────┬──────────────────────┘
       │           │           │           │ Parallel Orchestration
   ┌───▼────┐  ┌───▼────┐  ┌──▼────┐  ┌───▼───┐
   │OnChain │  │Sentiment│  │Tokens │  │ Team  │
   │ (3001) │  │ (3002)  │  │(3003) │  │(3004) │
   └────────┘  └─────────┘  └───────┘  └───────┘
   Blockchain   Social      Financial   Verification
   Analysis     Monitoring  Metrics     Scoring
```

### Component Responsibilities

| Component | Current Role | MVP Additions |
|-----------|-------------|---------------|
| **ChainLens-Automation Frontend** | Chat UI, User interaction | Payment UI, Usage dashboard |
| **ChainLens-Automation Backend** | LLM orchestration, Tool detection | Stripe integration, Rate limiting, Analytics |
| **ChainLens-Core** | API Gateway, Service orchestration, Caching | Usage tracking, Premium features gating |
| **4 Microservices** | Data analysis (OnChain, Sentiment, Tokenomics, Team) | No changes needed |

---

## 🎯 MVP Business Features (14 Days)

### Week 1: Monetization Infrastructure

#### Days 1-3: Payment Integration
**Location:** ChainLens-Automation Backend (Port 8000)
```python
# New modules to add:
- /services/stripe_service.py      # Stripe checkout & webhooks
- /routes/payment_routes.py        # Payment endpoints
- /middleware/subscription_check.py # Tier validation
```

**Tasks:**
- Stripe account setup
- Checkout flow implementation
- Webhook handlers for subscription events
- Database schema for subscriptions
- Customer portal integration

#### Days 4-5: Rate Limiting & Feature Gating
**Location:** ChainLens-Automation Backend
```python
# New middleware:
- /middleware/rate_limiter.py     # Redis-based rate limiting
- /services/feature_flags.py      # Tier-based features
- /services/usage_tracker.py      # Track API calls
```

**Rate Limits by Tier:**
| Tier | Daily Queries | Advanced Features | API Access |
|------|--------------|-------------------|------------|
| Free | 10 | ❌ | ❌ |
| Pro ($29) | Unlimited | ✅ | ❌ |
| Enterprise ($299) | Unlimited | ✅ | ✅ |

#### Days 6-7: Usage Tracking & Metering
**Location:** Both ChainLens-Automation & ChainLens-Core

**ChainLens-Automation:**
```python
# Track at user level:
- User ID
- Subscription tier
- Request count
- Token usage
```

**ChainLens-Core:**
```javascript
// Track at project level:
- projectId queries
- Cache hits/misses
- Service response times
- Data freshness
```

### Week 2: Growth Features

#### Days 8-9: Daily Alpha Reports
**Location:** ChainLens-Core (has access to all cached project data)

```javascript
// New service in ChainLens-Core:
- /services/report-generator.service.ts
- /controllers/reports.controller.ts
- /jobs/daily-report.cron.ts

// Report will aggregate:
- Top queried projects
- Market movements
- Sentiment changes
- On-chain anomalies
```

**Email Distribution:** Via SendGrid from ChainLens-Automation

#### Days 10-11: Analytics Integration
**Location:** ChainLens-Automation Backend

```python
# Analytics tracking:
- Mixpanel integration
- User journey tracking
- Conversion funnel
- Feature usage metrics
```

#### Days 12-14: Launch Preparation
- Beta user onboarding
- Documentation
- Marketing website update
- Launch campaign

---

## 💰 Pricing & Revenue Model

### Subscription Tiers

| Feature | Free | Pro ($29/mo) | Enterprise ($299/mo) |
|---------|------|--------------|---------------------|
| **Daily Queries** | 10 | Unlimited | Unlimited |
| **Projects Tracked** | 5 | 50 | Unlimited |
| **Data Refresh** | 24 hours | 1 hour | Real-time |
| **Export Features** | ❌ | CSV/JSON | CSV/JSON/API |
| **Daily Alpha Report** | ✅ Summary | ✅ Full | ✅ Custom |
| **Support** | Community | Priority Email | Dedicated |
| **API Access** | ❌ | ❌ | ✅ Full |
| **Custom Alerts** | ❌ | 5 alerts | Unlimited |
| **Team Seats** | 1 | 3 | Unlimited |

### Revenue Projections

```yaml
Week 1:
  Users: 100
  Conversion: 10% Pro + 2% Enterprise
  MRR: $290 + $598 = $888

Month 1:
  Users: 500
  Conversion: 15% Pro + 3% Enterprise
  MRR: $2,175 + $4,485 = $6,660

Month 3:
  Users: 2,000
  Conversion: 20% overall
  MRR: $30,000+
```

---

## 🛠️ Technical Implementation Plan

### Phase 1: Payment Infrastructure (Days 1-3)

```yaml
ChainLens-Automation Backend:
  Database Changes:
    - Add subscriptions table
    - Add payment_history table
    - Add usage_logs table
  
  API Endpoints:
    POST /api/payment/checkout     # Create Stripe session
    POST /api/payment/webhook      # Handle Stripe events
    GET  /api/payment/subscription # Get user subscription
    POST /api/payment/portal       # Customer portal
  
  Services:
    - StripeService: Handle all Stripe operations
    - SubscriptionService: Manage user tiers
    - BillingService: Usage-based billing logic
```

### Phase 2: Rate Limiting (Days 4-5)

```yaml
ChainLens-Automation Backend:
  Middleware:
    - RateLimiter: Check requests against tier limits
    - UsageTracker: Log all API calls
    - TierEnforcer: Block premium features for free users
  
  Redis Keys:
    - rate:daily:{user_id}:{date}
    - rate:hourly:{user_id}:{hour}
    - usage:tokens:{user_id}:{month}
    - tier:{user_id}
```

### Phase 3: Core Integration (Days 6-7)

```yaml
ChainLens-Core Updates:
  New Endpoints:
    GET  /api/usage/project/:projectId  # Get project usage
    POST /api/usage/track               # Track usage event
    GET  /api/reports/generate          # Generate report
  
  Database:
    - project_usage table
    - report_history table
    - alert_configurations table
  
  Services:
    - UsageAggregator: Compile usage statistics
    - ReportGenerator: Create daily/weekly reports
    - AlertManager: Handle custom alerts
```

### Phase 4: Daily Alpha Reports (Days 8-9)

```yaml
Report Generation Flow:
  1. ChainLens-Core:
     - Aggregate top projects from cache
     - Analyze 24h changes
     - Identify alpha opportunities
     - Format as JSON report
  
  2. ChainLens-Automation:
     - Fetch report from Core
     - Format as HTML email
     - Send via SendGrid
     - Track open rates
  
  Schedule:
    - Generate: 8 AM UTC daily
    - Send: 9 AM UTC
    - Free users: Summary only
    - Pro users: Full report
    - Enterprise: Custom schedule
```

### Phase 5: Analytics (Days 10-11)

```yaml
Event Tracking:
  User Events:
    - Signup
    - Login
    - Query submitted
    - Project analyzed
    - Payment initiated
    - Subscription upgraded
    - Report viewed
  
  System Events:
    - Cache hit/miss
    - Service latency
    - Error rates
    - API usage
  
  Business Metrics:
    - DAU/MAU
    - Conversion funnel
    - Churn rate
    - LTV/CAC
    - Feature adoption
```

---

## 🔒 Security & Compliance

### Payment Security
- PCI compliance via Stripe
- No credit card storage
- Webhook signature verification
- SSL/TLS encryption

### Data Protection
- User data isolation
- API key authentication for Enterprise
- Rate limiting for DDoS protection
- GDPR compliance

### Access Control
```yaml
Free Users:
  - Basic queries only
  - No API access
  - Public data only

Pro Users:
  - Advanced analysis
  - Export capabilities
  - Priority queue

Enterprise:
  - Full API access
  - Custom integrations
  - Dedicated resources
  - SLA guarantees
```

---

## 📊 Success Metrics

### Technical KPIs
| Metric | Target | Measurement |
|--------|--------|-------------|
| Response Time | <3s for cached | ChainLens-Core metrics |
| Cache Hit Rate | >60% | Redis monitoring |
| Service Uptime | 99% | Health checks |
| Payment Success | >98% | Stripe webhooks |

### Business KPIs
| Metric | Week 1 | Month 1 | Month 3 |
|--------|--------|---------|---------|
| Total Users | 100 | 500 | 2,000 |
| Paid Conversion | 12% | 18% | 25% |
| MRR | $888 | $6,660 | $30,000 |
| Churn Rate | <5% | <10% | <8% |
| NPS Score | >40 | >50 | >60 |

---

## ⚠️ Risk Mitigation

| Risk | Impact | Mitigation | Owner |
|------|--------|------------|-------|
| ChainLens-Core overload | High | Implement caching, queue system | Backend |
| Service failures | High | Graceful degradation, fallbacks | DevOps |
| Payment failures | Medium | Stripe retry logic, multiple methods | Backend |
| Data inconsistency | Medium | Cache invalidation strategy | Core Team |
| Rate limit bypass | Low | IP-based limiting, fraud detection | Security |

---

## ✅ Launch Checklist

### Week 1 Deliverables
- [ ] Stripe integration live
- [ ] Rate limiting active
- [ ] Usage tracking operational
- [ ] Payment flow tested
- [ ] Subscription management UI

### Week 2 Deliverables
- [ ] Daily reports generating
- [ ] Analytics tracking
- [ ] Beta users onboarded
- [ ] Documentation complete
- [ ] Marketing site updated

### Launch Day Requirements
- [ ] All services health: green
- [ ] Payment system: verified
- [ ] Support team: ready
- [ ] Monitoring: active
- [ ] Rollback plan: documented

---

## 🚀 Post-Launch Roadmap

### Month 2
- Mobile app development
- Advanced analytics dashboard
- Webhook integrations
- Referral program

### Month 3
- AI predictions
- Portfolio tracking
- Automated trading signals
- White-label solution

### Month 6
- Blockchain integration
- DeFi protocols support
- Cross-chain analytics
- Token launch

---

## 📋 Team Responsibilities

| Team | Focus Areas | Key Deliverables |
|------|------------|------------------|
| **ChainLens-Automation** | Payment, Rate limiting, Analytics | Stripe integration, Usage tracking |
| **ChainLens-Core** | Report generation, Usage aggregation | Daily reports, Project metrics |
| **DevOps** | Infrastructure, Monitoring | Uptime, Performance |
| **Product** | User experience, Documentation | Onboarding, Guides |
| **Marketing** | Launch campaign, User acquisition | Beta users, Content |

---

**Document Status:** ✅ **APPROVED - Architecture Verified**

**Confidence Level:** 95% - Clear implementation path

**Next Steps:**
1. Team alignment meeting
2. Stripe account setup
3. Begin Phase 1 implementation
4. Daily standups at 9 AM

---

*PRD Version: 1.4*  
*Architecture: Verified*  
*Timeline: 14 days*  
*Last Updated: 18/01/2025*