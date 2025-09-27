# ChainLens Crypto Services

This directory contains the 5 microservices that provide cryptocurrency analysis capabilities for ChainLens-Automation.

## Services Overview

### ChainLens-Core (Port 3006)
**API Gateway & Orchestrator**
- Central entry point for all crypto analysis requests
- Authentication and authorization using Supabase JWT
- Rate limiting based on user tiers (Free/Pro/Enterprise)
- Orchestration of parallel microservice calls
- Response aggregation and caching
- Integration with ChainLens-Automation backend

### OnChain Analysis Service (Port 3001)
**Blockchain Data Analysis**
- Token price, volume, and liquidity analysis
- Holder distribution and transaction pattern analysis
- Risk assessment algorithms
- Multi-chain support (Ethereum, BSC, Polygon, etc.)
- External APIs: Moralis, DexScreener, DeFiLlama, CoinGecko

### Sentiment Analysis Service (Port 3002)
**Social Media & News Sentiment**
- Social media sentiment analysis
- News article sentiment processing
- Influencer mention tracking
- Trend analysis and risk flag detection
- External APIs: Twitter, Reddit, News API

### Tokenomics Analysis Service (Port 3003)
**Token Economics Analysis**
- Token economics analysis
- Vesting schedule evaluation
- Distribution fairness assessment
- DeFi yield and staking analysis
- External APIs: DeFiLlama, CoinGecko

### Team Verification Service (Port 3004)
**Team Credibility Assessment**
- Team member verification and credibility assessment
- Project history analysis
- Social media presence verification
- Professional background validation
- External APIs: GitHub, LinkedIn

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ChainLens-Automation                     │
│                   (Existing System)                         │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │    Frontend     │    │         Backend                 │ │
│  │   Next.js       │────│        FastAPI                  │ │
│  │   Port 3000     │    │        Port 8000                │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────┘
                                  │ Crypto Query Detection
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   ChainLens-Core                            │
│              API Gateway & Orchestrator                     │
│                    Port 3006                                │
└─────────────────┬───────────────────────────────────────────┘
                  │ Parallel Orchestration
        ┌─────────┼─────────┬─────────┬─────────┐
        ▼         ▼         ▼         ▼         ▼
┌─────────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│   OnChain   │ │Sentiment│ │Tokenomic│ │  Team   │
│  Analysis   │ │Analysis │ │Analysis │ │Verificat│
│  Port 3001  │ │Port 3002│ │Port 3003│ │Port 3004│
└─────────────┘ └─────────┘ ┌─────────┘ └─────────┘
```

## Technology Stack

- **Framework:** NestJS + TypeScript
- **Database:** PostgreSQL (Hybrid strategy)
  - Supabase PostgreSQL: Shared by ChainLens-Automation + ChainLens-Core
  - Dedicated PostgreSQL: Microservices with separate schemas
- **Caching:** Redis
- **Container:** Docker + Kubernetes
- **CI/CD:** GitHub Actions
- **Monitoring:** Prometheus + Grafana

## Development Setup

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Quick Start
```bash
# Clone repository
git clone <repository-url>
cd services

# Install dependencies for all services
npm run install:all

# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# Run all services in development mode
npm run dev:all
```

### Individual Service Development
```bash
# ChainLens-Core
cd chainlens-core
npm install
npm run start:dev

# OnChain Analysis Service
cd onchain-analysis
npm install
npm run start:dev

# Sentiment Analysis Service
cd sentiment-analysis
npm install
npm run start:dev

# Tokenomics Analysis Service
cd tokenomics-analysis
npm install
npm run start:dev

# Team Verification Service
cd team-verification
npm install
npm run start:dev
```

## Testing

### Unit Tests
```bash
# Run tests for all services
npm run test:all

# Run tests for specific service
cd chainlens-core
npm run test
npm run test:cov
```

### Integration Tests
```bash
# Run integration tests
npm run test:e2e:all

# Run specific service integration tests
cd chainlens-core
npm run test:e2e
```

### Load Testing
```bash
# Run load tests with Artillery
npm run test:load

# Run stress tests with K6
npm run test:stress
```

## Deployment

### Development Environment
```bash
# Start all services with Docker Compose
docker-compose -f docker-compose.dev.yml up -d

# Check service health
curl http://localhost:3006/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
```

### Production Deployment
```bash
# Deploy to Kubernetes
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n chainlens-crypto
kubectl get services -n chainlens-crypto
```

## API Documentation

### ChainLens-Core API
- **Base URL:** `http://localhost:3006` (dev) / `https://api-crypto.chainlens.com` (prod)
- **Swagger UI:** `http://localhost:3006/api/docs`
- **OpenAPI Spec:** `http://localhost:3006/api/docs-json`

### Microservice APIs
- **OnChain Analysis:** `http://localhost:3001/api/docs`
- **Sentiment Analysis:** `http://localhost:3002/api/docs`
- **Tokenomics Analysis:** `http://localhost:3003/api/docs`
- **Team Verification:** `http://localhost:3004/api/docs`

## Environment Variables

### Required Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/chainlens_microservices
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret

# Redis
REDIS_URL=redis://localhost:6379

# External APIs
MORALIS_API_KEY=your-moralis-key
COINGECKO_API_KEY=your-coingecko-key
TWITTER_BEARER_TOKEN=your-twitter-token
NEWS_API_KEY=your-news-api-key
GITHUB_TOKEN=your-github-token

# Service Configuration
NODE_ENV=development
LOG_LEVEL=debug
```

## Monitoring & Observability

### Health Checks
All services expose health check endpoints at `/health`:
```bash
curl http://localhost:3006/health
```

### Metrics
Prometheus metrics available at `/metrics`:
```bash
curl http://localhost:3006/metrics
```

### Logs
Structured JSON logs with correlation IDs:
```bash
# View logs for specific service
docker logs chainlens-core
docker logs onchain-analysis
```

## Contributing

### Development Workflow
1. Create feature branch from `main`
2. Implement changes with tests
3. Run full test suite
4. Create pull request
5. Code review and approval
6. Merge to `main`
7. Automatic deployment to staging
8. Manual promotion to production

### Code Standards
- TypeScript strict mode
- ESLint + Prettier formatting
- 80%+ test coverage required
- API documentation required
- Security scan passing

## Support

### Documentation
- [Architecture Document](../docs/architecture/chainlens-crypto-services-architecture.md)
- [API Documentation](http://localhost:3006/api/docs)
- [Deployment Guide](../docs/deployment/README.md)

### Troubleshooting
- [Common Issues](../docs/troubleshooting/README.md)
- [Performance Tuning](../docs/performance/README.md)
- [Security Guidelines](../docs/security/README.md)

### Contact
- **Development Team:** dev-team@chainlens.com
- **DevOps Team:** devops@chainlens.com
- **Support:** support@chainlens.com
