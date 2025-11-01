# ❓ Frequently Asked Questions (FAQ)

## 📖 Table of Contents

- [🚀 Getting Started](#-getting-started)
- [⚙️ Installation & Setup](#️-installation--setup)
- [🔧 Configuration](#-configuration)
- [🐛 Troubleshooting](#-troubleshooting)
- [🏗️ Development](#️-development)
- [🔌 API & Integration](#-api--integration)
- [🤖 AI & Agents](#-ai--agents)
- [🔒 Security](#-security)
- [📊 Performance & Scaling](#-performance--scaling)
- [💼 Deployment](#-deployment)
- [🎯 Advanced Topics](#-advanced-topics)

---

## 🚀 Getting Started

### **Q: What is ChainLens AI Agent Platform?**
**A:** ChainLens is a comprehensive AI agent platform that enables developers to build, deploy, and manage intelligent agents with advanced tool integrations, blockchain analysis capabilities, and enterprise-grade security features.

### **Q: What are the system requirements?**
**A:** 
- **Python**: 3.11+ 
- **Node.js**: 18+ 
- **Docker**: Latest version with Docker Compose
- **Memory**: Minimum 8GB RAM (16GB recommended)
- **Storage**: 20GB+ available space
- **OS**: macOS, Linux, or Windows with WSL2

### **Q: How long does the initial setup take?**
**A:** Typically 15-30 minutes depending on your internet speed and system specifications. The automated `setup.py` script handles most of the complexity.

### **Q: Is there a hosted/cloud version available?**
**A:** Yes! Visit [chainlens.net](https://www.chainlens.net) for our hosted solution. The open-source version can be self-hosted for full control.

---

## ⚙️ Installation & Setup

### **Q: The setup.py script is failing. What should I do?**
**A:** Try these troubleshooting steps:

```bash
# 1. Check Python version
python --version  # Should be 3.11+

# 2. Clear any existing virtual environments
rm -rf .venv/

# 3. Run setup with verbose logging
python setup.py --verbose

# 4. Manual dependency installation if needed
pip install uv
uv sync
```

### **Q: Docker containers are not starting properly**
**A:** Common solutions:

```bash
# 1. Check Docker daemon is running
docker info

# 2. Reset Docker environment
docker compose down --volumes --remove-orphans
docker system prune -a

# 3. Rebuild containers from scratch
docker compose build --no-cache

# 4. Check port availability
lsof -i :3000,8000,5432,6379
```

### **Q: I'm getting "port already in use" errors**
**A:** Kill processes using required ports:

```bash
# Kill specific port processes
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
lsof -ti:5432 | xargs kill -9
lsof -ti:6379 | xargs kill -9

# Or use the provided script
cd microservices && ./kill-ports.sh
```

### **Q: Node.js dependencies won't install**
**A:** Ensure you're using pnpm (not npm):

```bash
# Install pnpm globally
npm install -g pnpm

# Clear cache and reinstall
cd frontend
pnpm store prune
pnpm install --frozen-lockfile
```

### **Q: Python dependencies conflict during installation**
**A:** Use UV for clean dependency resolution:

```bash
# Remove existing virtual environment
rm -rf .venv/

# Clean install with UV
pip install uv
uv sync --all-extras
```

---

## 🔧 Configuration

### **Q: Where do I put my API keys?**
**A:** Create `.env` files in the respective directories:

**Backend `.env`:**
```bash
# Core Services
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...

# External Services
TAVILY_API_KEY=your_tavily_key
FIRECRAWL_API_KEY=your_firecrawl_key
```

**Frontend `.env.local`:**
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### **Q: How do I configure Supabase for local development?**
**A:** Use the Supabase CLI:

```bash
# Install Supabase CLI
brew install supabase/tap/supabase  # macOS
# or npm install -g supabase

# Start local Supabase
supabase start

# Apply migrations
supabase db push

# Get connection details
supabase status
```

### **Q: Can I use different LLM providers?**
**A:** Yes! ChainLens supports multiple providers through LiteLLM:

- **OpenAI**: GPT-4, GPT-3.5
- **Anthropic**: Claude 3 (Opus, Sonnet, Haiku)
- **OpenRouter**: 100+ models
- **Azure OpenAI**: Enterprise deployments
- **Local Models**: Ollama, LM Studio

Configure in your `.env` file with appropriate API keys.

### **Q: How do I enable specific microservices?**
**A:** Edit `microservices/docker-compose.yml`:

```yaml
# Comment out services you don't need
services:
  # onchain-service:    # Disable blockchain analysis
  sentiment-service:    # Keep sentiment analysis
  tokenomics-service:   # Keep tokenomics
  # team-service:       # Disable team verification
```

---

## 🐛 Troubleshooting

### **Q: The frontend shows "Cannot connect to API" error**
**A:** Check backend connectivity:

```bash
# 1. Verify backend is running
curl http://localhost:8000/health

# 2. Check network connectivity
telnet localhost 8000

# 3. Review backend logs
cd backend && uv run uvicorn api:app --reload --log-level debug

# 4. Verify environment variables
cd frontend && cat .env.local
```

### **Q: Database migrations are failing**
**A:** Reset and reapply migrations:

```bash
# Supabase local reset
supabase db reset

# Manual PostgreSQL reset (if needed)
docker compose down postgres
docker volume rm chainlens_postgres_data
docker compose up postgres -d
```

### **Q: Agents are not responding to commands**
**A:** Debug agent execution:

```bash
# 1. Check agent background worker
cd backend
uv run dramatiq run_agent_background --verbose

# 2. Verify Redis connection
redis-cli ping  # Should return PONG

# 3. Check agent logs
tail -f logs/agent.log

# 4. Test agent directly
uv run python -c "from core.agent import test_agent; test_agent()"
```

### **Q: WebSocket connections are dropping**
**A:** Common solutions:

```bash
# 1. Check reverse proxy configuration (if using nginx)
# Add WebSocket upgrade headers

# 2. Increase timeout settings
# In your load balancer or reverse proxy

# 3. Verify WebSocket endpoint
curl -v --upgrade-insecure-requests \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  http://localhost:8000/ws
```

### **Q: Memory usage is too high**
**A:** Optimize resource usage:

```bash
# 1. Monitor resource usage
docker stats

# 2. Limit container memory
# Edit docker-compose.yml
services:
  backend:
    mem_limit: 2g
  
# 3. Clear Redis cache
redis-cli FLUSHALL

# 4. Restart services
docker compose restart
```

---

## 🏗️ Development

### **Q: How do I add a new custom tool for agents?**
**A:** Create tools in `backend/tools/`:

```python
# backend/tools/my_custom_tool.py
from .base import BaseTool
from typing import Dict, Any

class MyCustomTool(BaseTool):
    name = "my_custom_tool"
    description = "Describes what your tool does"
    
    def execute(self, **kwargs) -> Dict[str, Any]:
        # Your tool logic here
        return {
            "success": True,
            "result": "Tool output"
        }

# Register in backend/tools/__init__.py
from .my_custom_tool import MyCustomTool
TOOLS = [MyCustomTool, ...]
```

### **Q: How do I modify the agent prompt templates?**
**A:** Edit prompt files in `backend/prompts/`:

```python
# backend/prompts/system_prompts.py
CUSTOM_AGENT_PROMPT = """
You are a specialized AI agent for {domain}.
Your capabilities include:
- {capability_1}
- {capability_2}

Always respond with structured data.
"""

# Use in agent configuration
agent_config = {
    "system_prompt": CUSTOM_AGENT_PROMPT,
    "variables": {
        "domain": "blockchain analysis",
        "capability_1": "transaction analysis"
    }
}
```

### **Q: How do I add new API endpoints?**
**A:** Add routes in `backend/api.py`:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")

@router.get("/my-endpoint")
async def my_endpoint(param: str):
    return {"result": f"Hello {param}"}

# Include router in main app
app.include_router(router)
```

### **Q: How do I run tests during development?**
**A:** Use the testing commands:

```bash
# Frontend tests
cd frontend
pnpm test              # Unit tests
pnpm test:e2e         # End-to-end tests
pnpm test:coverage    # Coverage report

# Backend tests
cd backend
uv run pytest                    # All tests
uv run pytest tests/unit/        # Unit tests only
uv run pytest -v --cov          # Verbose with coverage

# Integration tests
./run-e2e-tests.sh    # Full E2E test suite
```

---

## 🔌 API & Integration

### **Q: What's the rate limit for API calls?**
**A:** Default rate limits (configurable):

- **Authenticated users**: 1000 requests/hour
- **Anonymous users**: 100 requests/hour
- **WebSocket connections**: 50 concurrent per user
- **Agent executions**: 10 concurrent per user

### **Q: How do I integrate with third-party services?**
**A:** Use the plugin system:

```python
# backend/plugins/my_integration.py
from .base import BaseIntegration

class MyServiceIntegration(BaseIntegration):
    def authenticate(self) -> bool:
        # Authentication logic
        pass
    
    def fetch_data(self, query: str) -> Dict:
        # Data fetching logic
        pass

# Register in configuration
INTEGRATIONS = {
    "my_service": MyServiceIntegration
}
```

### **Q: Can I use the API without the frontend?**
**A:** Absolutely! Full API documentation at:

- **Interactive Docs**: http://localhost:8000/docs
- **OpenAPI Spec**: http://localhost:8000/openapi.json
- **Redoc**: http://localhost:8000/redoc

Example API usage:

```bash
# Authenticate
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# Create agent session
curl -X POST http://localhost:8000/api/v1/sessions \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{"agent_type": "blockchain_analyst"}'
```

### **Q: How do I handle webhook integrations?**
**A:** Set up webhook endpoints:

```python
@app.post("/webhooks/{service_name}")
async def handle_webhook(
    service_name: str,
    payload: Dict[str, Any],
    request: Request
):
    # Verify webhook signature
    signature = request.headers.get("x-signature")
    if not verify_signature(payload, signature):
        raise HTTPException(401, "Invalid signature")
    
    # Process webhook data
    await process_webhook(service_name, payload)
    
    return {"status": "processed"}
```

---

## 🤖 AI & Agents

### **Q: Which LLM models work best with ChainLens?**
**A:** Recommended models by use case:

**General Purpose:**
- **GPT-4**: Best overall performance
- **Claude-3-Sonnet**: Great balance of speed/quality
- **GPT-3.5-Turbo**: Fast and cost-effective

**Coding Tasks:**
- **GPT-4**: Superior code generation
- **Claude-3-Opus**: Excellent for complex logic
- **Codellama**: Specialized coding model

**Analysis Tasks:**
- **GPT-4**: Best for complex reasoning
- **Claude-3**: Excellent analytical capabilities
- **Gemini-Pro**: Strong for data analysis

### **Q: How do I fine-tune agents for specific domains?**
**A:** Customize agent behavior:

```python
# Create domain-specific agent configuration
agent_config = {
    "model": "gpt-4",
    "system_prompt": "You are a DeFi analysis expert...",
    "tools": ["defi_analyzer", "token_metrics", "pool_analytics"],
    "parameters": {
        "temperature": 0.1,  # Lower for analytical tasks
        "max_tokens": 2000,
        "top_p": 0.9
    },
    "memory": {
        "type": "vector",
        "context_window": 10000
    }
}
```

### **Q: Can agents remember conversation history?**
**A:** Yes! ChainLens implements multiple memory strategies:

- **Short-term**: Recent conversation context
- **Long-term**: Vector database storage
- **Session**: Persistent within session
- **User**: Cross-session user memory

Configure memory in agent settings:

```python
memory_config = {
    "short_term_window": 10,  # Last 10 messages
    "long_term_enabled": True,
    "embedding_model": "text-embedding-3-small",
    "similarity_threshold": 0.8
}
```

### **Q: How do I handle agent errors and retries?**
**A:** Configure error handling:

```python
error_config = {
    "max_retries": 3,
    "retry_delay": 1.0,  # seconds
    "exponential_backoff": True,
    "fallback_model": "gpt-3.5-turbo",
    "error_recovery": {
        "timeout_errors": "retry_with_shorter_context",
        "rate_limit_errors": "exponential_backoff",
        "model_errors": "fallback_model"
    }
}
```

---

## 🔒 Security

### **Q: How is data encrypted and stored?**
**A:** Multi-layer encryption:

- **In Transit**: TLS 1.3 for all communications
- **At Rest**: AES-256 encryption in database
- **API Keys**: Stored in encrypted format
- **Sessions**: JWT tokens with short expiration
- **Local Storage**: Encrypted sensitive data

### **Q: Can I run ChainLens in an air-gapped environment?**
**A:** Yes, with modifications:

1. **Local LLM Models**: Use Ollama or similar
2. **Private Container Registry**: Host Docker images locally
3. **Internal DNS**: Configure internal service discovery
4. **Offline Documentation**: Generate static docs

```bash
# Example air-gapped setup
export OFFLINE_MODE=true
export LLM_PROVIDER=ollama
export LLM_BASE_URL=http://internal-llm:11434
docker compose -f docker-compose.airgap.yml up
```

### **Q: How do I enable audit logging?**
**A:** Configure comprehensive logging:

```python
# backend/config.py
AUDIT_CONFIG = {
    "enabled": True,
    "log_level": "INFO",
    "events": [
        "user_login",
        "api_calls",
        "agent_executions",
        "data_access",
        "configuration_changes"
    ],
    "storage": "database",  # or "file", "s3"
    "retention_days": 90
}
```

### **Q: What compliance standards does ChainLens support?**
**A:** Current compliance support:

- **SOC 2 Type II**: Security controls framework
- **GDPR**: Data privacy and user rights
- **CCPA**: California privacy regulations
- **HIPAA**: Healthcare data protection (with configuration)
- **NIST Cybersecurity Framework**: Security best practices

---

## 📊 Performance & Scaling

### **Q: How do I optimize performance for large datasets?**
**A:** Performance optimization strategies:

```python
# 1. Database optimization
DATABASE_CONFIG = {
    "connection_pool_size": 20,
    "max_overflow": 30,
    "pool_pre_ping": True,
    "pool_recycle": 3600
}

# 2. Caching configuration
REDIS_CONFIG = {
    "maxmemory": "2gb",
    "maxmemory_policy": "allkeys-lru",
    "cache_ttl": 3600
}

# 3. Agent optimization
AGENT_CONFIG = {
    "concurrent_limit": 5,
    "timeout_seconds": 300,
    "memory_optimization": True,
    "batch_processing": True
}
```

### **Q: How do I scale to multiple servers?**
**A:** Horizontal scaling setup:

```yaml
# docker-compose.scale.yml
services:
  backend:
    deploy:
      replicas: 3
    environment:
      - CLUSTER_MODE=true
      - NODE_ID=${NODE_ID}
  
  redis:
    command: redis-server --appendonly yes --cluster-enabled yes
  
  postgres:
    environment:
      - POSTGRES_REPLICA_MODE=slave
```

### **Q: What are the resource requirements for production?**
**A:** Recommended production specs:

**Small (< 100 users):**
- CPU: 4 cores
- RAM: 16GB
- Storage: 100GB SSD
- Network: 100 Mbps

**Medium (100-1000 users):**
- CPU: 8 cores  
- RAM: 32GB
- Storage: 500GB SSD
- Network: 1 Gbps

**Large (1000+ users):**
- CPU: 16+ cores
- RAM: 64GB+
- Storage: 1TB+ SSD
- Network: 10 Gbps
- Load Balancer: Required
- Database: Dedicated cluster

---

## 💼 Deployment

### **Q: How do I deploy to AWS/GCP/Azure?**
**A:** Cloud deployment guides:

**AWS Deployment:**
```bash
# Use provided Terraform configurations
cd deployment/aws
terraform init
terraform plan -var="environment=prod"
terraform apply
```

**Docker Swarm:**
```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-stack.yml chainlens
```

**Kubernetes:**
```bash
# Apply Kubernetes manifests
kubectl apply -f deployment/k8s/
kubectl get pods -n chainlens
```

### **Q: How do I set up SSL/HTTPS?**
**A:** SSL configuration options:

**Option 1: Let's Encrypt with Traefik**
```yaml
# docker-compose.prod.yml
services:
  traefik:
    image: traefik:v2.10
    command:
      - --certificatesresolvers.letsencrypt.acme.email=admin@yoursite.com
      - --certificatesresolvers.letsencrypt.acme.storage=/acme.json
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
```

**Option 2: Custom SSL certificates**
```bash
# Place certificates in ssl/ directory
ssl/
├── cert.pem
├── key.pem
└── ca.pem
```

### **Q: How do I set up monitoring and alerting?**
**A:** Monitoring stack configuration:

```yaml
# monitoring/docker-compose.yml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
  
  grafana:
    image: grafana/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=secure_password
  
  alertmanager:
    image: prom/alertmanager
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml
```

---

## 🎯 Advanced Topics

### **Q: How do I implement custom authentication providers?**
**A:** Create custom auth provider:

```python
# backend/auth/providers/custom_provider.py
from .base import BaseAuthProvider

class CustomAuthProvider(BaseAuthProvider):
    def authenticate(self, credentials: Dict) -> UserInfo:
        # Custom authentication logic
        pass
    
    def get_user_info(self, token: str) -> UserInfo:
        # Fetch user information
        pass

# Register provider
AUTH_PROVIDERS = {
    "custom": CustomAuthProvider
}
```

### **Q: Can I create multi-tenant deployments?**
**A:** Yes! Enable tenant isolation:

```python
# backend/core/tenancy.py
TENANT_CONFIG = {
    "isolation_level": "database",  # "schema" or "row"
    "tenant_identification": "subdomain",  # "header" or "path"
    "default_tenant": "main",
    "tenant_specific_configs": True
}
```

### **Q: How do I integrate with enterprise systems (SSO, LDAP)?**
**A:** Enterprise integration setup:

```python
# SAML SSO integration
SAML_CONFIG = {
    "entity_id": "https://your-domain.com",
    "sso_url": "https://idp.company.com/sso",
    "x509_cert": "path/to/cert.pem",
    "attribute_mapping": {
        "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        "name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
    }
}

# LDAP integration
LDAP_CONFIG = {
    "server": "ldap://ldap.company.com",
    "bind_dn": "cn=admin,dc=company,dc=com",
    "user_base": "ou=users,dc=company,dc=com",
    "group_base": "ou=groups,dc=company,dc=com"
}
```

### **Q: How do I contribute back to the project?**
**A:** Follow our contribution process:

1. **Fork & Clone**: Fork repository and clone locally
2. **Branch**: Create feature branch (`git checkout -b feature/amazing-feature`)
3. **Develop**: Follow coding standards and add tests
4. **Test**: Run full test suite (`./run-tests.sh`)
5. **Commit**: Use conventional commits (`feat: add amazing feature`)
6. **Pull Request**: Submit PR with detailed description
7. **Review**: Collaborate with maintainers on feedback

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed guidelines.

---

## 🔍 Can't Find Your Answer?

### **Get Help:**

- **📚 Documentation**: [https://docs.chainlens.net](https://docs.chainlens.net)
- **💬 Discord**: [https://discord.gg/Py6pCBUUPw](https://discord.gg/Py6pCBUUPw)
- **🐛 GitHub Issues**: [https://github.com/deptrai/chainlens/issues](https://github.com/deptrai/chainlens/issues)
- **📧 Email**: support@chainlens.net

### **Community Resources:**

- **🧑‍💻 Stack Overflow**: Tag questions with `chainlens-agent`
- **🎥 YouTube**: Tutorials and walkthroughs
- **📝 Blog**: Technical articles and updates
- **🗓️ Office Hours**: Weekly community Q&A sessions

---

**Last Updated**: January 15, 2025  
**Version**: 2.1.0

**🧙 Generated by BMad Master FAQ System**  
*Questions are the beginning of wisdom. Keep asking, keep learning.*
