# 🏗️ System Architecture Diagrams

*Visual representation of the Suna AI Agent Platform architecture*

---

## 🎯 Overview

This document contains comprehensive architectural diagrams for the Suna AI Agent Platform, rendered using Mermaid syntax for GitHub compatibility and interactive documentation.

---

## 🏢 High-Level System Architecture

```mermaid
graph TB
    %% User Layer
    User[👤 Users]
    Browser[🌐 Web Browser]
    Mobile[📱 Mobile App]
    API[🔌 API Clients]
    
    %% Frontend Layer
    Frontend[🖥️ Frontend<br/>Next.js 15<br/>Port 3000]
    
    %% API Gateway
    Gateway[🚪 API Gateway<br/>FastAPI<br/>Port 8000]
    
    %% Core Services
    Auth[🔐 Authentication<br/>Supabase Auth]
    AgentMgr[🤖 Agent Manager<br/>Python Service]
    SessionMgr[💬 Session Manager<br/>WebSocket Handler]
    
    %% Microservices
    OnChain[⛓️ OnChain Service<br/>NestJS<br/>Port 3001]
    Sentiment[😊 Sentiment Service<br/>NestJS<br/>Port 3002]
    Tokenomics[💰 Tokenomics Service<br/>NestJS<br/>Port 3003]
    Team[👥 Team Service<br/>NestJS<br/>Port 3004]
    ChainLens[🔗 ChainLens Core<br/>Standalone<br/>Port 3006]
    
    %% Data Layer
    Database[(🗄️ Supabase<br/>PostgreSQL<br/>Port 5432)]
    Cache[(⚡ Redis<br/>Cache & Queue<br/>Port 6379)]
    
    %% External Services
    LLM[🧠 LLM Providers<br/>OpenAI, Anthropic<br/>OpenRouter]
    Tools[🛠️ External Tools<br/>Tavily, Firecrawl<br/>E2B, Daytona]
    
    %% Agent Runtime
    Runtime[🏃 Agent Runtime<br/>Docker Containers<br/>Isolated Execution]
    
    %% Monitoring
    Monitor[📊 Monitoring<br/>Langfuse, Sentry<br/>Prometheus]
    
    %% Connections
    User --> Browser
    User --> Mobile
    User --> API
    
    Browser --> Frontend
    Mobile --> Gateway
    API --> Gateway
    Frontend --> Gateway
    
    Gateway --> Auth
    Gateway --> AgentMgr
    Gateway --> SessionMgr
    
    AgentMgr --> OnChain
    AgentMgr --> Sentiment
    AgentMgr --> Tokenomics
    AgentMgr --> Team
    
    SessionMgr --> Runtime
    Runtime --> LLM
    Runtime --> Tools
    
    Auth --> Database
    AgentMgr --> Database
    SessionMgr --> Database
    OnChain --> Database
    Sentiment --> Database
    Tokenomics --> Database
    Team --> Database
    
    Gateway --> Cache
    SessionMgr --> Cache
    Runtime --> Cache
    
    Gateway --> Monitor
    Runtime --> Monitor
    
    %% Styling
    classDef userLayer fill:#e1f5fe
    classDef frontend fill:#f3e5f5
    classDef backend fill:#e8f5e8
    classDef microservice fill:#fff3e0
    classDef data fill:#fce4ec
    classDef external fill:#f1f8e9
    classDef runtime fill:#e0f2f1
    
    class User,Browser,Mobile,API userLayer
    class Frontend frontend
    class Gateway,Auth,AgentMgr,SessionMgr backend
    class OnChain,Sentiment,Tokenomics,Team,ChainLens microservice
    class Database,Cache data
    class LLM,Tools external
    class Runtime,Monitor runtime
```

---

## 🔄 Data Flow Architecture

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant G as Gateway
    participant A as Agent Manager
    participant S as Session Manager
    participant M as Microservice
    participant R as Agent Runtime
    participant L as LLM Provider
    participant D as Database
    
    %% Agent Creation Flow
    Note over U,D: Agent Creation Flow
    U->>F: Create Agent Request
    F->>G: POST /agents
    G->>A: Validate & Process
    A->>D: Store Agent Config
    A->>G: Agent Created
    G->>F: Return Agent ID
    F->>U: Show Success
    
    %% Session & Message Flow
    Note over U,D: Session & Message Flow
    U->>F: Start Chat Session
    F->>G: POST /sessions
    G->>S: Create Session
    S->>D: Store Session
    S->>G: Session ID
    G->>F: WebSocket Connection
    F->>U: Chat Interface Ready
    
    %% Message Processing
    U->>F: Send Message
    F->>S: WebSocket Message
    S->>R: Process Message
    R->>M: Get Context Data
    M->>R: Return Analysis
    R->>L: LLM Request
    L->>R: LLM Response
    R->>S: Agent Response
    S->>D: Store Message
    S->>F: WebSocket Response
    F->>U: Display Response
```

---

## 🏗️ Microservices Architecture

```mermaid
graph LR
    %% API Gateway
    Gateway[🚪 API Gateway<br/>Port 8000]
    
    %% Connected Microservices
    subgraph "Connected Services"
        OnChain[⛓️ OnChain Analysis<br/>Port 3001<br/>• Blockchain data<br/>• Web3 integrations<br/>• Token analysis]
        
        Sentiment[😊 Sentiment Analysis<br/>Port 3002<br/>• Social monitoring<br/>• Sentiment tracking<br/>• Trend analysis]
        
        Tokenomics[💰 Tokenomics Service<br/>Port 3003<br/>• Financial metrics<br/>• Token economics<br/>• Market analysis]
        
        Team[👥 Team Verification<br/>Port 3004<br/>• Credibility scoring<br/>• Team analysis<br/>• Verification data]
    end
    
    %% Standalone Service
    subgraph "Standalone Service"
        ChainLens[🔗 ChainLens Core<br/>Port 3006<br/>• Independent orchestrator<br/>• Comprehensive analysis<br/>• Not integrated with main backend]
    end
    
    %% Databases
    subgraph "Data Layer"
        MainDB[(🗄️ Main Database<br/>Supabase PostgreSQL)]
        ServiceDB1[(💾 OnChain DB<br/>Port 5433)]
        ServiceDB2[(💾 Sentiment DB<br/>Port 5434)]
        ServiceDB3[(💾 Tokenomics DB<br/>Port 5435)]
        ServiceDB4[(💾 Team DB<br/>Port 5436)]
        Redis[(⚡ Redis Cache<br/>Port 6379)]
    end
    
    %% External APIs
    subgraph "External APIs"
        Moralis[Moralis API<br/>Blockchain Data]
        CoinGecko[CoinGecko API<br/>Price Data]
        Twitter[Twitter API<br/>Social Data]
        GitHub[GitHub API<br/>Team Data]
    end
    
    %% Connections
    Gateway -.->|HTTP| OnChain
    Gateway -.->|HTTP| Sentiment
    Gateway -.->|HTTP| Tokenomics
    Gateway -.->|HTTP| Team
    
    OnChain --> ServiceDB1
    Sentiment --> ServiceDB2
    Tokenomics --> ServiceDB3
    Team --> ServiceDB4
    
    Gateway --> MainDB
    Gateway --> Redis
    
    OnChain --> Moralis
    OnChain --> CoinGecko
    Sentiment --> Twitter
    Team --> GitHub
    
    OnChain -.-> Redis
    Sentiment -.-> Redis
    Tokenomics -.-> Redis
    Team -.-> Redis
    
    %% Styling
    classDef gateway fill:#e3f2fd
    classDef connected fill:#f3e5f5
    classDef standalone fill:#fff3e0
    classDef database fill:#e8f5e8
    classDef external fill:#fce4ec
    
    class Gateway gateway
    class OnChain,Sentiment,Tokenomics,Team connected
    class ChainLens standalone
    class MainDB,ServiceDB1,ServiceDB2,ServiceDB3,ServiceDB4,Redis database
    class Moralis,CoinGecko,Twitter,GitHub external
```

---

## 🔐 Security Architecture

```mermaid
graph TD
    %% User Authentication
    User[👤 User]
    Auth[🔐 Supabase Auth<br/>JWT Tokens]
    
    %% API Layer Security
    WAF[🛡️ Web Application Firewall]
    RateLimit[⚡ Rate Limiting<br/>Redis-based]
    APIGateway[🚪 API Gateway<br/>FastAPI + Middleware]
    
    %% Application Security
    RBAC[👮 Role-Based Access Control<br/>Row Level Security]
    InputVal[✅ Input Validation<br/>Pydantic + Zod]
    Secrets[🔑 Secrets Management<br/>Environment Variables]
    
    %% Infrastructure Security
    Docker[🐳 Docker Isolation<br/>Container Runtime]
    Network[🌐 Network Security<br/>VPC + Firewall Rules]
    
    %% Data Security
    Encryption[🔒 Data Encryption<br/>TLS 1.3 + AES-256]
    Database[🗄️ Database Security<br/>Connection Pools + SSL]
    
    %% Monitoring & Compliance
    Audit[📋 Audit Logging<br/>Structured Logs]
    Monitor[📊 Security Monitoring<br/>Sentry + Custom Alerts]
    
    %% Flow
    User --> Auth
    Auth --> WAF
    WAF --> RateLimit
    RateLimit --> APIGateway
    
    APIGateway --> RBAC
    APIGateway --> InputVal
    APIGateway --> Secrets
    
    APIGateway --> Docker
    Docker --> Network
    
    APIGateway --> Encryption
    Encryption --> Database
    
    APIGateway --> Audit
    Audit --> Monitor
    
    %% Security Policies
    RBAC -.-> Database
    InputVal -.-> Database
    Secrets -.-> Docker
    
    %% Styling
    classDef auth fill:#e8f5e8
    classDef security fill:#fff3e0
    classDef infra fill:#e3f2fd
    classDef data fill:#fce4ec
    classDef monitor fill:#f3e5f5
    
    class User,Auth auth
    class WAF,RateLimit,APIGateway,RBAC,InputVal,Secrets security
    class Docker,Network infra
    class Encryption,Database data
    class Audit,Monitor monitor
```

---

## 🚀 Deployment Architecture

```mermaid
graph TB
    %% Development
    subgraph "Development Environment"
        DevLocal[💻 Local Development<br/>Docker Compose<br/>Hot Reload]
        DevDB[🗄️ Local Supabase<br/>PostgreSQL + Studio]
        DevRedis[⚡ Local Redis<br/>Development Cache]
    end
    
    %% Staging
    subgraph "Staging Environment"
        StagingK8s[☸️ Kubernetes Cluster<br/>Staging Namespace]
        StagingDB[🗄️ Staging Database<br/>Supabase Instance]
        StagingRedis[⚡ Staging Redis<br/>Upstash Instance]
    end
    
    %% Production
    subgraph "Production Environment"
        ProdK8s[☸️ Production Kubernetes<br/>Multi-Zone Deployment]
        ProdDB[🗄️ Production Database<br/>Supabase Pro + Backups]
        ProdRedis[⚡ Production Redis<br/>High Availability]
        CDN[🌐 CDN<br/>Global Distribution]
        LB[⚖️ Load Balancer<br/>SSL Termination]
    end
    
    %% CI/CD Pipeline
    subgraph "CI/CD Pipeline"
        GitHub[📝 GitHub Repository<br/>Source Code]
        Actions[🔄 GitHub Actions<br/>Build + Test + Deploy]
        Registry[📦 Container Registry<br/>Docker Images]
        Helm[⚓ Helm Charts<br/>Kubernetes Deployment]
    end
    
    %% Monitoring Stack
    subgraph "Monitoring & Observability"
        Prometheus[📊 Prometheus<br/>Metrics Collection]
        Grafana[📈 Grafana<br/>Dashboards]
        Langfuse[🔍 Langfuse<br/>LLM Observability]
        Sentry[🚨 Sentry<br/>Error Tracking]
    end
    
    %% Flow
    GitHub --> Actions
    Actions --> Registry
    Registry --> Helm
    
    Helm --> DevLocal
    Helm --> StagingK8s
    Helm --> ProdK8s
    
    DevLocal --> DevDB
    DevLocal --> DevRedis
    
    StagingK8s --> StagingDB
    StagingK8s --> StagingRedis
    
    ProdK8s --> ProdDB
    ProdK8s --> ProdRedis
    ProdK8s --> CDN
    CDN --> LB
    
    ProdK8s --> Prometheus
    Prometheus --> Grafana
    ProdK8s --> Langfuse
    ProdK8s --> Sentry
    
    %% Styling
    classDef dev fill:#e8f5e8
    classDef staging fill:#fff3e0
    classDef prod fill:#fce4ec
    classDef cicd fill:#e3f2fd
    classDef monitor fill:#f3e5f5
    
    class DevLocal,DevDB,DevRedis dev
    class StagingK8s,StagingDB,StagingRedis staging
    class ProdK8s,ProdDB,ProdRedis,CDN,LB prod
    class GitHub,Actions,Registry,Helm cicd
    class Prometheus,Grafana,Langfuse,Sentry monitor
```

---

## 🔄 Agent Lifecycle Management

```mermaid
stateDiagram-v2
    [*] --> Creating
    Creating --> Configuring: Validation Success
    Creating --> Failed: Validation Error
    
    Configuring --> Training: Config Valid
    Configuring --> Failed: Config Error
    
    Training --> Active: Training Complete
    Training --> Failed: Training Error
    
    Active --> Processing: Receive Message
    Active --> Paused: Manual Pause
    Active --> Updating: Config Change
    
    Processing --> Active: Message Complete
    Processing --> Error: Processing Failed
    
    Error --> Active: Auto Recovery
    Error --> Failed: Max Retries
    
    Paused --> Active: Resume
    
    Updating --> Active: Update Success
    Updating --> Failed: Update Error
    
    Active --> Archived: Manual Archive
    Failed --> Archived: Manual Cleanup
    
    Archived --> [*]: Deletion
    Failed --> [*]: Deletion
    
    note right of Creating
        Agent creation with
        basic configuration
    end note
    
    note right of Training
        LLM fine-tuning or
        tool initialization
    end note
    
    note right of Processing
        Active message handling
        and response generation
    end note
```

---

## 📊 Data Flow Patterns

```mermaid
graph LR
    %% Input Sources
    User[👤 User Input]
    WebSocket[🔌 WebSocket]
    API[📡 REST API]
    Webhook[🎣 Webhooks]
    
    %% Processing Pipeline
    Gateway[🚪 Gateway<br/>Input Validation]
    Queue[📥 Message Queue<br/>Redis]
    Router[🎯 Message Router<br/>Session Manager]
    
    %% Agent Processing
    Agent[🤖 Agent Instance<br/>Runtime Container]
    Tools[🛠️ Tool Execution<br/>Parallel Processing]
    LLM[🧠 LLM Processing<br/>Response Generation]
    
    %% Output Processing
    Filter[🔍 Response Filter<br/>Safety & Quality]
    Format[📝 Response Formatter<br/>Structured Output]
    
    %% Storage & Delivery
    Storage[💾 Message Storage<br/>PostgreSQL]
    Cache[⚡ Response Cache<br/>Redis]
    Delivery[📤 Response Delivery<br/>WebSocket/HTTP]
    
    %% Analytics
    Analytics[📊 Analytics Pipeline<br/>Usage Metrics]
    
    %% Flow
    User --> Gateway
    WebSocket --> Gateway
    API --> Gateway
    Webhook --> Gateway
    
    Gateway --> Queue
    Queue --> Router
    Router --> Agent
    
    Agent --> Tools
    Tools --> Agent
    Agent --> LLM
    LLM --> Agent
    
    Agent --> Filter
    Filter --> Format
    Format --> Storage
    Format --> Cache
    Format --> Delivery
    
    Storage --> Analytics
    
    %% Styling
    classDef input fill:#e8f5e8
    classDef processing fill:#e3f2fd
    classDef agent fill:#fff3e0
    classDef output fill:#fce4ec
    classDef storage fill:#f3e5f5
    
    class User,WebSocket,API,Webhook input
    class Gateway,Queue,Router processing
    class Agent,Tools,LLM agent
    class Filter,Format,Delivery output
    class Storage,Cache,Analytics storage
```

---

## 🛠️ Tool Integration Architecture

```mermaid
graph TD
    %% Agent Core
    Agent[🤖 Agent Instance]
    ToolManager[🔧 Tool Manager<br/>Plugin System]
    
    %% Built-in Tools
    subgraph "Built-in Tools"
        WebSearch[🔍 Web Search<br/>Tavily API]
        WebScrape[🕷️ Web Scraping<br/>Firecrawl]
        CodeExec[💻 Code Execution<br/>E2B Interpreter]
        FileOps[📁 File Operations<br/>Local/Cloud Storage]
    end
    
    %% Blockchain Tools
    subgraph "Blockchain Tools"
        ChainAnalysis[⛓️ Chain Analysis<br/>OnChain Service]
        TokenData[🪙 Token Data<br/>Moralis/CoinGecko]
        DeFiMetrics[📊 DeFi Metrics<br/>Custom APIs]
    end
    
    %% AI/ML Tools
    subgraph "AI/ML Tools"
        ImageGen[🖼️ Image Generation<br/>DALL-E/Midjourney]
        VisionAI[👁️ Computer Vision<br/>OpenAI Vision]
        AudioGen[🔊 Audio Generation<br/>Eleven Labs]
    end
    
    %% Custom Tools
    subgraph "Custom Tools"
        CustomAPI[🔌 Custom APIs<br/>User-defined]
        Webhooks[🎣 Webhook Tools<br/>External Triggers]
        Database[🗄️ Database Tools<br/>SQL/NoSQL Access]
    end
    
    %% Tool Registry
    Registry[📚 Tool Registry<br/>Plugin Discovery]
    Security[🔒 Security Sandbox<br/>Isolated Execution]
    
    %% Connections
    Agent --> ToolManager
    ToolManager --> Registry
    ToolManager --> Security
    
    Security --> WebSearch
    Security --> WebScrape
    Security --> CodeExec
    Security --> FileOps
    
    Security --> ChainAnalysis
    Security --> TokenData
    Security --> DeFiMetrics
    
    Security --> ImageGen
    Security --> VisionAI
    Security --> AudioGen
    
    Security --> CustomAPI
    Security --> Webhooks
    Security --> Database
    
    %% Styling
    classDef core fill:#e3f2fd
    classDef builtin fill:#e8f5e8
    classDef blockchain fill:#fff3e0
    classDef ai fill:#f3e5f5
    classDef custom fill:#fce4ec
    classDef infra fill:#e1f5fe
    
    class Agent,ToolManager core
    class WebSearch,WebScrape,CodeExec,FileOps builtin
    class ChainAnalysis,TokenData,DeFiMetrics blockchain
    class ImageGen,VisionAI,AudioGen ai
    class CustomAPI,Webhooks,Database custom
    class Registry,Security infra
```

---

## 📈 Monitoring & Observability Architecture

```mermaid
graph TB
    %% Application Layer
    Frontend[🖥️ Frontend<br/>Next.js App]
    Backend[🔧 Backend API<br/>FastAPI]
    Microservices[🏢 Microservices<br/>NestJS Services]
    Agents[🤖 Agent Runtime<br/>Docker Containers]
    
    %% Monitoring Collection
    subgraph "Data Collection"
        AppLogs[📝 Application Logs<br/>Structured Logging]
        Metrics[📊 Metrics Collection<br/>Prometheus Client]
        Traces[🔍 Distributed Tracing<br/>OpenTelemetry]
        Errors[🚨 Error Tracking<br/>Sentry SDK]
    end
    
    %% Storage & Processing
    subgraph "Storage & Processing"
        Prometheus[📊 Prometheus<br/>Metrics Storage]
        Loki[📚 Loki<br/>Log Aggregation]
        Jaeger[🔍 Jaeger<br/>Trace Storage]
        InfluxDB[📈 InfluxDB<br/>Time Series Data]
    end
    
    %% Visualization & Alerting
    subgraph "Visualization"
        Grafana[📈 Grafana<br/>Dashboards]
        Langfuse[🔍 Langfuse<br/>LLM Observability]
        Sentry[🚨 Sentry<br/>Error Dashboard]
        AlertManager[⚠️ Alert Manager<br/>Notification System]
    end
    
    %% External Integrations
    subgraph "Notifications"
        Slack[💬 Slack<br/>Team Notifications]
        Email[📧 Email<br/>Critical Alerts]
        PagerDuty[📞 PagerDuty<br/>Incident Management]
    end
    
    %% Connections
    Frontend --> AppLogs
    Backend --> AppLogs
    Microservices --> AppLogs
    Agents --> AppLogs
    
    Frontend --> Metrics
    Backend --> Metrics
    Microservices --> Metrics
    Agents --> Metrics
    
    Backend --> Traces
    Microservices --> Traces
    Agents --> Traces
    
    Frontend --> Errors
    Backend --> Errors
    Microservices --> Errors
    Agents --> Errors
    
    AppLogs --> Loki
    Metrics --> Prometheus
    Traces --> Jaeger
    Metrics --> InfluxDB
    
    Prometheus --> Grafana
    Loki --> Grafana
    Jaeger --> Grafana
    InfluxDB --> Grafana
    
    Agents --> Langfuse
    Errors --> Sentry
    
    Prometheus --> AlertManager
    AlertManager --> Slack
    AlertManager --> Email
    AlertManager --> PagerDuty
    
    %% Styling
    classDef app fill:#e8f5e8
    classDef collection fill:#e3f2fd
    classDef storage fill:#fff3e0
    classDef viz fill:#f3e5f5
    classDef notify fill:#fce4ec
    
    class Frontend,Backend,Microservices,Agents app
    class AppLogs,Metrics,Traces,Errors collection
    class Prometheus,Loki,Jaeger,InfluxDB storage
    class Grafana,Langfuse,Sentry,AlertManager viz
    class Slack,Email,PagerDuty notify
```

---

## 🎯 Usage Instructions

### 📖 **Viewing Diagrams**
These Mermaid diagrams are automatically rendered on GitHub và most modern documentation platforms. For local viewing:

1. **GitHub**: View directly trong repository
2. **VS Code**: Use Mermaid Preview extension
3. **Local Docs**: Use Mermaid CLI or online editor

### 🔧 **Editing Diagrams**
To modify diagrams:
1. Edit the Mermaid syntax directly trong this file
2. Validate syntax using [Mermaid Live Editor](https://mermaid.live/)
3. Test rendering locally before committing

### 📚 **References**
- **[Mermaid Documentation](https://mermaid-js.github.io/mermaid/)**
- **[Technical Specifications](../TECHNICAL_SPECIFICATIONS.md)**
- **[Project Document](../PROJECT_DOCUMENT.md)**

---

*🏗️ Architecture diagrams maintained by BMad Master | Last updated: 2025-01-09 | Version: 1.0*

*For detailed technical specifications, see [TECHNICAL_SPECIFICATIONS.md](../TECHNICAL_SPECIFICATIONS.md)*
