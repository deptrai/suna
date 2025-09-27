# ChainLens Crypto Services - Source Tree Structure

## BMAD Method Source Organization

This document defines the complete source tree structure for ChainLens Crypto Services following BMAD (Business Model Architecture Development) methodology.

## 1. Root Directory Structure

```
chainlens-crypto-services/
├── .bmad-core/                    # BMAD framework configuration
│   ├── agents/                    # AI agent definitions
│   ├── checklists/               # Quality assurance checklists
│   ├── tasks/                    # Development task templates
│   └── core-config.yaml         # BMAD core configuration
├── .github/                      # GitHub workflows and templates
│   ├── workflows/                # CI/CD pipeline definitions
│   └── ISSUE_TEMPLATE/          # Issue templates
├── docs/                         # Project documentation
│   ├── architecture/            # Architecture documentation
│   ├── business-analysis/       # Business analysis documents
│   ├── deployment/              # Deployment guides
│   ├── integration/             # Integration documentation
│   ├── project-management/      # Project management artifacts
│   └── stories/                 # Development stories (BMAD)
├── database/                     # Database schemas and migrations
│   ├── migrations/              # Database migration scripts
│   └── schemas/                 # Database schema definitions
├── services/                     # Microservices implementation
│   ├── chainlens-core/          # API Gateway & Orchestrator
│   ├── onchain-analysis/        # OnChain Analysis Service
│   ├── sentiment-analysis/      # Sentiment Analysis Service
│   ├── tokenomics-analysis/     # Tokenomics Analysis Service
│   ├── team-verification/       # Team Verification Service
│   ├── scripts/                 # Development scripts
│   ├── k8s/                     # Kubernetes configurations
│   └── monitoring/              # Monitoring configurations
├── .gitignore                    # Git ignore rules
├── README.md                     # Project overview
└── package.json                  # Root package configuration
```

## 2. ChainLens-Core Service Structure

```
services/chainlens-core/
├── src/                          # Source code
│   ├── main.ts                   # Application entry point
│   ├── app.module.ts            # Root application module
│   ├── analysis/                # Analysis orchestration
│   │   ├── analysis.module.ts
│   │   ├── analysis.controller.ts
│   │   ├── analysis.service.ts
│   │   ├── analysis.processor.ts
│   │   └── dto/                 # Data Transfer Objects
│   │       ├── analysis-request.dto.ts
│   │       └── analysis-response.dto.ts
│   ├── auth/                    # Authentication & Authorization
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── constants/           # Authentication constants
│   │   │   └── jwt.constants.ts
│   │   ├── controllers/         # Additional auth controllers
│   │   │   ├── auth-test.controller.ts
│   │   │   └── user.controller.ts
│   │   ├── decorators/          # Custom decorators
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── public.decorator.ts
│   │   │   ├── roles.decorator.ts
│   │   │   └── permissions.decorator.ts
│   │   ├── guards/              # Authentication guards
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── api-key-auth.guard.ts
│   │   │   └── roles.guard.ts
│   │   ├── services/            # Authentication services
│   │   │   ├── supabase.service.ts
│   │   │   └── user.service.ts
│   │   └── strategies/          # Passport strategies
│   │       ├── jwt.strategy.ts
│   │       └── api-key.strategy.ts
│   ├── cache/                   # Caching module
│   │   ├── cache.module.ts
│   │   └── cache.service.ts
│   ├── common/                  # Shared utilities
│   │   ├── filters/             # Exception filters
│   │   │   └── all-exceptions.filter.ts
│   │   ├── interceptors/        # Request/response interceptors
│   │   │   ├── logging.interceptor.ts
│   │   │   └── response.interceptor.ts
│   │   ├── middleware/          # Custom middleware
│   │   │   └── correlation-id.middleware.ts
│   │   └── services/            # Shared services
│   │       └── logger.service.ts
│   ├── config/                  # Configuration modules
│   │   ├── auth.config.ts
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   ├── services.config.ts
│   │   └── supabase.config.ts
│   ├── database/                # Database configuration
│   │   └── database.module.ts
│   ├── health/                  # Health check module
│   │   ├── health.module.ts
│   │   ├── health.controller.ts
│   │   └── health.service.ts
│   ├── metrics/                 # Metrics and monitoring
│   │   ├── metrics.module.ts
│   │   ├── metrics.controller.ts
│   │   └── metrics.service.ts
│   ├── orchestration/           # Service orchestration
│   │   ├── orchestration.module.ts
│   │   ├── orchestration.service.ts
│   │   ├── circuit-breaker.service.ts
│   │   └── service-client.service.ts
│   └── simple-health/           # Simple health checks
│       ├── simple-health.module.ts
│       └── simple-health.controller.ts
├── test/                        # Test files
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   └── e2e/                     # End-to-end tests
├── dist/                        # Compiled output
├── logs/                        # Application logs
├── .env                         # Environment variables
├── .env.example                 # Environment template
├── Dockerfile                   # Production Docker image
├── Dockerfile.dev               # Development Docker image
├── nest-cli.json               # NestJS CLI configuration
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── tsconfig.build.json         # Build TypeScript configuration
```

## 3. Microservice Structure Template

```
services/[service-name]/
├── src/                         # Source code
│   ├── main.ts                  # Service entry point
│   ├── app.module.ts           # Root module
│   ├── [feature]/              # Feature modules
│   │   ├── [feature].module.ts
│   │   ├── [feature].controller.ts
│   │   ├── [feature].service.ts
│   │   └── dto/                # Data Transfer Objects
│   ├── common/                 # Shared utilities
│   │   ├── filters/
│   │   ├── interceptors/
│   │   └── services/
│   ├── config/                 # Configuration
│   ├── database/               # Database entities
│   │   ├── entities/
│   │   └── migrations/
│   └── health/                 # Health checks
├── test/                       # Test files
├── Dockerfile                  # Docker configuration
├── package.json               # Dependencies
└── tsconfig.json              # TypeScript config
```

## 4. Documentation Structure

```
docs/
├── architecture/               # Technical architecture
│   ├── chainlens-crypto-services-architecture.md
│   ├── api-design-specification.md
│   ├── database-design-schema.md
│   ├── security-architecture-guide.md
│   ├── performance-scalability-guide.md
│   ├── technical-architecture-document.md
│   ├── coding-standards.md     # BMAD coding standards
│   ├── tech-stack.md          # Technology stack
│   └── source-tree.md         # This document
├── business-analysis/          # Business analysis documents
│   ├── business-requirements-document.md
│   ├── functional-requirements-specification.md
│   ├── business-process-flows.md
│   ├── risk-assessment-mitigation.md
│   └── success-metrics-kpi-dashboard.md
├── deployment/                 # Deployment documentation
│   ├── production-deployment-guide.md
│   ├── development-setup.md
│   └── kubernetes-deployment.md
├── integration/                # Integration guides
│   ├── chainlens-automation-integration.md
│   ├── external-api-integration.md
│   └── webhook-integration.md
├── project-management/         # Project management
│   ├── prd-v1.5-mvp-simplified.md
│   ├── product-backlog-improved-detailed.md
│   ├── sprint-planning-guide.md
│   └── task-tracking-template.md
└── stories/                    # BMAD development stories
    ├── story-001-api-gateway.md
    ├── story-002-auth-system.md
    └── [additional-stories].md
```

## 5. Configuration Files Structure

```
services/chainlens-core/
├── .env                        # Environment variables
├── .env.example               # Environment template
├── .eslintrc.js              # ESLint configuration
├── .prettierrc               # Prettier configuration
├── .gitignore                # Git ignore rules
├── jest.config.js            # Jest test configuration
├── nest-cli.json             # NestJS CLI configuration
├── package.json              # NPM configuration
├── tsconfig.json             # TypeScript configuration
└── tsconfig.build.json       # Build configuration
```

## 6. Kubernetes Configuration Structure

```
services/k8s/
├── namespace.yaml              # Kubernetes namespace
├── secrets-template.yaml      # Secrets template
├── chainlens-core-deployment.yaml
├── onchain-analysis-deployment.yaml
├── sentiment-analysis-deployment.yaml
├── tokenomics-analysis-deployment.yaml
├── team-verification-deployment.yaml
├── database-deployment.yaml
└── microservices-deployment.yaml
```

## 7. Database Structure

```
database/
├── migrations/                 # Database migrations
│   ├── 001_create_chainlens_core_schema.sql
│   ├── 002_create_analysis_tables.sql
│   └── [additional-migrations].sql
└── schemas/                   # Schema definitions
    ├── chainlens-core-schema.sql
    ├── onchain-analysis-schema.sql
    ├── sentiment-analysis-schema.sql
    ├── tokenomics-analysis-schema.sql
    └── team-verification-schema.sql
```

## 8. Scripts Structure

```
services/scripts/
├── setup-dev.sh              # Development environment setup
├── build-all.sh              # Build all services
├── deploy-staging.sh         # Staging deployment
├── deploy-production.sh      # Production deployment
├── run-tests.sh              # Test execution
└── cleanup.sh                # Environment cleanup
```

## 9. Monitoring Structure

```
services/monitoring/
├── prometheus.yml             # Prometheus configuration
├── grafana/                   # Grafana dashboards
│   ├── dashboards/
│   └── provisioning/
└── alerting/                  # Alert rules
    ├── rules.yml
    └── notifications.yml
```

## 10. BMAD Framework Structure

```
.bmad-core/
├── agents/                    # AI agent definitions
│   ├── dev.md                # Development agent
│   ├── qa.md                 # Quality assurance agent
│   └── pm.md                 # Project management agent
├── checklists/               # Quality checklists
│   ├── story-dod-checklist.md
│   ├── code-review-checklist.md
│   └── deployment-checklist.md
├── tasks/                    # Development tasks
│   ├── apply-qa-fixes.md
│   ├── execute-checklist.md
│   └── validate-next-story.md
└── core-config.yaml          # BMAD configuration
```

## 11. File Naming Conventions

### 11.1 TypeScript Files
- **Modules**: `[feature].module.ts`
- **Controllers**: `[feature].controller.ts`
- **Services**: `[feature].service.ts`
- **DTOs**: `[name].dto.ts`
- **Entities**: `[name].entity.ts`
- **Guards**: `[name].guard.ts`
- **Decorators**: `[name].decorator.ts`
- **Strategies**: `[name].strategy.ts`

### 11.2 Test Files
- **Unit tests**: `[feature].service.spec.ts`
- **Integration tests**: `[feature].integration.spec.ts`
- **E2E tests**: `[feature].e2e-spec.ts`

### 11.3 Configuration Files
- **Environment**: `.env`, `.env.example`
- **Docker**: `Dockerfile`, `Dockerfile.dev`
- **Kubernetes**: `[service]-deployment.yaml`

## 12. Import Organization

```typescript
// ✅ CORRECT: Import order
// 1. Node.js built-in modules
import { readFileSync } from 'fs';

// 2. External libraries
import { Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// 3. Internal modules (absolute paths)
import { LoggerService } from '../common/services/logger.service';
import { UserService } from './services/user.service';

// 4. Relative imports
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
```

## 13. Code Organization Principles

### 13.1 Single Responsibility
- Each file has a single, well-defined purpose
- Classes and functions have focused responsibilities
- Modules group related functionality

### 13.2 Dependency Direction
- Dependencies flow inward (toward business logic)
- External dependencies are abstracted
- Configuration is injected, not imported

### 13.3 Layered Architecture
- **Presentation Layer**: Controllers and DTOs
- **Business Logic Layer**: Services and domain logic
- **Data Access Layer**: Repositories and entities
- **Infrastructure Layer**: External integrations

---

**BMAD Method Compliance**: This source tree structure ensures maintainable, scalable, and well-organized code following Business Model Architecture Development methodology with clear separation of concerns and enterprise-grade organization.
