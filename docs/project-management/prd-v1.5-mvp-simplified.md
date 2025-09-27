# ChainLens PRD v1.5 - MVP Simplified Edition
*Phiên bản đơn giản hóa cho MVP launch nhanh*

**Version:** 1.5  
**Ngày:** 27/01/2025  
**Tác giả:** Product Manager + Technical Architect  
**Trạng thái:** ✅ MVP-Ready - Simplified for Fast Launch  
**Timeline:** 14 ngày MVP launch với solutions đơn giản
**Target:** 100-1000 users đầu tiên

---

## 🎯 MVP Philosophy

**"Simple solutions that work > Complex solutions that break"**

- ✅ Đủ tốt cho 1000 users đầu tiên
- ✅ 4 hours implementation cho core protections  
- ✅ 0 external dependencies phức tạp
- ✅ Easy debug và maintain
- ✅ Có thể upgrade sau khi có traction

---

## 🏗️ System Architecture (Simplified)

### Current Architecture (Unchanged)
```
┌──────────────────────────────────────────────────────────────────┐
│                             USER                                  │
│                    "Research Uniswap project"                     │
└────────────────────────────┬─────────────────────────────────────┘
                            │ Request
┌────────────────────────────▼─────────────────────────────────────┐
│         ChainLens-Automation Frontend (Port 3000)                │
│              (Formerly Suna - Chat Interface)                    │
└────────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/WebSocket
┌────────────────────────────▼─────────────────────────────────────┐
│        ChainLens-Automation Backend (Port 8000)                  │
│                   Python/FastAPI + LiteLLM                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. Receive user message                                  │   │
│  │ 2. [NEW] Simple rate limiting (10 req/min)               │   │
│  │ 3. Detect if crypto tool needed → Yes!                   │   │
│  │ 4. Check user tier & rate limits                         │   │
│  │ 5. Call ChainLens-Core API                               │   │
│  │ 6. Process response with LLM                             │   │
│  │ 7. [NEW] Simple usage tracking                           │   │
│  │ 8. Return formatted response to user                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬─────────────────────────────────────┘
                            │ If crypto query
┌────────────────────────────▼─────────────────────────────────────┐
│            ChainLens-Core (Port 3006) - API Gateway              │
│                      Orchestrator & Cache                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. [NEW] Simple correlation ID tracking                  │   │
│  │ 2. Receive request with projectId (e.g., "uniswap")      │   │
│  │ 3. Check cache (5min TTL) for existing data              │   │
│  │ 4. If stale/missing → Parallel calls to services         │   │
│  │ 5. [NEW] Log service call durations                      │   │
│  │ 6. Aggregate all responses                               │   │
│  │ 7. Store in cache with 5min TTL                          │   │
│  │ 8. Track projectId usage for billing                     │   │
│  │ 9. Return comprehensive analysis                          │   │
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

### MVP Enhancements (Simple & Effective)

| Component | MVP Addition | Implementation Effort |
|-----------|-------------|----------------------|
| **ChainLens-Automation Backend** | Rate limiting, Simple usage tracking | 2 hours |
| **ChainLens-Core** | Correlation ID logging, 5min cache TTL | 2 hours |
| **Deployment** | Environment variables, Docker Compose | 2 hours |
| **Monitoring** | Structured logging, Health checks | 2 hours |

---

## 🛡️ MVP Technical Solutions

### 1️⃣ Overload Protection → Simple Rate Limiting

**Problem:** ChainLens-Core overload với nhiều requests  
**MVP Solution:** Redis-based rate limiting

```python
# Implementation: 1 hour
class SimpleRateLimit:
    def __init__(self):
        self.redis = redis.Redis()
    
    def check_limit(self, user_id: str, max_requests=10, window=60):
        """10 requests per minute per user"""
        key = f"rate:{user_id}:{int(time.time() // window)}"
        current = self.redis.incr(key)
        self.redis.expire(key, window)
        
        if current > max_requests:
            raise Exception("Rate limit exceeded")
        return True

# Middleware integration
@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    if request.url.path.startswith("/api/"):
        rate_limiter.check_limit(get_user_id(request))
    return await call_next(request)
```

**Benefits:**
- ✅ Ngăn overload hiệu quả
- ✅ 10 dòng code implementation
- ✅ Đủ cho 1000 users đầu tiên

### 2️⃣ Cache Consistency → Simple TTL

**Problem:** Cache cũ vs Database mới  
**MVP Solution:** Short TTL (5 minutes)

```python
# Implementation: 1 hour
class SimpleCache:
    def __init__(self):
        self.redis = redis.Redis()
        self.ttl = 300  # 5 minutes - fresh enough for MVP
    
    def get_or_fetch(self, key: str, fetch_func):
        cached = self.redis.get(key)
        if cached:
            return json.loads(cached)
        
        data = fetch_func()
        self.redis.setex(key, self.ttl, json.dumps(data))
        return data

# Usage
@app.get("/analyze/{project_id}")
async def analyze(project_id: str):
    return cache.get_or_fetch(
        f"analysis:{project_id}",
        lambda: orchestrate_analysis(project_id)
    )
```

**Benefits:**
- ✅ Data fresh trong 5 phút
- ✅ Auto refresh mechanism
- ✅ Đủ cho MVP users

### 3️⃣ Flexible Deployment → Environment Variables

**Problem:** Hardcoded ports không flexible  
**MVP Solution:** Environment variables + Docker Compose

```python
# Implementation: 1 hour
import os

class ServiceConfig:
    ONCHAIN_URL = os.getenv("ONCHAIN_SERVICE_URL", "http://localhost:3001")
    SENTIMENT_URL = os.getenv("SENTIMENT_SERVICE_URL", "http://localhost:3002")
    TOKENOMICS_URL = os.getenv("TOKENOMICS_SERVICE_URL", "http://localhost:3003")
    TEAM_URL = os.getenv("TEAM_SERVICE_URL", "http://localhost:3004")
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  chainlens-core:
    environment:
      - ONCHAIN_SERVICE_URL=http://onchain:3001
      - SENTIMENT_SERVICE_URL=http://sentiment:3002
      - TOKENOMICS_SERVICE_URL=http://tokenomics:3003
      - TEAM_SERVICE_URL=http://team:3004
      - REDIS_URL=redis://redis:6379
```

**Benefits:**
- ✅ Flexible deployment
- ✅ 0 code changes needed
- ✅ Docker-ready

### 4️⃣ Request Tracking → Simple Logging

**Problem:** Khó debug khi có lỗi  
**MVP Solution:** Correlation ID + Structured logging

```python
# Implementation: 1 hour
import uuid
import logging

class SimpleTracker:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    def track_request(self, operation: str, **kwargs):
        correlation_id = str(uuid.uuid4())[:8]
        
        self.logger.info(f"[{correlation_id}] {operation} started", extra={
            "correlation_id": correlation_id,
            "operation": operation,
            **kwargs
        })
        return correlation_id
    
    def track_service_call(self, correlation_id: str, service: str, duration: float):
        self.logger.info(f"[{correlation_id}] {service} completed in {duration:.2f}s")

# Usage
async def analyze_project(project_id: str):
    correlation_id = tracker.track_request("analyze_project", project_id=project_id)
    
    start = time.time()
    onchain_result = await call_onchain_service(project_id)
    tracker.track_service_call(correlation_id, "onchain", time.time() - start)
```

**Benefits:**
- ✅ Easy debugging với grep logs
- ✅ Performance monitoring
- ✅ Request correlation

---

## 💰 Pricing & Revenue Model (Unchanged)

### Subscription Tiers

| Feature | Free | Pro ($29/mo) | Enterprise ($299/mo) |
|---------|------|--------------|---------------------|
| **Daily Queries** | 10 | Unlimited | Unlimited |
| **Projects Tracked** | 5 | 50 | Unlimited |
| **Data Refresh** | 5 minutes | 1 minute | Real-time |
| **Export Features** | ❌ | CSV/JSON | CSV/JSON/API |
| **Daily Alpha Report** | ✅ Summary | ✅ Full | ✅ Custom |
| **Support** | Community | Priority Email | Dedicated |
| **API Access** | ❌ | ❌ | ✅ Full |
| **Custom Alerts** | ❌ | 5 alerts | Unlimited |
| **Team Seats** | 1 | 3 | Unlimited |

---

## 🛠️ MVP Implementation Plan (14 Days)

### Week 1: Core Infrastructure + MVP Protections

#### Days 1-2: MVP Technical Protections (8 hours)
**Location:** ChainLens-Automation Backend + ChainLens-Core

**Day 1 Tasks (4 hours):**
```python
# Hour 1: Rate limiting
- Add SimpleRateLimit class
- Integrate middleware
- Test with Redis

# Hour 2: Simple caching  
- Add SimpleCache class
- Update analyze endpoints
- Test cache TTL

# Hour 3: Environment config
- Replace hardcoded URLs
- Create ServiceConfig
- Test service calls

# Hour 4: Correlation logging
- Add SimpleTracker
- Update all service calls
- Test log correlation
```

**Day 2 Tasks (4 hours):**
```yaml
# Hour 1-2: Docker Compose setup
- Create docker-compose.yml
- Environment variables
- Service networking

# Hour 3: Health checks
- Add /health endpoints
- Service status monitoring
- Basic alerting

# Hour 4: Testing & validation
- End-to-end testing
- Performance validation
- Error handling
```

#### Days 3-5: Payment Integration (Unchanged from v1.4)
- Stripe account setup
- Checkout flow implementation  
- Webhook handlers
- Database schema
- Customer portal

#### Days 6-7: Rate Limiting & Feature Gating (Enhanced)
```python
# Enhanced with MVP protections
- Tier-based rate limiting
- Feature flags with simple checks
- Usage tracking with correlation IDs
- Redis-based session management
```

### Week 2: Growth Features (Unchanged from v1.4)

#### Days 8-9: Daily Alpha Reports
#### Days 10-11: Analytics Integration  
#### Days 12-14: Launch Preparation

---

## 📊 MVP vs Enterprise Comparison

| Feature | MVP Solution | Enterprise Solution | MVP Effort | Enterprise Effort |
|---------|-------------|-------------------|------------|------------------|
| **Overload Protection** | Rate limiting (10 req/min) | Queue + Circuit Breaker | 1 hour | 2 weeks |
| **Cache Consistency** | 5min TTL | Event-driven invalidation | 1 hour | 1 week |
| **Service Discovery** | Environment variables | Consul/Istio service mesh | 1 hour | 1 week |
| **Request Tracing** | Correlation ID logs | OpenTelemetry + Jaeger | 1 hour | 1 week |
| **Monitoring** | Structured logs | Prometheus + Grafana | 1 hour | 1 week |
| **Total** | **Works for MVP** | **Enterprise grade** | **5 hours** | **6 weeks** |

---

## ⚠️ MVP Limitations & Upgrade Path

### Current MVP Limitations
| Limitation | Impact | Upgrade Trigger |
|------------|--------|-----------------|
| 5min cache TTL | Slightly stale data | >1000 active users |
| Simple rate limiting | Basic protection | >100 req/sec |
| Environment config | Manual scaling | >10 service instances |
| Log-based tracing | Manual debugging | >5 services |

### Upgrade Path
```yaml
Phase 1 (MVP): Simple solutions → Launch ready
Phase 2 (Growth): Enhanced caching → 10K users  
Phase 3 (Scale): Service mesh → 100K users
Phase 4 (Enterprise): Full observability → Enterprise clients
```

---

## ✅ MVP Launch Checklist

### Technical Readiness
- [ ] Rate limiting active (10 req/min per user)
- [ ] Cache working (5min TTL)
- [ ] Environment variables configured
- [ ] Correlation logging implemented
- [ ] Docker Compose tested
- [ ] Health checks responding
- [ ] Error handling validated

### Business Readiness  
- [ ] Stripe integration live
- [ ] Payment flow tested
- [ ] Subscription tiers configured
- [ ] Usage tracking operational
- [ ] Daily reports generating
- [ ] Analytics tracking
- [ ] Beta users onboarded

### Launch Day Requirements
- [ ] All services health: green
- [ ] Rate limiting: protecting core
- [ ] Cache hit rate: >50%
- [ ] Payment system: verified
- [ ] Logs: structured and searchable
- [ ] Support team: ready
- [ ] Rollback plan: documented

---

## 🚀 Success Metrics (MVP)

### Technical KPIs
| Metric | MVP Target | Measurement |
|--------|------------|-------------|
| Response Time | <5s (cached) | Simple logging |
| Cache Hit Rate | >50% | Redis metrics |
| Service Uptime | 95% | Health checks |
| Rate Limit Effectiveness | 0 overloads | Error monitoring |

### Business KPIs  
| Metric | Week 1 | Month 1 | Month 3 |
|--------|--------|---------|---------|
| Total Users | 50 | 200 | 1,000 |
| Paid Conversion | 10% | 15% | 20% |
| MRR | $400 | $2,000 | $10,000 |
| System Stability | 95% | 97% | 99% |

---

**Document Status:** ✅ **APPROVED - MVP Simplified**

**Confidence Level:** 98% - Simple, proven solutions  

**Next Steps:**
1. Implement MVP protections (Day 1-2)
2. Continue with payment integration (Day 3-5)
3. Launch with confidence (Day 14)

---

*PRD Version: 1.5*  
*Focus: MVP Simplified*  
*Timeline: 14 days*  
*Last Updated: 27/01/2025*
