# 🏗️ System Architecture Diagrams

## 📖 Table of Contents

- [Overview](#overview)
- [High-Level System Architecture](#high-level-system-architecture)
- [Microservices Topology](#microservices-topology)
- [Database Schema](#database-schema)
- [Authentication & Authorization Flow](#authentication--authorization-flow)
- [Agent Workflow Pipeline](#agent-workflow-pipeline)
- [Tool Integration Architecture](#tool-integration-architecture)
- [Deployment Architecture](#deployment-architecture)
- [Network Security Architecture](#network-security-architecture)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Event-Driven Architecture](#event-driven-architecture)
- [Monitoring & Observability](#monitoring--observability)

---

## 🎯 Overview

This document provides comprehensive visual representations of the ChainLens AI Agent Platform architecture using Mermaid diagrams. These diagrams serve as the single source of truth for understanding system components, their relationships, and data flows.

### **🔍 Diagram Types**

| Diagram Type | Purpose | Audience |
|--------------|---------|----------|
| **System Architecture** | High-level component overview | Architects, Product Managers |
| **Microservices Topology** | Service dependencies | Developers, DevOps |
| **Database Schema** | Data relationships | Backend Developers, DBAs |
| **Authentication Flow** | Security mechanisms | Security Team, Developers |
| **Agent Workflow** | AI processing pipeline | AI Engineers, Developers |
| **Deployment** | Infrastructure layout | DevOps, SREs |

---

## 🏛️ High-Level System Architecture

```mermaid
graph TB
    %% External Users & Systems
    User[👤 End User]
    Admin[🛠️ Admin User]
    DevTeam[👥 Development Team]
    
    %% Load Balancer & CDN
    CDN[🌐 CloudFlare CDN]
    ALB[⚖️ Application Load Balancer]
    
    %% Frontend Layer
    WebApp[🖥️ Next.js Frontend<br/>React 18 + TypeScript]
    AdminPanel[🎛️ Admin Dashboard<br/>Management Interface]
    
    %% API Gateway
    Gateway[🔌 API Gateway<br/>Rate Limiting + Auth]
    
    %% Backend Services
    BackendAPI[🚀 Backend API<br/>FastAPI + Python 3.11]
    AuthService[🔐 Authentication Service<br/>JWT + OAuth2]
    AgentEngine[🤖 Agent Engine<br/>LLM Integration]
    TaskQueue[📋 Task Queue<br/>Dramatiq + Redis]
    
    %% Microservices
    OnChain[⛓️ OnChain Service<br/>Blockchain Analysis]
    Sentiment[💭 Sentiment Service<br/>Social Media Analysis]
    Tokenomics[💰 Tokenomics Service<br/>Financial Metrics]
    TeamAnalysis[👥 Team Service<br/>Verification & Scoring]
    
    %% Data Layer
    PostgresMain[(🐘 PostgreSQL<br/>Main Database)]
    Redis[(🔴 Redis<br/>Cache + Sessions)]
    VectorDB[(🔍 Vector Database<br/>Embeddings)]
    FileStorage[📁 Object Storage<br/>S3 Compatible]
    
    %% External Services
    OpenAI[🧠 OpenAI API]
    Anthropic[🧠 Anthropic API]
    External[🌐 External APIs<br/>Moralis, CoinGecko]
    
    %% Monitoring & Observability
    Monitoring[📊 Monitoring Stack<br/>Prometheus + Grafana]
    Logging[📝 Logging<br/>Langfuse + Sentry]
    
    %% User Interactions
    User --> CDN
    Admin --> AdminPanel
    DevTeam --> Monitoring
    
    %% CDN & Load Balancing
    CDN --> ALB
    ALB --> WebApp
    ALB --> AdminPanel
    
    %% Frontend to API Gateway
    WebApp --> Gateway
    AdminPanel --> Gateway
    
    %% API Gateway to Backend
    Gateway --> BackendAPI
    Gateway --> AuthService
    
    %% Backend to Services
    BackendAPI --> AgentEngine
    BackendAPI --> TaskQueue
    AuthService --> PostgresMain
    
    %% Agent Engine to Microservices
    AgentEngine --> OnChain
    AgentEngine --> Sentiment  
    AgentEngine --> Tokenomics
    AgentEngine --> TeamAnalysis
    
    %% Task Processing
    TaskQueue --> AgentEngine
    
    %% Data Layer Connections
    BackendAPI --> PostgresMain
    BackendAPI --> Redis
    AgentEngine --> VectorDB
    BackendAPI --> FileStorage
    
    %% External Service Integrations
    AgentEngine --> OpenAI
    AgentEngine --> Anthropic
    OnChain --> External
    Sentiment --> External
    Tokenomics --> External
    TeamAnalysis --> External
    
    %% Monitoring Connections
    BackendAPI --> Monitoring
    AgentEngine --> Logging
    TaskQueue --> Monitoring
    
    %% Styling
    classDef userClass fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef frontendClass fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef backendClass fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef dataClass fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef externalClass fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef monitoringClass fill:#f1f8e9,stroke:#33691e,stroke-width:2px
    
    class User,Admin,DevTeam userClass
    class WebApp,AdminPanel frontendClass
    class BackendAPI,AuthService,AgentEngine,TaskQueue,OnChain,Sentiment,Tokenomics,TeamAnalysis backendClass
    class PostgresMain,Redis,VectorDB,FileStorage dataClass
    class OpenAI,Anthropic,External externalClass
    class Monitoring,Logging monitoringClass
```

---

## 🔗 Microservices Topology

```mermaid
graph LR
    %% API Gateway
    Gateway[🔌 API Gateway<br/>🔒 Auth + Rate Limiting<br/>📊 Metrics Collection]
    
    %% Core Backend Services
    subgraph "Core Services"
        Backend[🚀 Backend API<br/>📦 FastAPI<br/>🔄 REST + WebSocket]
        Auth[🔐 Auth Service<br/>🎫 JWT Tokens<br/>👤 User Management]
        Agent[🤖 Agent Engine<br/>🧠 LLM Integration<br/>⚡ Task Orchestration]
    end
    
    %% Microservices Cluster
    subgraph "Analysis Microservices"
        OnChain[⛓️ OnChain Service<br/>🏠 Port: 3001<br/>🔍 Blockchain Analytics<br/>💎 Token Analysis]
        Sentiment[💭 Sentiment Service<br/>🏠 Port: 3002<br/>📱 Social Media<br/>📈 Market Sentiment]
        Tokenomics[💰 Tokenomics Service<br/>🏠 Port: 3003<br/>📊 Financial Metrics<br/>💹 Price Analysis]
        Team[👥 Team Service<br/>🏠 Port: 3004<br/>✅ Team Verification<br/>🎯 Credibility Scoring]
    end
    
    %% Message Queue & Background Processing
    subgraph "Queue System"
        TaskQueue[📋 Task Queue<br/>🔄 Dramatiq<br/>⚡ Background Jobs]
        Worker1[👷 Worker Pool 1<br/>🔄 Agent Tasks]
        Worker2[👷 Worker Pool 2<br/>📊 Analytics Jobs]
        Worker3[👷 Worker Pool 3<br/>🔍 Data Processing]
    end
    
    %% Data Services
    subgraph "Data Layer"
        Postgres[(🐘 PostgreSQL<br/>📊 Structured Data)]
        Redis[(🔴 Redis<br/>💾 Cache + Sessions<br/>📨 Pub/Sub)]
        Vector[(🔍 Vector DB<br/>🧠 Embeddings<br/>🔎 Semantic Search)]
        Storage[📁 Object Storage<br/>📄 Files + Assets]
    end
    
    %% External Services
    subgraph "External APIs"
        LLM[🧠 LLM Providers<br/>OpenAI + Anthropic<br/>🤖 Model Inference]
        Blockchain[⛓️ Blockchain APIs<br/>Moralis + Alchemy<br/>📊 On-chain Data]
        Social[📱 Social APIs<br/>Twitter + Discord<br/>💬 Social Data]
        Finance[💹 Financial APIs<br/>CoinGecko + CMC<br/>💰 Price Data]
    end
    
    %% Request Flow
    Gateway --> Backend
    Gateway --> Auth
    
    %% Backend Service Communication
    Backend --> Agent
    Agent --> TaskQueue
    
    %% Agent to Microservices (Service Mesh)
    Agent -.-> OnChain
    Agent -.-> Sentiment
    Agent -.-> Tokenomics
    Agent -.-> Team
    
    %% Queue to Workers
    TaskQueue --> Worker1
    TaskQueue --> Worker2
    TaskQueue --> Worker3
    
    %% Data Layer Connections
    Backend --> Postgres
    Backend --> Redis
    Auth --> Postgres
    Agent --> Vector
    Agent --> Storage
    
    %% Microservices to Data
    OnChain --> Redis
    Sentiment --> Redis
    Tokenomics --> Redis
    Team --> Redis
    
    %% External API Connections
    Agent --> LLM
    OnChain --> Blockchain
    Sentiment --> Social
    Tokenomics --> Finance
    Team --> Social
    
    %% Service Discovery & Health Checks
    Gateway -.->|Health Check| Backend
    Gateway -.->|Health Check| Auth
    Agent -.->|Service Discovery| OnChain
    Agent -.->|Service Discovery| Sentiment
    Agent -.->|Service Discovery| Tokenomics
    Agent -.->|Service Discovery| Team
    
    %% Styling
    classDef coreService fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef microService fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    classDef queueService fill:#fff8e1,stroke:#f57c00,stroke-width:2px
    classDef dataService fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef externalService fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    
    class Backend,Auth,Agent coreService
    class OnChain,Sentiment,Tokenomics,Team microService
    class TaskQueue,Worker1,Worker2,Worker3 queueService
    class Postgres,Redis,Vector,Storage dataService
    class LLM,Blockchain,Social,Finance externalService
```

---

## 🗄️ Database Schema

```mermaid
erDiagram
    %% Core User Management
    USERS {
        uuid id PK
        string email UK
        string name
        string password_hash
        json profile_data
        string subscription_type
        boolean is_active
        timestamp created_at
        timestamp updated_at
        timestamp last_login_at
    }
    
    %% Agent Configuration
    AGENTS {
        uuid id PK
        uuid user_id FK
        string name
        string type
        json configuration
        json system_prompt
        json tools
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    %% Chat Sessions
    SESSIONS {
        uuid id PK
        uuid agent_id FK
        uuid user_id FK
        string name
        json metadata
        string status
        timestamp created_at
        timestamp updated_at
        timestamp ended_at
    }
    
    %% Conversation Messages
    MESSAGES {
        uuid id PK
        uuid session_id FK
        string role
        text content
        json tool_calls
        json attachments
        json metadata
        timestamp created_at
        integer token_count
        float cost_usd
    }
    
    %% Background Tasks
    TASKS {
        uuid id PK
        uuid session_id FK
        string task_type
        json parameters
        string status
        json result
        string error_message
        timestamp created_at
        timestamp completed_at
        integer retry_count
    }
    
    %% Tool Execution Logs
    TOOL_EXECUTIONS {
        uuid id PK
        uuid message_id FK
        string tool_name
        json input_parameters
        json output_result
        float execution_time
        string status
        timestamp executed_at
    }
    
    %% Agent Analytics
    AGENT_ANALYTICS {
        uuid id PK
        uuid agent_id FK
        date date
        integer total_messages
        integer total_sessions
        float total_cost
        integer avg_response_time
        json performance_metrics
    }
    
    %% User Usage Tracking
    USER_USAGE {
        uuid id PK
        uuid user_id FK
        date date
        integer api_calls
        integer agent_interactions
        float cost_incurred
        json usage_breakdown
    }
    
    %% System Configuration
    SYSTEM_CONFIG {
        string key PK
        json value
        string description
        boolean is_public
        timestamp updated_at
        string updated_by
    }
    
    %% API Keys & Integration
    API_KEYS {
        uuid id PK
        uuid user_id FK
        string name
        string key_hash
        json permissions
        timestamp expires_at
        timestamp last_used_at
        boolean is_active
    }
    
    %% File Uploads
    FILES {
        uuid id PK
        uuid user_id FK
        uuid session_id FK
        string filename
        string content_type
        integer file_size
        string storage_path
        json metadata
        timestamp uploaded_at
    }
    
    %% Agent Templates
    AGENT_TEMPLATES {
        uuid id PK
        string name
        string category
        string description
        json configuration
        json default_tools
        boolean is_public
        integer usage_count
        timestamp created_at
    }
    
    %% Relationships
    USERS ||--o{ AGENTS : "owns"
    USERS ||--o{ SESSIONS : "creates"
    USERS ||--o{ USER_USAGE : "tracks"
    USERS ||--o{ API_KEYS : "manages"
    USERS ||--o{ FILES : "uploads"
    
    AGENTS ||--o{ SESSIONS : "powers"
    AGENTS ||--o{ AGENT_ANALYTICS : "measures"
    AGENT_TEMPLATES ||--o{ AGENTS : "templates"
    
    SESSIONS ||--o{ MESSAGES : "contains"
    SESSIONS ||--o{ TASKS : "executes"
    SESSIONS ||--o{ FILES : "references"
    
    MESSAGES ||--o{ TOOL_EXECUTIONS : "triggers"
    
    %% Indexes and Performance Notes
    %% USERS: email, subscription_type, created_at
    %% AGENTS: user_id, type, is_active
    %% SESSIONS: agent_id, user_id, status, created_at
    %% MESSAGES: session_id, created_at, role
    %% TASKS: session_id, status, created_at
```

---

## 🔐 Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Frontend as 🖥️ Frontend
    participant Gateway as 🔌 API Gateway
    participant Auth as 🔐 Auth Service
    participant Backend as 🚀 Backend API
    participant DB as 🐘 Database
    participant Redis as 🔴 Redis Cache
    
    Note over User, Redis: Authentication Flow
    
    %% Registration Flow
    User->>+Frontend: Register Account
    Frontend->>+Gateway: POST /auth/register
    Gateway->>+Auth: Forward Registration
    Auth->>+DB: Check Email Exists
    DB-->>-Auth: Email Available
    Auth->>+DB: Create User Record
    DB-->>-Auth: User Created
    Auth->>+Redis: Store Verification Token
    Redis-->>-Auth: Token Stored
    Auth-->>-Gateway: Registration Success
    Gateway-->>-Frontend: 201 Created
    Frontend-->>-User: Check Email for Verification
    
    Note over User, Redis: Email Verification
    
    User->>+Frontend: Click Verification Link
    Frontend->>+Gateway: POST /auth/verify-email
    Gateway->>+Auth: Verify Token
    Auth->>+Redis: Check Verification Token
    Redis-->>-Auth: Token Valid
    Auth->>+DB: Update User as Verified
    DB-->>-Auth: User Verified
    Auth->>+Redis: Clear Verification Token
    Redis-->>-Auth: Token Cleared
    Auth-->>-Gateway: Verification Success
    Gateway-->>-Frontend: 200 OK
    Frontend-->>-User: Account Verified
    
    Note over User, Redis: Login Flow
    
    User->>+Frontend: Login Credentials
    Frontend->>+Gateway: POST /auth/login
    Gateway->>+Auth: Authenticate User
    Auth->>+DB: Validate Credentials
    DB-->>-Auth: Credentials Valid
    Auth->>Auth: Generate JWT Token
    Auth->>+Redis: Store Refresh Token
    Redis-->>-Auth: Token Stored
    Auth-->>-Gateway: JWT + Refresh Token
    Gateway-->>-Frontend: 200 OK + Tokens
    Frontend->>Frontend: Store Tokens
    Frontend-->>-User: Login Success
    
    Note over User, Redis: Authenticated API Calls
    
    User->>+Frontend: Make API Request
    Frontend->>+Gateway: Request + JWT Token
    Gateway->>Gateway: Validate JWT
    
    alt JWT Valid
        Gateway->>+Backend: Forward Request
        Backend->>+DB: Process Request
        DB-->>-Backend: Return Data
        Backend-->>-Gateway: Response Data
        Gateway-->>-Frontend: 200 OK + Data
        Frontend-->>-User: Display Results
    else JWT Expired
        Gateway-->>-Frontend: 401 Unauthorized
        Frontend->>+Gateway: POST /auth/refresh
        Gateway->>+Auth: Refresh Token Request
        Auth->>+Redis: Validate Refresh Token
        Redis-->>-Auth: Token Valid
        Auth->>Auth: Generate New JWT
        Auth-->>-Gateway: New JWT Token
        Gateway-->>-Frontend: 200 OK + New JWT
        Frontend->>Frontend: Update Stored Token
        Frontend->>+Gateway: Retry Original Request
        Gateway->>+Backend: Forward Request
        Backend-->>-Gateway: Response Data
        Gateway-->>-Frontend: 200 OK + Data
        Frontend-->>-User: Display Results
    else JWT Invalid
        Gateway-->>Frontend: 401 Unauthorized
        Frontend-->>User: Redirect to Login
    end
    
    Note over User, Redis: Logout Flow
    
    User->>+Frontend: Logout Request
    Frontend->>+Gateway: POST /auth/logout
    Gateway->>+Auth: Logout Request
    Auth->>+Redis: Blacklist JWT Token
    Redis-->>-Auth: Token Blacklisted
    Auth->>+Redis: Remove Refresh Token
    Redis-->>-Auth: Token Removed
    Auth-->>-Gateway: Logout Success
    Gateway-->>-Frontend: 200 OK
    Frontend->>Frontend: Clear Stored Tokens
    Frontend-->>-User: Logged Out
```

---

## 🤖 Agent Workflow Pipeline

```mermaid
flowchart TD
    %% User Input
    Start([👤 User Input<br/>Chat Message])
    
    %% Input Processing
    InputValidation{🔍 Input Validation<br/>& Sanitization}
    SessionCheck{🔐 Session Valid?}
    
    %% Agent Selection & Configuration
    AgentLoad[🤖 Load Agent Config<br/>Model + Tools + Prompt]
    ContextBuild[📚 Build Context<br/>History + Memory]
    
    %% LLM Processing
    PromptGen[📝 Generate System Prompt<br/>Context + Instructions]
    LLMCall[🧠 LLM API Call<br/>OpenAI/Anthropic]
    
    %% Response Processing
    ResponseParse{🔍 Parse Response<br/>Tool Calls?}
    
    %% Tool Execution Branch
    ToolRouter[🔧 Tool Router<br/>Route to Services]
    
    %% Parallel Tool Execution
    subgraph "Tool Execution"
        OnChainTool[⛓️ OnChain Analysis<br/>Blockchain Data]
        SentimentTool[💭 Sentiment Analysis<br/>Social Media]
        TokenomicsTool[💰 Tokenomics<br/>Financial Data]
        TeamTool[👥 Team Analysis<br/>Verification]
        WebSearchTool[🔍 Web Search<br/>Current Info]
        CodeTool[💻 Code Interpreter<br/>Data Analysis]
    end
    
    %% Tool Results Aggregation
    ToolResults[📊 Aggregate Results<br/>Merge Tool Outputs]
    
    %% Final LLM Processing
    FinalPrompt[📝 Final Prompt<br/>Original + Tool Results]
    FinalLLM[🧠 Final LLM Call<br/>Generate Response]
    
    %% Response Formatting
    ResponseFormat[📋 Format Response<br/>Markdown + Citations]
    
    %% Storage & Analytics
    StoreMessage[💾 Store Message<br/>Database]
    UpdateAnalytics[📊 Update Analytics<br/>Usage + Performance]
    UpdateMemory[🧠 Update Memory<br/>Vector Database]
    
    %% Final Response
    StreamResponse[📡 Stream Response<br/>WebSocket]
    End([✅ Response Complete])
    
    %% Error Handling
    ValidationError[❌ Validation Error]
    SessionError[❌ Session Invalid]
    LLMError[❌ LLM Error]
    ToolError[❌ Tool Error]
    GeneralError[❌ System Error]
    
    %% Flow Connections
    Start --> InputValidation
    InputValidation -->|Valid| SessionCheck
    InputValidation -->|Invalid| ValidationError
    
    SessionCheck -->|Valid| AgentLoad
    SessionCheck -->|Invalid| SessionError
    
    AgentLoad --> ContextBuild
    ContextBuild --> PromptGen
    PromptGen --> LLMCall
    
    LLMCall -->|Success| ResponseParse
    LLMCall -->|Error| LLMError
    
    ResponseParse -->|Tool Calls| ToolRouter
    ResponseParse -->|Text Response| ResponseFormat
    
    %% Tool Routing
    ToolRouter --> OnChainTool
    ToolRouter --> SentimentTool
    ToolRouter --> TokenomicsTool
    ToolRouter --> TeamTool
    ToolRouter --> WebSearchTool
    ToolRouter --> CodeTool
    
    %% Tool Results Processing
    OnChainTool --> ToolResults
    SentimentTool --> ToolResults
    TokenomicsTool --> ToolResults
    TeamTool --> ToolResults
    WebSearchTool --> ToolResults
    CodeTool --> ToolResults
    
    ToolResults -->|Success| FinalPrompt
    ToolResults -->|Error| ToolError
    
    FinalPrompt --> FinalLLM
    FinalLLM -->|Success| ResponseFormat
    FinalLLM -->|Error| LLMError
    
    %% Response Processing
    ResponseFormat --> StoreMessage
    StoreMessage --> UpdateAnalytics
    UpdateAnalytics --> UpdateMemory
    UpdateMemory --> StreamResponse
    StreamResponse --> End
    
    %% Error Handling
    ValidationError --> End
    SessionError --> End
    LLMError --> GeneralError
    ToolError --> GeneralError
    GeneralError --> End
    
    %% Styling
    classDef startEnd fill:#e8f5e8,stroke:#2e7d32,stroke-width:3px
    classDef process fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    classDef decision fill:#fff8e1,stroke:#f57c00,stroke-width:2px
    classDef tool fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef error fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef storage fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    
    class Start,End startEnd
    class AgentLoad,ContextBuild,PromptGen,LLMCall,FinalPrompt,FinalLLM,ResponseFormat,StreamResponse process
    class InputValidation,SessionCheck,ResponseParse decision
    class OnChainTool,SentimentTool,TokenomicsTool,TeamTool,WebSearchTool,CodeTool,ToolRouter tool
    class ValidationError,SessionError,LLMError,ToolError,GeneralError error
    class StoreMessage,UpdateAnalytics,UpdateMemory storage
```

---

## 🔧 Tool Integration Architecture

```mermaid
graph TD
    %% Agent Engine Core
    Agent[🤖 Agent Engine<br/>Tool Orchestrator]
    
    %% Tool Manager
    ToolManager[🔧 Tool Manager<br/>Registry + Validation<br/>Error Handling]
    
    %% Built-in Tools
    subgraph "Built-in Tools"
        WebSearch[🔍 Web Search Tool<br/>Tavily API<br/>Real-time Information]
        CodeInterpreter[💻 Code Interpreter<br/>E2B Runtime<br/>Python + Analysis]
        FileHandler[📁 File Handler<br/>Upload + Processing<br/>PDF, CSV, JSON]
        Calculator[🧮 Calculator<br/>Mathematical Operations<br/>Unit Conversions]
    end
    
    %% Microservice Tools
    subgraph "Microservice Tools"
        OnChainAnalyzer[⛓️ OnChain Analyzer<br/>HTTP Client<br/>Blockchain Data]
        SentimentAnalyzer[💭 Sentiment Analyzer<br/>HTTP Client<br/>Social Sentiment]
        TokenomicsAnalyzer[💰 Tokenomics Analyzer<br/>HTTP Client<br/>Financial Metrics]
        TeamAnalyzer[👥 Team Analyzer<br/>HTTP Client<br/>Team Verification]
    end
    
    %% External API Tools
    subgraph "External API Tools"
        TwitterTool[🐦 Twitter Tool<br/>Twitter API v2<br/>Social Media Data]
        GitHubTool[🐙 GitHub Tool<br/>GitHub API<br/>Repository Analysis]
        EmailTool[📧 Email Tool<br/>SMTP/IMAP<br/>Communication]
        SlackTool[💬 Slack Tool<br/>Slack API<br/>Team Communication]
    end
    
    %% Custom Plugin System
    subgraph "Plugin System"
        PluginLoader[📦 Plugin Loader<br/>Dynamic Loading<br/>Sandbox Execution]
        PluginRegistry[📋 Plugin Registry<br/>Metadata + Permissions<br/>Version Control]
        CustomTool1[🔌 Custom Tool 1<br/>User Defined<br/>Business Logic]
        CustomTool2[🔌 Custom Tool 2<br/>User Defined<br/>Integration]
    end
    
    %% Tool Execution Environment
    subgraph "Execution Environment"
        Executor[⚡ Tool Executor<br/>Async Execution<br/>Timeout Management]
        Validator[✅ Input Validator<br/>Schema Validation<br/>Sanitization]
        Cache[💾 Result Cache<br/>Redis Cache<br/>Performance Optimization]
        Monitor[📊 Execution Monitor<br/>Metrics + Logging<br/>Error Tracking]
    end
    
    %% External Services
    subgraph "External Services"
        TavilyAPI[🌐 Tavily API<br/>Web Search]
        E2BRuntime[⚡ E2B Runtime<br/>Code Execution]
        BlockchainAPIs[⛓️ Blockchain APIs<br/>Moralis, Alchemy]
        SocialAPIs[📱 Social APIs<br/>Twitter, Discord]
        FinanceAPIs[💹 Finance APIs<br/>CoinGecko, CMC]
    end
    
    %% Data Flow
    Agent --> ToolManager
    
    %% Tool Registration
    ToolManager --> WebSearch
    ToolManager --> CodeInterpreter
    ToolManager --> FileHandler
    ToolManager --> Calculator
    
    ToolManager --> OnChainAnalyzer
    ToolManager --> SentimentAnalyzer
    ToolManager --> TokenomicsAnalyzer
    ToolManager --> TeamAnalyzer
    
    ToolManager --> TwitterTool
    ToolManager --> GitHubTool
    ToolManager --> EmailTool
    ToolManager --> SlackTool
    
    %% Plugin System
    ToolManager --> PluginLoader
    PluginLoader --> PluginRegistry
    PluginRegistry --> CustomTool1
    PluginRegistry --> CustomTool2
    
    %% Execution Pipeline
    ToolManager --> Executor
    Executor --> Validator
    Validator --> Cache
    Cache --> Monitor
    
    %% External Service Connections
    WebSearch -.-> TavilyAPI
    CodeInterpreter -.-> E2BRuntime
    OnChainAnalyzer -.-> BlockchainAPIs
    SentimentAnalyzer -.-> SocialAPIs
    TokenomicsAnalyzer -.-> FinanceAPIs
    TwitterTool -.-> SocialAPIs
    
    %% Tool Schema Definition
    ToolSchema[📋 Tool Schema<br/>OpenAPI 3.0<br/>Input/Output Types]
    ToolManager --> ToolSchema
    
    %% Error Handling
    ErrorHandler[❌ Error Handler<br/>Retry Logic<br/>Fallback Strategies]
    Monitor --> ErrorHandler
    
    %% Security
    SecurityLayer[🔒 Security Layer<br/>Permission Checks<br/>Rate Limiting]
    Validator --> SecurityLayer
    
    %% Styling
    classDef coreService fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef builtinTool fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    classDef microTool fill:#fff8e1,stroke:#f57c00,stroke-width:2px
    classDef externalTool fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef pluginTool fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef executionEnv fill:#e0f2f1,stroke:#00695c,stroke-width:2px
    classDef externalService fill:#ffebee,stroke:#c62828,stroke-width:2px
    
    class Agent,ToolManager coreService
    class WebSearch,CodeInterpreter,FileHandler,Calculator builtinTool
    class OnChainAnalyzer,SentimentAnalyzer,TokenomicsAnalyzer,TeamAnalyzer microTool
    class TwitterTool,GitHubTool,EmailTool,SlackTool externalTool
    class PluginLoader,PluginRegistry,CustomTool1,CustomTool2 pluginTool
    class Executor,Validator,Cache,Monitor,ToolSchema,ErrorHandler,SecurityLayer executionEnv
    class TavilyAPI,E2BRuntime,BlockchainAPIs,SocialAPIs,FinanceAPIs externalService
```

---

## 🚀 Deployment Architecture

```mermaid
graph TB
    %% Internet & CDN
    Internet[🌐 Internet<br/>Global Users]
    CloudFlare[☁️ CloudFlare<br/>CDN + DDoS Protection<br/>SSL Termination]
    
    %% AWS Infrastructure
    subgraph "AWS Cloud Infrastructure"
        %% Load Balancer
        ALB[⚖️ Application Load Balancer<br/>Multi-AZ<br/>Health Checks + SSL]
        
        %% Availability Zones
        subgraph "AZ-1a (Primary)"
            %% Frontend
            Frontend1[🖥️ Frontend Container<br/>Next.js App<br/>Port: 3000]
            
            %% Backend Services
            Backend1[🚀 Backend API<br/>FastAPI App<br/>Port: 8000]
            Worker1[👷 Background Worker<br/>Dramatiq<br/>Task Processing]
            
            %% Microservices
            OnChain1[⛓️ OnChain Service<br/>Port: 3001]
            Sentiment1[💭 Sentiment Service<br/>Port: 3002]
        end
        
        subgraph "AZ-1b (Secondary)"
            %% Frontend
            Frontend2[🖥️ Frontend Container<br/>Next.js App<br/>Port: 3000]
            
            %% Backend Services
            Backend2[🚀 Backend API<br/>FastAPI App<br/>Port: 8000]
            Worker2[👷 Background Worker<br/>Dramatiq<br/>Task Processing]
            
            %% Microservices
            OnChain2[⛓️ OnChain Service<br/>Port: 3001]
            Sentiment2[💭 Sentiment Service<br/>Port: 3002]
        end
        
        %% Data Layer
        subgraph "Data Layer (Multi-AZ)"
            %% Primary Database
            RDSPrimary[(🐘 RDS PostgreSQL<br/>Primary Instance<br/>Multi-AZ Enabled)]
            RDSReplica[(🐘 RDS Read Replica<br/>Read Operations<br/>Auto-Scaling)]
            
            %% Cache Layer
            RedisCluster[🔴 ElastiCache Redis<br/>Cluster Mode<br/>3 Shards + Replicas]
            
            %% Object Storage
            S3Bucket[📁 S3 Bucket<br/>File Storage<br/>Versioning + Encryption]
        end
    end
    
    %% External Services
    subgraph "External Services"
        OpenAIAPI[🧠 OpenAI API<br/>GPT Models<br/>Rate Limited]
        AnthropicAPI[🧠 Anthropic API<br/>Claude Models<br/>Rate Limited]
        BlockchainAPIs[⛓️ Blockchain APIs<br/>Moralis + Alchemy<br/>Web3 Data]
        SocialAPIs[📱 Social APIs<br/>Twitter + Discord<br/>Social Data]
    end
    
    %% Monitoring & Observability
    subgraph "Monitoring Stack"
        Prometheus[📊 Prometheus<br/>Metrics Collection<br/>Time Series DB]
        Grafana[📈 Grafana<br/>Dashboards<br/>Alerting]
        Langfuse[📝 Langfuse<br/>LLM Observability<br/>Trace Analysis]
        Sentry[🐛 Sentry<br/>Error Tracking<br/>Performance Monitoring]
    end
    
    %% CI/CD Pipeline
    subgraph "CI/CD Pipeline"
        GitHub[🐙 GitHub<br/>Source Control<br/>Actions CI/CD]
        ECR[📦 Amazon ECR<br/>Container Registry<br/>Image Storage]
        EKS[☸️ Amazon EKS<br/>Kubernetes<br/>Container Orchestration]
    end
    
    %% Network Flow
    Internet --> CloudFlare
    CloudFlare --> ALB
    
    %% Load Balancing
    ALB --> Frontend1
    ALB --> Frontend2
    ALB --> Backend1
    ALB --> Backend2
    
    %% Service Communication
    Backend1 --> OnChain1
    Backend1 --> Sentiment1
    Backend2 --> OnChain2
    Backend2 --> Sentiment2
    
    %% Background Processing
    Backend1 --> Worker1
    Backend2 --> Worker2
    
    %% Data Connections
    Backend1 --> RDSPrimary
    Backend2 --> RDSPrimary
    Backend1 --> RDSReplica
    Backend2 --> RDSReplica
    
    Backend1 --> RedisCluster
    Backend2 --> RedisCluster
    Worker1 --> RedisCluster
    Worker2 --> RedisCluster
    
    Backend1 --> S3Bucket
    Backend2 --> S3Bucket
    
    %% External API Connections
    OnChain1 -.-> BlockchainAPIs
    OnChain2 -.-> BlockchainAPIs
    Sentiment1 -.-> SocialAPIs
    Sentiment2 -.-> SocialAPIs
    Backend1 -.-> OpenAIAPI
    Backend1 -.-> AnthropicAPI
    Backend2 -.-> OpenAIAPI
    Backend2 -.-> AnthropicAPI
    
    %% Monitoring Connections
    Backend1 --> Prometheus
    Backend2 --> Prometheus
    OnChain1 --> Prometheus
    OnChain2 --> Prometheus
    Sentiment1 --> Prometheus
    Sentiment2 --> Prometheus
    
    Prometheus --> Grafana
    Backend1 --> Langfuse
    Backend2 --> Langfuse
    Backend1 --> Sentry
    Backend2 --> Sentry
    
    %% CI/CD Flow
    GitHub --> ECR
    ECR --> EKS
    EKS --> Frontend1
    EKS --> Frontend2
    EKS --> Backend1
    EKS --> Backend2
    EKS --> OnChain1
    EKS --> OnChain2
    EKS --> Sentiment1
    EKS --> Sentiment2
    
    %% Styling
    classDef frontend fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef backend fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef data fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef external fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef monitoring fill:#e0f2f1,stroke:#00695c,stroke-width:2px
    classDef cicd fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px
    classDef infrastructure fill:#f1f8e9,stroke:#33691e,stroke-width:2px
    
    class Frontend1,Frontend2 frontend
    class Backend1,Backend2,Worker1,Worker2,OnChain1,OnChain2,Sentiment1,Sentiment2 backend
    class RDSPrimary,RDSReplica,RedisCluster,S3Bucket data
    class OpenAIAPI,AnthropicAPI,BlockchainAPIs,SocialAPIs external
    class Prometheus,Grafana,Langfuse,Sentry monitoring
    class GitHub,ECR,EKS cicd
    class ALB,CloudFlare infrastructure
```

---

## 🔒 Network Security Architecture

```mermaid
graph TB
    %% Internet & Edge Security
    Internet[🌐 Internet<br/>External Users]
    
    subgraph "Edge Security Layer"
        WAF[🛡️ Web Application Firewall<br/>OWASP Rules<br/>DDoS Protection]
        CDN[☁️ CloudFlare CDN<br/>Geographic Distribution<br/>Attack Mitigation]
        RateLimit[⏱️ Rate Limiting<br/>API Throttling<br/>User-based Limits]
    end
    
    %% DMZ - Public Subnet
    subgraph "DMZ (Public Subnet)"
        ALB[⚖️ Application Load Balancer<br/>SSL Termination<br/>Health Checks]
        BastionHost[🏰 Bastion Host<br/>SSH Jump Server<br/>Audit Logging]
    end
    
    %% Application Layer - Private Subnet
    subgraph "Application Layer (Private Subnet)"
        subgraph "Frontend Tier"
            Frontend[🖥️ Frontend Servers<br/>Next.js Apps<br/>Static Content]
        end
        
        subgraph "API Gateway Tier"
            Gateway[🔌 API Gateway<br/>Authentication<br/>Request Routing]
        end
        
        subgraph "Backend Tier"
            Backend[🚀 Backend API<br/>Business Logic<br/>JWT Validation]
            AuthService[🔐 Auth Service<br/>User Management<br/>Token Generation]
        end
        
        subgraph "Microservices Tier"
            Microservices[🔧 Microservices<br/>Isolated Services<br/>Internal APIs]
        end
    end
    
    %% Data Layer - Private Subnet
    subgraph "Data Layer (Private Subnet)"
        Database[(🐘 PostgreSQL<br/>Encrypted at Rest<br/>Private Endpoints)]
        Cache[🔴 Redis Cache<br/>TLS Encryption<br/>Auth Required]
        Storage[📁 Object Storage<br/>S3 Bucket Policies<br/>Encryption]
    end
    
    %% Security Controls
    subgraph "Security Controls"
        subgraph "Identity & Access Management"
            IAM[👤 IAM Roles<br/>Least Privilege<br/>Policy Management]
            MFA[🔐 Multi-Factor Auth<br/>Time-based OTP<br/>Hardware Keys]
        end
        
        subgraph "Network Security"
            VPC[🏠 Virtual Private Cloud<br/>Network Isolation<br/>Subnet Segmentation]
            SecurityGroups[🔒 Security Groups<br/>Firewall Rules<br/>Port Restrictions]
            NACLs[🚧 Network ACLs<br/>Subnet-level Rules<br/>Stateless Filtering]
        end
        
        subgraph "Data Protection"
            Encryption[🔐 Encryption<br/>TLS 1.3 in Transit<br/>AES-256 at Rest]
            KeyManagement[🔑 Key Management<br/>AWS KMS<br/>Key Rotation]
            BackupEncryption[💾 Backup Encryption<br/>Automated Backups<br/>Cross-region Replication]
        end
        
        subgraph "Monitoring & Compliance"
            CloudTrail[📝 Audit Logging<br/>API Call Tracking<br/>Compliance Reports]
            GuardDuty[👀 Threat Detection<br/>Anomaly Detection<br/>IOC Monitoring]
            Inspector[🔍 Vulnerability Scanning<br/>Security Assessment<br/>Remediation]
        end
    end
    
    %% External Integrations
    subgraph "External Services (Secured)"
        LLMProviders[🧠 LLM Providers<br/>API Keys in Vault<br/>Rate Limited]
        BlockchainAPIs[⛓️ Blockchain APIs<br/>Webhook Validation<br/>IP Whitelisting]
        SocialAPIs[📱 Social APIs<br/>OAuth 2.0<br/>Scope Limitations]
    end
    
    %% Network Flow with Security
    Internet --> WAF
    WAF --> CDN
    CDN --> RateLimit
    RateLimit --> ALB
    
    %% DMZ Access
    ALB --> Frontend
    BastionHost -.->|SSH| Backend
    BastionHost -.->|SSH| Database
    
    %% Application Flow
    Frontend --> Gateway
    Gateway --> Backend
    Gateway --> AuthService
    Backend --> Microservices
    
    %% Data Access
    Backend --> Database
    Backend --> Cache
    Backend --> Storage
    AuthService --> Database
    Microservices --> Cache
    
    %% Security Control Connections
    VPC -.->|Contains| Frontend
    VPC -.->|Contains| Backend
    VPC -.->|Contains| Database
    
    SecurityGroups -.->|Protects| Frontend
    SecurityGroups -.->|Protects| Backend
    SecurityGroups -.->|Protects| Database
    
    IAM -.->|Controls| Backend
    IAM -.->|Controls| Database
    IAM -.->|Controls| Storage
    
    Encryption -.->|Secures| Database
    Encryption -.->|Secures| Cache
    Encryption -.->|Secures| Storage
    
    %% External Service Connections (Secured)
    Backend -.->|HTTPS + Auth| LLMProviders
    Microservices -.->|HTTPS + Auth| BlockchainAPIs
    Microservices -.->|OAuth 2.0| SocialAPIs
    
    %% Monitoring Connections
    CloudTrail -.->|Monitors| Backend
    CloudTrail -.->|Monitors| Database
    GuardDuty -.->|Monitors| VPC
    Inspector -.->|Scans| Backend
    Inspector -.->|Scans| Database
    
    %% Styling
    classDef edgeSecurity fill:#ffebee,stroke:#c62828,stroke-width:3px
    classDef dmz fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef application fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef data fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    classDef security fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef external fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    
    class WAF,CDN,RateLimit edgeSecurity
    class ALB,BastionHost dmz
    class Frontend,Gateway,Backend,AuthService,Microservices application
    class Database,Cache,Storage data
    class IAM,MFA,VPC,SecurityGroups,NACLs,Encryption,KeyManagement,BackupEncryption,CloudTrail,GuardDuty,Inspector security
    class LLMProviders,BlockchainAPIs,SocialAPIs external
```

---

## 📊 Data Flow Diagrams

```mermaid
flowchart LR
    %% User Interaction Data Flow
    subgraph "User Interaction Flow"
        User[👤 User Input<br/>Chat Message]
        Frontend[🖥️ Frontend<br/>React Component]
        WebSocket[🔌 WebSocket<br/>Real-time Connection]
        Backend[🚀 Backend API<br/>Message Handler]
    end
    
    %% Agent Processing Data Flow
    subgraph "Agent Processing Flow"
        AgentEngine[🤖 Agent Engine<br/>LLM Orchestrator]
        ContextDB[(🧠 Context Database<br/>Conversation History)]
        VectorDB[(🔍 Vector Database<br/>Semantic Memory)]
        LLMProvider[🧠 LLM Provider<br/>OpenAI/Anthropic]
    end
    
    %% Tool Execution Data Flow
    subgraph "Tool Execution Flow"
        ToolRouter[🔧 Tool Router<br/>Service Dispatcher]
        OnChainService[⛓️ OnChain Service<br/>Blockchain Analysis]
        SentimentService[💭 Sentiment Service<br/>Social Analysis]
        WebSearchTool[🔍 Web Search<br/>Real-time Info]
        
        %% External Data Sources
        BlockchainAPI[⛓️ Blockchain APIs<br/>Moralis, Alchemy]
        SocialAPI[📱 Social APIs<br/>Twitter, Discord]
        SearchAPI[🌐 Search APIs<br/>Tavily, Google]
    end
    
    %% Data Storage Flow
    subgraph "Data Storage Flow"
        MessageStore[(💬 Message Storage<br/>PostgreSQL)]
        AnalyticsStore[(📊 Analytics Storage<br/>Time Series)]
        FileStore[📁 File Storage<br/>S3 Compatible]
        CacheLayer[🔴 Cache Layer<br/>Redis]
    end
    
    %% Monitoring Data Flow
    subgraph "Monitoring Flow"
        MetricsCollector[📊 Metrics Collector<br/>Prometheus]
        LogAggregator[📝 Log Aggregator<br/>Langfuse]
        AlertManager[🚨 Alert Manager<br/>Notification System]
        Dashboard[📈 Dashboard<br/>Grafana]
    end
    
    %% Main Data Flow
    User -->|1. Send Message| Frontend
    Frontend -->|2. WebSocket| WebSocket
    WebSocket -->|3. Route Request| Backend
    Backend -->|4. Process Message| AgentEngine
    
    %% Context & Memory Flow
    AgentEngine -->|5a. Load Context| ContextDB
    AgentEngine -->|5b. Semantic Search| VectorDB
    ContextDB -->|6a. History Data| AgentEngine
    VectorDB -->|6b. Relevant Context| AgentEngine
    
    %% LLM Processing
    AgentEngine -->|7. Generate Prompt| LLMProvider
    LLMProvider -->|8. LLM Response| AgentEngine
    
    %% Tool Execution Flow
    AgentEngine -->|9. Tool Calls| ToolRouter
    ToolRouter -->|10a. OnChain Query| OnChainService
    ToolRouter -->|10b. Sentiment Query| SentimentService
    ToolRouter -->|10c. Web Search| WebSearchTool
    
    %% External API Calls
    OnChainService -->|11a. Blockchain Data| BlockchainAPI
    SentimentService -->|11b. Social Data| SocialAPI
    WebSearchTool -->|11c. Search Results| SearchAPI
    
    %% Tool Results Flow
    BlockchainAPI -->|12a. Chain Data| OnChainService
    SocialAPI -->|12b. Social Data| SentimentService
    SearchAPI -->|12c. Search Data| WebSearchTool
    
    OnChainService -->|13a. Analysis Results| ToolRouter
    SentimentService -->|13b. Sentiment Data| ToolRouter
    WebSearchTool -->|13c. Web Results| ToolRouter
    
    ToolRouter -->|14. Aggregated Results| AgentEngine
    
    %% Final Processing & Response
    AgentEngine -->|15. Final Prompt| LLMProvider
    LLMProvider -->|16. Final Response| AgentEngine
    AgentEngine -->|17. Format Response| Backend
    Backend -->|18. Stream Response| WebSocket
    WebSocket -->|19. Display Response| Frontend
    Frontend -->|20. Show to User| User
    
    %% Data Persistence Flow
    Backend -->|Store Message| MessageStore
    Backend -->|Cache Data| CacheLayer
    Backend -->|Store Files| FileStore
    Backend -->|Analytics| AnalyticsStore
    
    %% Monitoring Flow
    Backend -->|Metrics| MetricsCollector
    AgentEngine -->|Logs| LogAggregator
    ToolRouter -->|Performance| MetricsCollector
    
    MetricsCollector -->|Alerts| AlertManager
    LogAggregator -->|Traces| Dashboard
    MetricsCollector -->|Visualizations| Dashboard
    
    %% Styling
    classDef userFlow fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef agentFlow fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    classDef toolFlow fill:#fff8e1,stroke:#f57c00,stroke-width:2px
    classDef dataFlow fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef monitorFlow fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef externalAPI fill:#ffebee,stroke:#c62828,stroke-width:2px
    
    class User,Frontend,WebSocket,Backend userFlow
    class AgentEngine,ContextDB,VectorDB,LLMProvider agentFlow
    class ToolRouter,OnChainService,SentimentService,WebSearchTool toolFlow
    class MessageStore,AnalyticsStore,FileStore,CacheLayer dataFlow
    class MetricsCollector,LogAggregator,AlertManager,Dashboard monitorFlow
    class BlockchainAPI,SocialAPI,SearchAPI externalAPI
```

---

## ⚡ Event-Driven Architecture

```mermaid
flowchart TD
    %% Event Sources
    subgraph "Event Sources"
        UserEvents[👤 User Events<br/>Login, Logout, Messages]
        AgentEvents[🤖 Agent Events<br/>Created, Updated, Executed]
        SystemEvents[⚙️ System Events<br/>Health, Errors, Performance]
        IntegrationEvents[🔌 Integration Events<br/>API Calls, Webhooks]
    end
    
    %% Event Bus
    EventBus[🚌 Event Bus<br/>Redis Pub/Sub<br/>Message Routing]
    
    %% Event Processors
    subgraph "Event Processors"
        subgraph "Real-time Processing"
            WebSocketHandler[📡 WebSocket Handler<br/>Real-time Updates]
            NotificationService[🔔 Notification Service<br/>Push Notifications]
            CacheUpdater[💾 Cache Updater<br/>Real-time Cache Sync]
        end
        
        subgraph "Batch Processing"
            AnalyticsProcessor[📊 Analytics Processor<br/>Usage Metrics]
            ReportGenerator[📋 Report Generator<br/>Periodic Reports]
            DataAggregator[📈 Data Aggregator<br/>Statistical Processing]
        end
        
        subgraph "Background Tasks"
            EmailProcessor[📧 Email Processor<br/>Transactional Emails]
            FileProcessor[📁 File Processor<br/>Document Processing]
            CleanupProcessor[🧹 Cleanup Processor<br/>Data Retention]
        end
    end
    
    %% Event Store
    subgraph "Event Storage"
        EventStore[(📚 Event Store<br/>PostgreSQL<br/>Audit Trail)]
        EventCache[🔴 Event Cache<br/>Redis<br/>Recent Events]
        EventArchive[📦 Event Archive<br/>S3 Storage<br/>Long-term Retention]
    end
    
    %% External Integrations
    subgraph "External Systems"
        WebhookEndpoints[🔗 Webhook Endpoints<br/>External Services]
        APICallbacks[📞 API Callbacks<br/>Third-party Integrations]
        MonitoringAlerts[🚨 Monitoring Alerts<br/>Alert Systems]
    end
    
    %% Event Flow
    UserEvents --> EventBus
    AgentEvents --> EventBus
    SystemEvents --> EventBus
    IntegrationEvents --> EventBus
    
    %% Real-time Processing
    EventBus -->|Real-time| WebSocketHandler
    EventBus -->|Real-time| NotificationService
    EventBus -->|Real-time| CacheUpdater
    
    %% Batch Processing
    EventBus -->|Batch| AnalyticsProcessor
    EventBus -->|Batch| ReportGenerator
    EventBus -->|Batch| DataAggregator
    
    %% Background Processing
    EventBus -->|Background| EmailProcessor
    EventBus -->|Background| FileProcessor
    EventBus -->|Background| CleanupProcessor
    
    %% Event Storage
    EventBus --> EventStore
    EventBus --> EventCache
    EventStore --> EventArchive
    
    %% External Integrations
    EventBus --> WebhookEndpoints
    EventBus --> APICallbacks
    EventBus --> MonitoringAlerts
    
    %% Event Types & Schemas
    subgraph "Event Schemas"
        UserEventSchema[👤 User Event Schema<br/>{type, userId, timestamp, data}]
        AgentEventSchema[🤖 Agent Event Schema<br/>{type, agentId, sessionId, payload}]
        SystemEventSchema[⚙️ System Event Schema<br/>{type, severity, component, details}]
    end
    
    EventBus -.->|Schema Validation| UserEventSchema
    EventBus -.->|Schema Validation| AgentEventSchema
    EventBus -.->|Schema Validation| SystemEventSchema
    
    %% Error Handling
    DeadLetterQueue[💀 Dead Letter Queue<br/>Failed Events<br/>Manual Processing]
    EventBus -->|Failed Events| DeadLetterQueue
    
    %% Event Replay System
    EventReplay[🔄 Event Replay<br/>Historical Processing<br/>System Recovery]
    EventStore --> EventReplay
    EventReplay --> EventBus
    
    %% Styling
    classDef eventSource fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef eventBus fill:#e3f2fd,stroke:#1565c0,stroke-width:3px
    classDef processor fill:#fff8e1,stroke:#f57c00,stroke-width:2px
    classDef storage fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef external fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef schema fill:#e0f2f1,stroke:#00695c,stroke-width:2px
    classDef errorHandling fill:#ffebee,stroke:#c62828,stroke-width:2px
    
    class UserEvents,AgentEvents,SystemEvents,IntegrationEvents eventSource
    class EventBus eventBus
    class WebSocketHandler,NotificationService,CacheUpdater,AnalyticsProcessor,ReportGenerator,DataAggregator,EmailProcessor,FileProcessor,CleanupProcessor processor
    class EventStore,EventCache,EventArchive storage
    class WebhookEndpoints,APICallbacks,MonitoringAlerts external
    class UserEventSchema,AgentEventSchema,SystemEventSchema schema
    class DeadLetterQueue,EventReplay errorHandling
```

---

## 📊 Monitoring & Observability

```mermaid
graph TB
    %% Application Components
    subgraph "Application Layer"
        Frontend[🖥️ Frontend<br/>Next.js App<br/>User Interface]
        Backend[🚀 Backend API<br/>FastAPI<br/>Business Logic]
        AgentEngine[🤖 Agent Engine<br/>LLM Processing<br/>Tool Orchestration]
        Microservices[🔧 Microservices<br/>Analysis Services<br/>External Integrations]
        Database[(🐘 Database<br/>PostgreSQL<br/>Data Storage)]
        Cache[🔴 Redis Cache<br/>Session Storage<br/>Message Queue]
    end
    
    %% Metrics Collection
    subgraph "Metrics Collection"
        PrometheusAgent[📊 Prometheus Node Exporter<br/>System Metrics]
        AppMetrics[📈 Application Metrics<br/>Custom Metrics<br/>Business KPIs]
        
        subgraph "Metric Types"
            Counters[🔢 Counters<br/>API Requests<br/>Message Count]
            Gauges[📏 Gauges<br/>Active Users<br/>Queue Size]
            Histograms[📊 Histograms<br/>Response Times<br/>Request Duration]
            Summaries[📈 Summaries<br/>Percentiles<br/>SLA Metrics]
        end
    end
    
    %% Logging System
    subgraph "Logging & Tracing"
        AppLogs[📝 Application Logs<br/>Structured JSON<br/>Error Tracking]
        AccessLogs[🔍 Access Logs<br/>HTTP Requests<br/>API Usage]
        AuditLogs[📋 Audit Logs<br/>User Actions<br/>Security Events]
        
        subgraph "LLM Observability"
            Langfuse[🧠 Langfuse<br/>LLM Tracing<br/>Token Usage<br/>Cost Tracking]
            AIMetrics[🤖 AI Metrics<br/>Model Performance<br/>Response Quality]
        end
    end
    
    %% Monitoring Platform
    subgraph "Monitoring Platform"
        Prometheus[📊 Prometheus<br/>Time Series Database<br/>Metrics Storage]
        Grafana[📈 Grafana<br/>Visualization<br/>Dashboards]
        AlertManager[🚨 AlertManager<br/>Alert Routing<br/>Notification Management]
        
        subgraph "Dashboards"
            SystemDashboard[🖥️ System Dashboard<br/>Infrastructure Metrics<br/>Resource Usage]
            ApplicationDashboard[🚀 Application Dashboard<br/>API Performance<br/>Business Metrics]
            AIModelDashboard[🤖 AI Model Dashboard<br/>LLM Performance<br/>Cost Analysis]
            UserDashboard[👤 User Dashboard<br/>User Activity<br/>Engagement Metrics]
        end
    end
    
    %% Error Tracking & APM
    subgraph "Error Tracking & APM"
        Sentry[🐛 Sentry<br/>Error Tracking<br/>Performance Monitoring<br/>Release Tracking]
        
        subgraph "Error Categories"
            ApplicationErrors[❌ Application Errors<br/>500 Errors<br/>Exceptions]
            UserErrors[👤 User Errors<br/>400 Errors<br/>Validation Failures]
            IntegrationErrors[🔌 Integration Errors<br/>External API Failures<br/>Timeout Issues]
        end
    end
    
    %% Health Checks
    subgraph "Health Monitoring"
        HealthChecks[💊 Health Checks<br/>Service Status<br/>Dependency Checks]
        UptimeMonitoring[⏰ Uptime Monitoring<br/>External Monitoring<br/>SLA Tracking]
        SyntheticMonitoring[🤖 Synthetic Monitoring<br/>User Journey Testing<br/>API Testing]
    end
    
    %% Alert Channels
    subgraph "Alert Channels"
        SlackAlerts[💬 Slack Alerts<br/>Team Notifications<br/>Critical Issues]
        EmailAlerts[📧 Email Alerts<br/>Management Reports<br/>SLA Breaches]
        PagerDutyAlerts[📟 PagerDuty<br/>On-call Rotation<br/>Incident Management]
        WebhookAlerts[🔗 Webhook Alerts<br/>Custom Integrations<br/>Automation Triggers]
    end
    
    %% Data Flow - Metrics
    Frontend --> AppMetrics
    Backend --> AppMetrics
    AgentEngine --> AppMetrics
    Microservices --> AppMetrics
    Database --> PrometheusAgent
    Cache --> PrometheusAgent
    
    AppMetrics --> Counters
    AppMetrics --> Gauges
    AppMetrics --> Histograms
    AppMetrics --> Summaries
    
    %% Data Flow - Logging
    Frontend --> AppLogs
    Backend --> AppLogs
    AgentEngine --> AppLogs
    Microservices --> AppLogs
    
    Backend --> AccessLogs
    Backend --> AuditLogs
    
    AgentEngine --> Langfuse
    AgentEngine --> AIMetrics
    
    %% Monitoring Platform Flow
    AppMetrics --> Prometheus
    PrometheusAgent --> Prometheus
    Counters --> Prometheus
    Gauges --> Prometheus
    Histograms --> Prometheus
    Summaries --> Prometheus
    
    Prometheus --> Grafana
    Grafana --> SystemDashboard
    Grafana --> ApplicationDashboard
    Grafana --> AIModelDashboard
    Grafana --> UserDashboard
    
    Prometheus --> AlertManager
    
    %% Error Tracking Flow
    AppLogs --> Sentry
    Sentry --> ApplicationErrors
    Sentry --> UserErrors
    Sentry --> IntegrationErrors
    
    %% Health Monitoring Flow
    Backend --> HealthChecks
    Microservices --> HealthChecks
    Database --> HealthChecks
    Cache --> HealthChecks
    
    HealthChecks --> UptimeMonitoring
    HealthChecks --> SyntheticMonitoring
    
    %% Alert Distribution
    AlertManager --> SlackAlerts
    AlertManager --> EmailAlerts
    AlertManager --> PagerDutyAlerts
    AlertManager --> WebhookAlerts
    
    Sentry --> SlackAlerts
    UptimeMonitoring --> PagerDutyAlerts
    
    %% Styling
    classDef application fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef metrics fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    classDef logging fill:#fff8e1,stroke:#f57c00,stroke-width:2px
    classDef monitoring fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef errors fill:#ffebee,stroke:#c62828,stroke-width:2px
    classDef health fill:#e0f2f1,stroke:#00695c,stroke-width:2px
    classDef alerts fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    
    class Frontend,Backend,AgentEngine,Microservices,Database,Cache application
    class PrometheusAgent,AppMetrics,Counters,Gauges,Histograms,Summaries metrics
    class AppLogs,AccessLogs,AuditLogs,Langfuse,AIMetrics logging
    class Prometheus,Grafana,AlertManager,SystemDashboard,ApplicationDashboard,AIModelDashboard,UserDashboard monitoring
    class Sentry,ApplicationErrors,UserErrors,IntegrationErrors errors
    class HealthChecks,UptimeMonitoring,SyntheticMonitoring health
    class SlackAlerts,EmailAlerts,PagerDutyAlerts,WebhookAlerts alerts
```

---

## 📐 How to Use These Diagrams

### **🔧 For Developers**
1. **System Understanding**: Use High-Level Architecture for system overview
2. **Service Integration**: Reference Microservices Topology for API dependencies
3. **Data Modeling**: Follow Database Schema for data relationships
4. **Authentication**: Implement flows per Authentication diagram

### **🏗️ For DevOps/SREs**
1. **Infrastructure Planning**: Use Deployment Architecture for cloud setup
2. **Security Implementation**: Follow Network Security Architecture
3. **Monitoring Setup**: Implement per Monitoring & Observability diagram
4. **Event Processing**: Configure Event-Driven Architecture

### **🎨 For Product Managers**
1. **Feature Planning**: Understand Agent Workflow Pipeline
2. **User Experience**: Reference Data Flow for user interactions
3. **Tool Integration**: Plan new tools using Tool Integration Architecture
4. **Performance Monitoring**: Track metrics per Monitoring diagrams

### **📊 Diagram Maintenance**

| Update Trigger | Responsible | Frequency |
|---------------|------------|-----------|
| **Architecture Changes** | Solutions Architect | As needed |
| **New Microservices** | Backend Team | Per deployment |
| **Security Updates** | Security Team | Monthly |
| **Infrastructure Changes** | DevOps Team | Per release |

---

## 🔄 Diagram Updates

These diagrams are **living documentation** and should be updated when:

- **🏗️ System Architecture Changes**: New services, removed components
- **🔒 Security Updates**: New security measures, compliance requirements  
- **🚀 Deployment Changes**: Infrastructure updates, new environments
- **🔌 Integration Changes**: New external services, API changes
- **📊 Monitoring Updates**: New metrics, dashboard changes

**Last Updated**: January 15, 2025  
**Version**: 2.1.0  
**Next Review**: February 15, 2025

---

**🧙 Generated by BMad Master Architecture Framework**  
*A picture is worth a thousand words, a diagram is worth a thousand meetings.*
