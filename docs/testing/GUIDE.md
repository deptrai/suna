# 🧪 Comprehensive Testing Guide

## 📖 Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Testing Pyramid](#testing-pyramid)
- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [End-to-End Testing](#end-to-end-testing)
- [Performance Testing](#performance-testing)
- [Security Testing](#security-testing)
- [API Testing](#api-testing)
- [Test Data Management](#test-data-management)
- [Test Environment Setup](#test-environment-setup)
- [Continuous Testing](#continuous-testing)
- [Quality Metrics](#quality-metrics)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Testing Philosophy

### **🧭 Core Testing Principles**

At Suna, we believe in **Quality by Design** - building quality into every layer of our system from the ground up. Our testing strategy follows these fundamental principles:

1. **🔺 Test Pyramid Approach**: Heavy on unit tests, moderate integration tests, light E2E tests
2. **⚡ Shift-Left Testing**: Catch bugs early in the development cycle
3. **🤖 Automation First**: Automate everything that can be automated
4. **📊 Quality Metrics**: Measure and improve test effectiveness continuously
5. **🔒 Security by Default**: Security testing integrated at every level
6. **🎭 Real-world Scenarios**: Tests that reflect actual user behavior
7. **⚖️ Risk-based Testing**: Focus testing effort on high-risk areas

### **🏗️ Testing Architecture**

```mermaid
graph TB
    A[Developer] --> B[Unit Tests]
    A --> C[Integration Tests]
    
    B --> D[CI Pipeline]
    C --> D
    
    D --> E[E2E Tests]
    D --> F[Security Tests]
    D --> G[Performance Tests]
    
    E --> H[Staging Environment]
    F --> H
    G --> H
    
    H --> I[Production Deployment]
    I --> J[Monitoring & Alerts]
```

---

## 🔺 Testing Pyramid

### **📊 Test Distribution**

| Test Type | Percentage | Speed | Cost | Confidence |
|-----------|-----------|--------|------|------------|
| **Unit Tests** | 70% | ⚡ Fast | 💚 Low | 🟡 Medium |
| **Integration Tests** | 20% | 🟡 Medium | 🟡 Medium | 🟡 Medium |
| **E2E Tests** | 10% | 🔴 Slow | 🔴 High | 🟢 High |

### **🎯 Test Coverage Goals**

- **Unit Test Coverage**: ≥ 90%
- **Integration Coverage**: ≥ 80%
- **Critical Path E2E**: 100%
- **API Coverage**: ≥ 95%
- **Security Coverage**: 100%

---

## 🔬 Unit Testing

### **🎯 Frontend Unit Testing (Jest + React Testing Library)**

#### **Component Testing**
```typescript
// __tests__/components/AgentChat.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentChat } from '@/components/AgentChat';
import { mockAgentResponse } from '@/test-utils/mocks';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

describe('AgentChat Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    );
  };

  test('renders chat interface correctly', () => {
    renderWithProviders(<AgentChat sessionId="test-session" />);
    
    expect(screen.getByPlaceholderText(/ask your ai agent/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  test('sends message and displays response', async () => {
    const mockSendMessage = jest.fn().mockResolvedValue(mockAgentResponse);
    
    renderWithProviders(<AgentChat sessionId="test-session" />);
    
    const input = screen.getByPlaceholderText(/ask your ai agent/i);
    const sendButton = screen.getByRole('button', { name: /send/i });

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText(/test message/i)).toBeInTheDocument();
    });
  });

  test('handles error states gracefully', async () => {
    const mockSendMessage = jest.fn().mockRejectedValue(new Error('API Error'));
    
    renderWithProviders(<AgentChat sessionId="test-session" />);
    
    // Trigger error scenario
    const input = screen.getByPlaceholderText(/ask your ai agent/i);
    fireEvent.change(input, { target: { value: 'Error message' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
    });
  });
});
```

#### **Hook Testing**
```typescript
// __tests__/hooks/useAgent.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAgent } from '@/hooks/useAgent';
import { mockAgent } from '@/test-utils/mocks';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useAgent Hook', () => {
  test('fetches agent data successfully', async () => {
    const { result } = renderHook(
      () => useAgent('test-agent-id'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockAgent);
  });

  test('handles loading and error states', async () => {
    const { result } = renderHook(
      () => useAgent('invalid-id'),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
```

### **🎯 Backend Unit Testing (Pytest + FastAPI)**

#### **API Endpoint Testing**
```python
# tests/unit/test_agents_api.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
from api import app
from core.models import Agent, Session
from test_utils.fixtures import mock_agent_data, mock_session_data

client = TestClient(app)

class TestAgentsAPI:
    
    @patch('core.services.agent_service.create_agent')
    def test_create_agent_success(self, mock_create):
        """Test successful agent creation"""
        mock_create.return_value = Agent(**mock_agent_data)
        
        response = client.post(
            "/api/v1/agents",
            json={
                "name": "Test Agent",
                "type": "blockchain_analyst",
                "configuration": {
                    "model": "gpt-4",
                    "temperature": 0.1
                }
            },
            headers={"Authorization": "Bearer valid-token"}
        )
        
        assert response.status_code == 201
        assert response.json()["name"] == "Test Agent"
        mock_create.assert_called_once()

    def test_create_agent_validation_error(self):
        """Test agent creation with invalid data"""
        response = client.post(
            "/api/v1/agents",
            json={"name": ""},  # Invalid empty name
            headers={"Authorization": "Bearer valid-token"}
        )
        
        assert response.status_code == 422
        assert "name" in response.json()["detail"][0]["loc"]

    @patch('core.services.agent_service.get_agent')
    def test_get_agent_not_found(self, mock_get):
        """Test getting non-existent agent"""
        mock_get.return_value = None
        
        response = client.get(
            "/api/v1/agents/non-existent-id",
            headers={"Authorization": "Bearer valid-token"}
        )
        
        assert response.status_code == 404
        assert "Agent not found" in response.json()["detail"]
```

#### **Service Layer Testing**
```python
# tests/unit/test_agent_service.py
import pytest
from unittest.mock import Mock, AsyncMock, patch
from core.services.agent_service import AgentService
from core.models import Agent, AgentConfig
from core.exceptions import AgentNotFoundError, InvalidConfigurationError

class TestAgentService:
    
    @pytest.fixture
    def agent_service(self):
        return AgentService()
    
    @pytest.fixture
    def mock_db_session(self):
        return Mock()
    
    @pytest.mark.asyncio
    async def test_create_agent_success(self, agent_service, mock_db_session):
        """Test successful agent creation"""
        agent_data = {
            "name": "Test Agent",
            "type": "blockchain_analyst",
            "configuration": {
                "model": "gpt-4",
                "temperature": 0.1,
                "max_tokens": 2000
            }
        }
        
        with patch.object(agent_service, '_validate_configuration') as mock_validate:
            mock_validate.return_value = True
            
            result = await agent_service.create_agent(
                agent_data, 
                user_id="test-user",
                db=mock_db_session
            )
            
            assert isinstance(result, Agent)
            assert result.name == "Test Agent"
            mock_validate.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_agent_invalid_config(self, agent_service):
        """Test agent creation with invalid configuration"""
        agent_data = {
            "name": "Test Agent",
            "type": "blockchain_analyst",
            "configuration": {
                "model": "invalid-model",  # Invalid model
                "temperature": 2.0  # Invalid temperature
            }
        }
        
        with pytest.raises(InvalidConfigurationError) as exc_info:
            await agent_service.create_agent(agent_data, user_id="test-user")
        
        assert "Invalid model" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_execute_agent_task(self, agent_service):
        """Test agent task execution"""
        mock_agent = Mock(spec=Agent)
        mock_agent.id = "test-agent-id"
        mock_agent.configuration = AgentConfig(model="gpt-4", temperature=0.1)
        
        with patch('core.llm.LLMService') as mock_llm_service:
            mock_llm = Mock()
            mock_llm.generate_response = AsyncMock(return_value="Test response")
            mock_llm_service.return_value = mock_llm
            
            result = await agent_service.execute_task(
                agent=mock_agent,
                task="Analyze Bitcoin price trends",
                context={}
            )
            
            assert result.response == "Test response"
            mock_llm.generate_response.assert_called_once()
```

### **🎯 Microservices Unit Testing (Jest + NestJS)**

#### **Controller Testing**
```typescript
// microservices/onchain-service/src/onchain/onchain.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { OnchainController } from './onchain.controller';
import { OnchainService } from './onchain.service';
import { NotFoundException } from '@nestjs/common';

describe('OnchainController', () => {
  let controller: OnchainController;
  let service: OnchainService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnchainController],
      providers: [
        {
          provide: OnchainService,
          useValue: {
            analyzeToken: jest.fn(),
            getTransactionHistory: jest.fn(),
            validateAddress: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OnchainController>(OnchainController);
    service = module.get<OnchainService>(OnchainService);
  });

  describe('analyzeToken', () => {
    it('should return token analysis', async () => {
      const mockAnalysis = {
        address: '0x123...',
        symbol: 'TEST',
        totalSupply: '1000000',
        holders: 1500,
        liquidityScore: 85,
      };

      jest.spyOn(service, 'analyzeToken').mockResolvedValue(mockAnalysis);

      const result = await controller.analyzeToken('0x123...');

      expect(result).toEqual(mockAnalysis);
      expect(service.analyzeToken).toHaveBeenCalledWith('0x123...');
    });

    it('should handle token not found', async () => {
      jest.spyOn(service, 'analyzeToken').mockRejectedValue(
        new NotFoundException('Token not found')
      );

      await expect(controller.analyzeToken('invalid-address')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getTransactionHistory', () => {
    it('should return transaction history with pagination', async () => {
      const mockHistory = {
        transactions: [
          { hash: '0xabc...', value: '1.5', timestamp: 1234567890 },
          { hash: '0xdef...', value: '0.5', timestamp: 1234567891 },
        ],
        totalCount: 2,
        hasMore: false,
      };

      jest.spyOn(service, 'getTransactionHistory').mockResolvedValue(mockHistory);

      const result = await controller.getTransactionHistory(
        '0x123...',
        { page: 1, limit: 10 }
      );

      expect(result).toEqual(mockHistory);
    });
  });
});
```

#### **Service Testing**
```typescript
// microservices/onchain-service/src/onchain/onchain.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { OnchainService } from './onchain.service';
import { Web3Service } from '../web3/web3.service';
import { CacheService } from '../cache/cache.service';

describe('OnchainService', () => {
  let service: OnchainService;
  let web3Service: Web3Service;
  let cacheService: CacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnchainService,
        {
          provide: Web3Service,
          useValue: {
            getTokenInfo: jest.fn(),
            getTransactions: jest.fn(),
            isValidAddress: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OnchainService>(OnchainService);
    web3Service = module.get<Web3Service>(Web3Service);
    cacheService = module.get<CacheService>(CacheService);
  });

  describe('analyzeToken', () => {
    it('should analyze token and cache results', async () => {
      const tokenAddress = '0x123...';
      const mockTokenInfo = {
        symbol: 'TEST',
        name: 'Test Token',
        totalSupply: '1000000',
        decimals: 18,
      };

      jest.spyOn(cacheService, 'get').mockResolvedValue(null);
      jest.spyOn(web3Service, 'getTokenInfo').mockResolvedValue(mockTokenInfo);
      jest.spyOn(cacheService, 'set').mockResolvedValue(undefined);

      const result = await service.analyzeToken(tokenAddress);

      expect(result).toMatchObject({
        address: tokenAddress,
        symbol: mockTokenInfo.symbol,
        name: mockTokenInfo.name,
      });
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining(tokenAddress),
        expect.any(Object),
        3600 // 1 hour cache
      );
    });

    it('should return cached results if available', async () => {
      const tokenAddress = '0x123...';
      const cachedResult = { address: tokenAddress, symbol: 'CACHED' };

      jest.spyOn(cacheService, 'get').mockResolvedValue(cachedResult);

      const result = await service.analyzeToken(tokenAddress);

      expect(result).toEqual(cachedResult);
      expect(web3Service.getTokenInfo).not.toHaveBeenCalled();
    });
  });
});
```

---

## 🔗 Integration Testing

### **🎯 API Integration Tests**

#### **Backend API Integration**
```python
# tests/integration/test_agent_workflow.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from api import app
from database import get_db, engine
from core.models import Base

# Test database setup
@pytest.fixture(scope="function")
def test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client(test_db):
    return TestClient(app)

@pytest.fixture
def authenticated_headers():
    # Create test user and return auth headers
    return {"Authorization": "Bearer test-token"}

class TestAgentWorkflowIntegration:
    
    def test_complete_agent_workflow(self, client, authenticated_headers):
        """Test complete agent workflow from creation to execution"""
        
        # 1. Create a new agent
        create_response = client.post(
            "/api/v1/agents",
            json={
                "name": "Integration Test Agent",
                "type": "blockchain_analyst",
                "configuration": {
                    "model": "gpt-4",
                    "temperature": 0.1,
                    "max_tokens": 2000,
                    "tools": ["web_search", "blockchain_analyzer"]
                }
            },
            headers=authenticated_headers
        )
        
        assert create_response.status_code == 201
        agent_id = create_response.json()["id"]
        
        # 2. Create a session with the agent
        session_response = client.post(
            "/api/v1/sessions",
            json={
                "agent_id": agent_id,
                "name": "Test Session"
            },
            headers=authenticated_headers
        )
        
        assert session_response.status_code == 201
        session_id = session_response.json()["id"]
        
        # 3. Send message to agent
        message_response = client.post(
            f"/api/v1/sessions/{session_id}/messages",
            json={
                "content": "Analyze the recent performance of Bitcoin",
                "message_type": "user"
            },
            headers=authenticated_headers
        )
        
        assert message_response.status_code == 201
        message_id = message_response.json()["id"]
        
        # 4. Wait for agent response (in real test, this would be WebSocket)
        # Simulate polling for response
        import time
        time.sleep(2)
        
        messages_response = client.get(
            f"/api/v1/sessions/{session_id}/messages",
            headers=authenticated_headers
        )
        
        assert messages_response.status_code == 200
        messages = messages_response.json()
        
        # Verify we have both user message and agent response
        assert len(messages) >= 2
        agent_message = next(
            msg for msg in messages 
            if msg["message_type"] == "agent"
        )
        assert "Bitcoin" in agent_message["content"]

    def test_microservices_integration(self, client, authenticated_headers):
        """Test integration with microservices"""
        
        # Test onchain service integration
        response = client.post(
            "/api/v1/agents/execute",
            json={
                "agent_id": "test-agent",
                "task": "analyze_token",
                "parameters": {
                    "token_address": "0xa0b86a33e6776ca5c2a4d5d8176ec9c3a9a6e9a0"
                }
            },
            headers=authenticated_headers
        )
        
        assert response.status_code == 200
        result = response.json()
        assert "token_analysis" in result
        assert result["token_analysis"]["address"] == "0xa0b86a33e6776ca5c2a4d5d8176ec9c3a9a6e9a0"

    def test_database_transactions(self, client, authenticated_headers):
        """Test database transaction integrity"""
        
        # Create agent and session in single transaction
        response = client.post(
            "/api/v1/agents/with-session",
            json={
                "agent": {
                    "name": "Transaction Test Agent",
                    "type": "general"
                },
                "session": {
                    "name": "Transaction Test Session"
                }
            },
            headers=authenticated_headers
        )
        
        if response.status_code == 500:
            # Verify rollback - neither agent nor session should exist
            agents_response = client.get("/api/v1/agents", headers=authenticated_headers)
            agents = agents_response.json()
            assert not any(agent["name"] == "Transaction Test Agent" for agent in agents)
        else:
            assert response.status_code == 201
            # Verify both agent and session were created
            result = response.json()
            assert "agent_id" in result
            assert "session_id" in result
```

### **🎯 Database Integration Tests**

```python
# tests/integration/test_database_operations.py
import pytest
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from core.models import Agent, Session as AgentSession, Message
from core.services import agent_service, session_service

class TestDatabaseIntegration:
    
    @pytest.fixture
    def db_session(self):
        connection = engine.connect()
        transaction = connection.begin()
        session = Session(bind=connection)
        
        yield session
        
        session.close()
        transaction.rollback()
        connection.close()

    def test_agent_crud_operations(self, db_session):
        """Test complete CRUD operations for Agent model"""
        
        # Create
        agent_data = {
            "name": "Test Agent",
            "type": "blockchain_analyst",
            "user_id": "test-user",
            "configuration": {
                "model": "gpt-4",
                "temperature": 0.1
            }
        }
        
        agent = agent_service.create_agent(agent_data, db=db_session)
        assert agent.id is not None
        assert agent.name == "Test Agent"
        
        # Read
        retrieved_agent = agent_service.get_agent(agent.id, db=db_session)
        assert retrieved_agent.name == "Test Agent"
        
        # Update
        updated_agent = agent_service.update_agent(
            agent.id,
            {"name": "Updated Agent"},
            db=db_session
        )
        assert updated_agent.name == "Updated Agent"
        
        # Delete
        deleted = agent_service.delete_agent(agent.id, db=db_session)
        assert deleted is True
        
        # Verify deletion
        deleted_agent = agent_service.get_agent(agent.id, db=db_session)
        assert deleted_agent is None

    def test_cascading_deletes(self, db_session):
        """Test cascading delete operations"""
        
        # Create agent
        agent = Agent(
            name="Cascade Test Agent",
            type="general",
            user_id="test-user"
        )
        db_session.add(agent)
        db_session.commit()
        
        # Create session
        session = AgentSession(
            name="Test Session",
            agent_id=agent.id,
            user_id="test-user"
        )
        db_session.add(session)
        db_session.commit()
        
        # Create messages
        messages = [
            Message(
                content=f"Message {i}",
                message_type="user",
                session_id=session.id
            ) for i in range(3)
        ]
        db_session.add_all(messages)
        db_session.commit()
        
        # Delete agent should cascade to sessions and messages
        db_session.delete(agent)
        db_session.commit()
        
        # Verify cascade
        assert db_session.query(AgentSession).filter_by(id=session.id).first() is None
        assert db_session.query(Message).filter_by(session_id=session.id).count() == 0

    def test_concurrent_access(self, db_session):
        """Test concurrent database access patterns"""
        import threading
        import time
        
        results = []
        errors = []
        
        def create_agent(index):
            try:
                agent = Agent(
                    name=f"Concurrent Agent {index}",
                    type="general",
                    user_id=f"user-{index}"
                )
                db_session.add(agent)
                db_session.commit()
                results.append(agent.id)
            except Exception as e:
                errors.append(str(e))
        
        # Create multiple threads
        threads = []
        for i in range(5):
            thread = threading.Thread(target=create_agent, args=(i,))
            threads.append(thread)
            thread.start()
        
        # Wait for all threads
        for thread in threads:
            thread.join()
        
        # Verify results
        assert len(results) == 5
        assert len(errors) == 0
        assert len(set(results)) == 5  # All unique IDs
```

---

## 🔄 End-to-End Testing

### **🎭 Frontend E2E Tests (Playwright)**

#### **User Workflow Tests**
```typescript
// tests/e2e/agent-workflow.spec.ts
import { test, expect, Page } from '@playwright/test';

test.describe('Agent Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'test@example.com');
    await page.fill('[data-testid=password]', 'testpassword');
    await page.click('[data-testid=login-button]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('complete agent creation and chat workflow', async ({ page }) => {
    // Navigate to agent creation
    await page.click('[data-testid=create-agent-button]');
    await expect(page).toHaveURL('/agents/create');

    // Fill agent creation form
    await page.fill('[data-testid=agent-name]', 'E2E Test Agent');
    await page.selectOption('[data-testid=agent-type]', 'blockchain_analyst');
    
    // Configure advanced settings
    await page.click('[data-testid=advanced-settings]');
    await page.selectOption('[data-testid=model-select]', 'gpt-4');
    await page.fill('[data-testid=temperature]', '0.1');
    
    // Add tools
    await page.check('[data-testid=tool-web_search]');
    await page.check('[data-testid=tool-blockchain_analyzer]');
    
    // Create agent
    await page.click('[data-testid=create-agent-submit]');
    
    // Wait for success message and redirect
    await expect(page.locator('[data-testid=success-message]')).toContainText('Agent created successfully');
    await expect(page).toHaveURL(/\/agents\/[a-z0-9-]+/);
    
    // Start chat session
    await page.click('[data-testid=start-chat-button]');
    
    // Send message
    const chatInput = page.locator('[data-testid=chat-input]');
    await chatInput.fill('Analyze the recent performance of Bitcoin and provide insights');
    await page.click('[data-testid=send-button]');
    
    // Wait for agent response
    await expect(page.locator('[data-testid=agent-message]').first()).toBeVisible({ timeout: 30000 });
    
    // Verify response contains expected content
    const agentResponse = await page.locator('[data-testid=agent-message]').first().textContent();
    expect(agentResponse).toContain('Bitcoin');
    
    // Test follow-up message
    await chatInput.fill('What are the key risks to consider?');
    await page.click('[data-testid=send-button]');
    
    // Wait for second response
    await expect(page.locator('[data-testid=agent-message]').nth(1)).toBeVisible({ timeout: 30000 });
    
    // Verify conversation history
    const messages = page.locator('[data-testid=message]');
    await expect(messages).toHaveCount(4); // 2 user + 2 agent messages
  });

  test('agent management workflow', async ({ page }) => {
    // Create test agent first
    await createTestAgent(page, 'Management Test Agent');
    
    // Navigate to agents list
    await page.goto('/agents');
    
    // Find created agent
    const agentCard = page.locator('[data-testid=agent-card]', { hasText: 'Management Test Agent' });
    await expect(agentCard).toBeVisible();
    
    // Test edit functionality
    await agentCard.locator('[data-testid=edit-agent-button]').click();
    await expect(page).toHaveURL(/\/agents\/[a-z0-9-]+\/edit/);
    
    // Update agent name
    await page.fill('[data-testid=agent-name]', 'Updated Management Test Agent');
    await page.click('[data-testid=save-changes-button]');
    
    // Verify update
    await expect(page.locator('[data-testid=success-message]')).toContainText('Agent updated successfully');
    
    // Test clone functionality
    await page.goto('/agents');
    const updatedAgentCard = page.locator('[data-testid=agent-card]', { hasText: 'Updated Management Test Agent' });
    await updatedAgentCard.locator('[data-testid=clone-agent-button]').click();
    
    // Verify clone dialog and create clone
    await expect(page.locator('[data-testid=clone-dialog]')).toBeVisible();
    await page.fill('[data-testid=clone-name]', 'Cloned Agent');
    await page.click('[data-testid=confirm-clone-button]');
    
    // Verify clone created
    await expect(page.locator('[data-testid=agent-card]', { hasText: 'Cloned Agent' })).toBeVisible();
    
    // Test delete functionality
    await page.locator('[data-testid=agent-card]', { hasText: 'Cloned Agent' })
      .locator('[data-testid=delete-agent-button]').click();
    
    await expect(page.locator('[data-testid=delete-confirmation-dialog]')).toBeVisible();
    await page.click('[data-testid=confirm-delete-button]');
    
    // Verify deletion
    await expect(page.locator('[data-testid=agent-card]', { hasText: 'Cloned Agent' })).not.toBeVisible();
  });

  test('error handling and edge cases', async ({ page }) => {
    // Test network error handling
    await page.route('**/api/v1/agents', route => route.abort());
    
    await page.goto('/agents');
    await expect(page.locator('[data-testid=error-message]')).toContainText('Failed to load agents');
    
    // Test retry functionality
    await page.unroute('**/api/v1/agents');
    await page.click('[data-testid=retry-button]');
    await expect(page.locator('[data-testid=agents-list]')).toBeVisible();
    
    // Test form validation
    await page.click('[data-testid=create-agent-button]');
    await page.click('[data-testid=create-agent-submit]');
    
    // Verify validation errors
    await expect(page.locator('[data-testid=error-agent-name]')).toContainText('Agent name is required');
    await expect(page.locator('[data-testid=error-agent-type]')).toContainText('Agent type is required');
  });
});

// Helper function
async function createTestAgent(page: Page, name: string) {
  await page.goto('/agents/create');
  await page.fill('[data-testid=agent-name]', name);
  await page.selectOption('[data-testid=agent-type]', 'general');
  await page.click('[data-testid=create-agent-submit]');
  await expect(page.locator('[data-testid=success-message]')).toBeVisible();
}
```

#### **Cross-Browser Testing**
```typescript
// tests/e2e/cross-browser.spec.ts
import { test, expect, devices } from '@playwright/test';

// Test on different browsers and devices
const browserConfigs = [
  { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
  { name: 'Desktop Firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'Desktop Safari', use: { ...devices['Desktop Safari'] } },
  { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
  { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
];

browserConfigs.forEach(({ name, use }) => {
  test.describe(`${name} Tests`, () => {
    test.use(use);

    test('responsive design and functionality', async ({ page }) => {
      await page.goto('/dashboard');
      
      // Check responsive layout
      if (name.includes('Mobile')) {
        // Mobile-specific tests
        await expect(page.locator('[data-testid=mobile-menu-button]')).toBeVisible();
        await page.click('[data-testid=mobile-menu-button]');
        await expect(page.locator('[data-testid=mobile-menu]')).toBeVisible();
      } else {
        // Desktop-specific tests
        await expect(page.locator('[data-testid=sidebar]')).toBeVisible();
        await expect(page.locator('[data-testid=main-content]')).toBeVisible();
      }
      
      // Common functionality tests
      await page.click('[data-testid=create-agent-button]');
      await expect(page).toHaveURL('/agents/create');
    });

    test('form interactions work correctly', async ({ page }) => {
      await page.goto('/agents/create');
      
      // Test form elements work on all browsers
      await page.fill('[data-testid=agent-name]', 'Cross-browser Test');
      await page.selectOption('[data-testid=agent-type]', 'blockchain_analyst');
      
      // Test advanced interactions
      await page.click('[data-testid=advanced-settings]');
      await page.selectOption('[data-testid=model-select]', 'gpt-4');
      
      const temperatureSlider = page.locator('[data-testid=temperature-slider]');
      await temperatureSlider.fill('0.3');
      
      await page.click('[data-testid=create-agent-submit]');
      await expect(page.locator('[data-testid=success-message]')).toBeVisible();
    });
  });
});
```

### **🔌 API E2E Tests**

```python
# tests/e2e/test_api_workflow.py
import pytest
import asyncio
import websockets
import json
from httpx import AsyncClient
from api import app

class TestAPIWorkflow:
    
    @pytest.mark.asyncio
    async def test_complete_api_workflow(self):
        """Test complete API workflow across all services"""
        
        async with AsyncClient(app=app, base_url="http://test") as client:
            
            # 1. Authentication
            auth_response = await client.post("/auth/login", json={
                "email": "test@example.com",
                "password": "testpassword"
            })
            assert auth_response.status_code == 200
            token = auth_response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # 2. Create agent
            agent_response = await client.post("/api/v1/agents", json={
                "name": "API E2E Agent",
                "type": "blockchain_analyst",
                "configuration": {
                    "model": "gpt-4",
                    "temperature": 0.1,
                    "tools": ["onchain_analyzer", "web_search"]
                }
            }, headers=headers)
            
            assert agent_response.status_code == 201
            agent_id = agent_response.json()["id"]
            
            # 3. Create session
            session_response = await client.post("/api/v1/sessions", json={
                "agent_id": agent_id,
                "name": "API E2E Session"
            }, headers=headers)
            
            assert session_response.status_code == 201
            session_id = session_response.json()["id"]
            
            # 4. Test microservices integration
            # OnChain Service
            onchain_response = await client.post("/api/v1/analyze/token", json={
                "address": "0xa0b86a33e6776ca5c2a4d5d8176ec9c3a9a6e9a0"
            }, headers=headers)
            assert onchain_response.status_code == 200
            
            # Sentiment Service
            sentiment_response = await client.post("/api/v1/analyze/sentiment", json={
                "query": "Bitcoin price prediction"
            }, headers=headers)
            assert sentiment_response.status_code == 200
            
            # 5. Execute agent task with tool usage
            execution_response = await client.post(f"/api/v1/agents/{agent_id}/execute", json={
                "task": "Analyze Bitcoin performance and market sentiment",
                "session_id": session_id
            }, headers=headers)
            
            assert execution_response.status_code == 200
            task_id = execution_response.json()["task_id"]
            
            # 6. Poll for results
            for _ in range(30):  # Wait up to 30 seconds
                status_response = await client.get(
                    f"/api/v1/tasks/{task_id}/status",
                    headers=headers
                )
                if status_response.json()["status"] == "completed":
                    break
                await asyncio.sleep(1)
            
            assert status_response.json()["status"] == "completed"
            
            # 7. Get final results
            results_response = await client.get(
                f"/api/v1/tasks/{task_id}/results",
                headers=headers
            )
            
            assert results_response.status_code == 200
            results = results_response.json()
            assert "analysis" in results
            assert "tools_used" in results

    @pytest.mark.asyncio
    async def test_websocket_real_time_communication(self):
        """Test real-time WebSocket communication"""
        
        # Get auth token first
        async with AsyncClient(app=app, base_url="http://test") as client:
            auth_response = await client.post("/auth/login", json={
                "email": "test@example.com",
                "password": "testpassword"
            })
            token = auth_response.json()["access_token"]
        
        # Connect to WebSocket
        uri = f"ws://localhost:8000/ws?token={token}"
        
        async with websockets.connect(uri) as websocket:
            
            # Send agent creation request
            await websocket.send(json.dumps({
                "type": "create_session",
                "data": {
                    "agent_id": "test-agent-id",
                    "name": "WebSocket Test Session"
                }
            }))
            
            # Receive session created event
            response = await websocket.recv()
            message = json.loads(response)
            assert message["type"] == "session_created"
            session_id = message["data"]["session_id"]
            
            # Send chat message
            await websocket.send(json.dumps({
                "type": "send_message",
                "data": {
                    "session_id": session_id,
                    "content": "Hello, agent!",
                    "message_type": "user"
                }
            }))
            
            # Receive message acknowledgment
            response = await websocket.recv()
            message = json.loads(response)
            assert message["type"] == "message_received"
            
            # Receive agent response
            response = await websocket.recv()
            message = json.loads(response)
            assert message["type"] == "agent_response"
            assert "content" in message["data"]
```

---

## 🚀 Performance Testing

### **📊 Load Testing (K6)**

#### **API Load Testing**
```javascript
// tests/performance/api-load-test.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.1'],     // Error rate must be below 10%
    errors: ['rate<0.1'],
  },
};

const BASE_URL = 'http://localhost:8000';
let authToken = '';

export function setup() {
  // Authenticate once for all virtual users
  const loginResponse = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: 'load-test@example.com',
    password: 'loadtestpassword'
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return loginResponse.json().access_token;
}

export default function(token) {
  authToken = token;
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };

  group('Agent Management', () => {
    // Create agent
    const createAgentResponse = http.post(`${BASE_URL}/api/v1/agents`, JSON.stringify({
      name: `Load Test Agent ${__VU}-${__ITER}`,
      type: 'blockchain_analyst',
      configuration: {
        model: 'gpt-3.5-turbo',
        temperature: 0.1
      }
    }), { headers });

    check(createAgentResponse, {
      'agent created successfully': (r) => r.status === 201,
      'agent has valid ID': (r) => r.json('id') !== '',
    }) || errorRate.add(1);

    if (createAgentResponse.status === 201) {
      const agentId = createAgentResponse.json('id');

      // Get agent details
      const getAgentResponse = http.get(`${BASE_URL}/api/v1/agents/${agentId}`, { headers });
      check(getAgentResponse, {
        'get agent successful': (r) => r.status === 200,
        'agent data correct': (r) => r.json('name').includes('Load Test Agent'),
      }) || errorRate.add(1);

      // Update agent
      const updateAgentResponse = http.put(`${BASE_URL}/api/v1/agents/${agentId}`, JSON.stringify({
        name: `Updated Load Test Agent ${__VU}-${__ITER}`,
      }), { headers });

      check(updateAgentResponse, {
        'agent updated successfully': (r) => r.status === 200,
      }) || errorRate.add(1);
    }
  });

  group('Session Management', () => {
    // Create session
    const createSessionResponse = http.post(`${BASE_URL}/api/v1/sessions`, JSON.stringify({
      agent_id: 'default-agent-id',
      name: `Load Test Session ${__VU}-${__ITER}`
    }), { headers });

    check(createSessionResponse, {
      'session created successfully': (r) => r.status === 201,
    }) || errorRate.add(1);

    if (createSessionResponse.status === 201) {
      const sessionId = createSessionResponse.json('id');

      // Send messages
      for (let i = 0; i < 3; i++) {
        const messageResponse = http.post(`${BASE_URL}/api/v1/sessions/${sessionId}/messages`, JSON.stringify({
          content: `Load test message ${i} from user ${__VU}`,
          message_type: 'user'
        }), { headers });

        check(messageResponse, {
          'message sent successfully': (r) => r.status === 201,
        }) || errorRate.add(1);

        sleep(1); // Wait between messages
      }

      // Get session messages
      const getMessagesResponse = http.get(`${BASE_URL}/api/v1/sessions/${sessionId}/messages`, { headers });
      check(getMessagesResponse, {
        'messages retrieved successfully': (r) => r.status === 200,
        'correct message count': (r) => r.json().length >= 3,
      }) || errorRate.add(1);
    }
  });

  group('Microservices Load', () => {
    // Test OnChain service
    const onchainResponse = http.post(`${BASE_URL}/api/v1/analyze/token`, JSON.stringify({
      address: '0xa0b86a33e6776ca5c2a4d5d8176ec9c3a9a6e9a0'
    }), { headers });

    check(onchainResponse, {
      'onchain analysis successful': (r) => r.status === 200,
      'response time acceptable': (r) => r.timings.duration < 5000,
    }) || errorRate.add(1);

    // Test Sentiment service
    const sentimentResponse = http.post(`${BASE_URL}/api/v1/analyze/sentiment`, JSON.stringify({
      query: `Bitcoin analysis ${__VU}-${__ITER}`
    }), { headers });

    check(sentimentResponse, {
      'sentiment analysis successful': (r) => r.status === 200,
    }) || errorRate.add(1);
  });

  sleep(Math.random() * 3 + 1); // Random sleep between 1-4 seconds
}

export function teardown(token) {
  // Cleanup operations if needed
  console.log('Load test completed');
}
```

#### **WebSocket Performance Testing**
```javascript
// tests/performance/websocket-load-test.js
import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const wsConnectionsCounter = new Counter('ws_connections');
const wsMessagesSentCounter = new Counter('ws_messages_sent');
const wsMessagesReceivedCounter = new Counter('ws_messages_received');
const wsConnectionDuration = new Trend('ws_connection_duration');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const url = 'ws://localhost:8000/ws?token=test-token';
  
  const response = ws.connect(url, {}, function (socket) {
    wsConnectionsCounter.add(1);
    const startTime = new Date().getTime();

    socket.on('open', () => {
      // Send initial session creation message
      socket.send(JSON.stringify({
        type: 'create_session',
        data: {
          agent_id: 'performance-test-agent',
          name: `Perf Test Session ${__VU}`
        }
      }));
      wsMessagesSentCounter.add(1);
    });

    socket.on('message', (data) => {
      wsMessagesReceivedCounter.add(1);
      const message = JSON.parse(data);
      
      check(message, {
        'message has correct structure': (msg) => msg.type !== undefined,
        'message contains data': (msg) => msg.data !== undefined,
      });

      // Send chat messages after session creation
      if (message.type === 'session_created') {
        const sessionId = message.data.session_id;
        
        // Send multiple messages rapidly
        for (let i = 0; i < 10; i++) {
          socket.send(JSON.stringify({
            type: 'send_message',
            data: {
              session_id: sessionId,
              content: `Performance test message ${i} from VU ${__VU}`,
              message_type: 'user'
            }
          }));
          wsMessagesSentCounter.add(1);
        }
      }
    });

    socket.on('close', () => {
      const endTime = new Date().getTime();
      wsConnectionDuration.add(endTime - startTime);
    });

    // Keep connection alive for 30 seconds
    socket.setTimeout(30000);
  });

  check(response, {
    'WebSocket connection successful': (r) => r && r.status === 101,
  });
}
```

### **🔋 Database Performance Testing**

```python
# tests/performance/database_load_test.py
import asyncio
import asyncpg
import time
import statistics
from concurrent.futures import ThreadPoolExecutor
import pytest

class TestDatabasePerformance:
    
    @pytest.mark.asyncio
    async def test_connection_pool_performance(self):
        """Test database connection pool under load"""
        
        DATABASE_URL = "postgresql://user:pass@localhost:5432/suna_test"
        
        async def execute_query(pool, query_id):
            start_time = time.time()
            async with pool.acquire() as connection:
                result = await connection.fetchrow(
                    "SELECT id, name, created_at FROM agents WHERE id = $1",
                    f"test-agent-{query_id}"
                )
                end_time = time.time()
                return end_time - start_time, result
        
        # Create connection pool
        pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=10,
            max_size=50,
            command_timeout=60
        )
        
        # Execute concurrent queries
        tasks = []
        for i in range(200):
            task = execute_query(pool, i)
            tasks.append(task)
        
        results = await asyncio.gather(*tasks)
        response_times = [r[0] for r in results]
        
        # Analyze performance
        avg_response_time = statistics.mean(response_times)
        p95_response_time = statistics.quantiles(response_times, n=20)[18]  # 95th percentile
        
        print(f"Average response time: {avg_response_time:.3f}s")
        print(f"95th percentile: {p95_response_time:.3f}s")
        
        # Performance assertions
        assert avg_response_time < 0.1  # Average should be under 100ms
        assert p95_response_time < 0.5  # 95% should be under 500ms
        
        await pool.close()

    @pytest.mark.asyncio
    async def test_bulk_operations_performance(self):
        """Test bulk insert/update performance"""
        
        DATABASE_URL = "postgresql://user:pass@localhost:5432/suna_test"
        
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=5, max_size=20)
        
        # Test bulk insert
        start_time = time.time()
        
        async with pool.acquire() as connection:
            # Insert 1000 agents in batches
            batch_size = 100
            for batch in range(10):
                agents_data = [
                    (f"bulk-agent-{batch}-{i}", "general", f"user-{i}", time.time())
                    for i in range(batch_size)
                ]
                
                await connection.executemany(
                    """
                    INSERT INTO agents (id, name, type, user_id, created_at)
                    VALUES ($1, $2, $3, $4, to_timestamp($5))
                    """,
                    [(f"agent-{batch}-{i}", name, type_, user_id, created_at) 
                     for name, type_, user_id, created_at in agents_data]
                )
        
        bulk_insert_time = time.time() - start_time
        
        # Test bulk update
        start_time = time.time()
        
        async with pool.acquire() as connection:
            await connection.execute(
                """
                UPDATE agents 
                SET updated_at = NOW() 
                WHERE id LIKE 'agent-%'
                """
            )
        
        bulk_update_time = time.time() - start_time
        
        print(f"Bulk insert (1000 records): {bulk_insert_time:.3f}s")
        print(f"Bulk update (1000 records): {bulk_update_time:.3f}s")
        
        # Performance assertions
        assert bulk_insert_time < 5.0  # Bulk insert should complete in under 5s
        assert bulk_update_time < 1.0  # Bulk update should complete in under 1s
        
        await pool.close()

    def test_query_optimization(self):
        """Test query performance with different optimization strategies"""
        import psycopg2
        from psycopg2.extras import execute_batch, execute_values
        
        connection = psycopg2.connect(
            "postgresql://user:pass@localhost:5432/suna_test"
        )
        cursor = connection.cursor()
        
        # Test different query patterns
        test_queries = [
            # Index usage test
            ("SELECT * FROM agents WHERE type = %s", ("blockchain_analyst",)),
            
            # JOIN performance test
            ("""
            SELECT a.name, s.name as session_name, COUNT(m.id) as message_count
            FROM agents a
            JOIN sessions s ON a.id = s.agent_id
            JOIN messages m ON s.id = m.session_id
            WHERE a.user_id = %s
            GROUP BY a.id, s.id
            """, ("test-user",)),
            
            # Complex aggregation test
            ("""
            SELECT 
                DATE_TRUNC('day', created_at) as day,
                COUNT(*) as agent_count,
                COUNT(DISTINCT user_id) as unique_users
            FROM agents 
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE_TRUNC('day', created_at)
            ORDER BY day
            """, ()),
        ]
        
        performance_results = {}
        
        for i, (query, params) in enumerate(test_queries):
            # Execute query multiple times and measure performance
            times = []
            for _ in range(10):
                start_time = time.time()
                cursor.execute(query, params)
                cursor.fetchall()
                end_time = time.time()
                times.append(end_time - start_time)
            
            avg_time = statistics.mean(times)
            performance_results[f"query_{i+1}"] = avg_time
            
            print(f"Query {i+1} average time: {avg_time:.3f}s")
            
            # Performance assertions
            assert avg_time < 1.0  # Each query should complete in under 1 second
        
        cursor.close()
        connection.close()
        
        return performance_results
```

---

## 🛡️ Security Testing

### **🔒 OWASP ZAP Integration**

```python
# tests/security/zap_security_test.py
import time
import requests
from zapv2 import ZAPv2
import pytest

class TestSecurityVulnerabilities:
    
    @pytest.fixture(scope="session")
    def zap_setup(self):
        """Setup ZAP proxy for security testing"""
        # Start ZAP (assuming it's running on localhost:8080)
        zap = ZAPv2(proxies={'http': 'http://127.0.0.1:8080', 'https': 'http://127.0.0.1:8080'})
        
        # Configure ZAP
        zap.core.new_session()
        
        yield zap
        
        # Cleanup
        zap.core.delete_all_alerts()

    def test_spider_and_scan_application(self, zap_setup):
        """Perform automated security scanning"""
        zap = zap_setup
        target_url = 'http://localhost:3000'
        
        # Step 1: Spider the application
        print('Starting spider...')
        spider_id = zap.spider.scan(target_url)
        
        # Wait for spider to complete
        while int(zap.spider.status(spider_id)) < 100:
            print(f'Spider progress: {zap.spider.status(spider_id)}%')
            time.sleep(2)
        
        print('Spider completed')
        
        # Step 2: Passive scan (automatically runs during spidering)
        print('Starting passive scan...')
        
        # Step 3: Active scan
        print('Starting active scan...')
        active_scan_id = zap.ascan.scan(target_url)
        
        while int(zap.ascan.status(active_scan_id)) < 100:
            print(f'Active scan progress: {zap.ascan.status(active_scan_id)}%')
            time.sleep(10)
        
        print('Active scan completed')
        
        # Step 4: Get results
        alerts = zap.core.alerts()
        
        # Categorize alerts by risk level
        high_risk_alerts = []
        medium_risk_alerts = []
        low_risk_alerts = []
        
        for alert in alerts:
            risk_level = alert.get('risk', '').lower()
            if risk_level == 'high':
                high_risk_alerts.append(alert)
            elif risk_level == 'medium':
                medium_risk_alerts.append(alert)
            else:
                low_risk_alerts.append(alert)
        
        # Generate report
        print(f'\nSecurity Scan Results:')
        print(f'High Risk: {len(high_risk_alerts)}')
        print(f'Medium Risk: {len(medium_risk_alerts)}')
        print(f'Low Risk: {len(low_risk_alerts)}')
        
        # Assert no high-risk vulnerabilities
        if high_risk_alerts:
            print('\nHigh Risk Vulnerabilities:')
            for alert in high_risk_alerts:
                print(f"- {alert['name']}: {alert['description']}")
        
        assert len(high_risk_alerts) == 0, f"Found {len(high_risk_alerts)} high-risk vulnerabilities"
        
        # Generate HTML report
        html_report = zap.core.htmlreport()
        with open('security_report.html', 'w') as f:
            f.write(html_report)
        
        return {
            'high_risk': len(high_risk_alerts),
            'medium_risk': len(medium_risk_alerts),
            'low_risk': len(low_risk_alerts),
            'total_alerts': len(alerts)
        }

    def test_authentication_security(self, zap_setup):
        """Test authentication-related security"""
        zap = zap_setup
        base_url = 'http://localhost:8000'
        
        # Test authentication endpoints
        auth_urls = [
            f'{base_url}/auth/login',
            f'{base_url}/auth/register',
            f'{base_url}/auth/forgot-password',
            f'{base_url}/auth/reset-password'
        ]
        
        for url in auth_urls:
            # Add URL to ZAP's site tree
            zap.core.access_url(url)
        
        # Run targeted scan on authentication
        auth_scan_id = zap.ascan.scan(f'{base_url}/auth/')
        
        while int(zap.ascan.status(auth_scan_id)) < 100:
            time.sleep(5)
        
        # Check for authentication-specific vulnerabilities
        auth_alerts = [
            alert for alert in zap.core.alerts() 
            if '/auth/' in alert.get('url', '')
        ]
        
        # Look for common authentication issues
        auth_issues = []
        for alert in auth_alerts:
            alert_name = alert.get('name', '').lower()
            if any(keyword in alert_name for keyword in [
                'authentication', 'session', 'cookie', 'password', 
                'brute force', 'injection', 'xss'
            ]):
                auth_issues.append(alert)
        
        print(f'Authentication security issues found: {len(auth_issues)}')
        
        return auth_issues

    def test_api_security(self, zap_setup):
        """Test API-specific security vulnerabilities"""
        zap = zap_setup
        api_base_url = 'http://localhost:8000/api/v1'
        
        # Define API endpoints to test
        api_endpoints = [
            '/agents',
            '/sessions',
            '/users',
            '/auth/verify'
        ]
        
        # Test each endpoint
        for endpoint in api_endpoints:
            full_url = f'{api_base_url}{endpoint}'
            
            # Test different HTTP methods
            methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
            
            for method in methods:
                try:
                    zap.core.send_request(
                        f"{method} {full_url} HTTP/1.1\r\n" +
                        "Host: localhost:8000\r\n" +
                        "Content-Type: application/json\r\n\r\n"
                    )
                except Exception as e:
                    print(f"Error testing {method} {full_url}: {e}")
        
        # Run API-specific scans
        api_scan_id = zap.ascan.scan(api_base_url)
        
        while int(zap.ascan.status(api_scan_id)) < 100:
            time.sleep(5)
        
        # Filter API-related alerts
        api_alerts = [
            alert for alert in zap.core.alerts()
            if '/api/' in alert.get('url', '')
        ]
        
        # Categorize API security issues
        critical_api_issues = []
        for alert in api_alerts:
            alert_name = alert.get('name', '').lower()
            if any(keyword in alert_name for keyword in [
                'injection', 'authentication bypass', 'authorization', 
                'sensitive data', 'information disclosure'
            ]):
                critical_api_issues.append(alert)
        
        assert len(critical_api_issues) == 0, f"Critical API security issues found: {len(critical_api_issues)}"
        
        return api_alerts
```

### **🔍 Penetration Testing Scripts**

```python
# tests/security/penetration_tests.py
import requests
import json
import time
import random
import string
from concurrent.futures import ThreadPoolExecutor
import pytest

class TestPenetrationTesting:
    
    BASE_URL = "http://localhost:8000"
    
    def test_sql_injection_attempts(self):
        """Test for SQL injection vulnerabilities"""
        
        # Common SQL injection payloads
        sql_payloads = [
            "' OR '1'='1",
            "'; DROP TABLE users; --",
            "' UNION SELECT * FROM agents --",
            "1' AND (SELECT COUNT(*) FROM agents) > 0 --",
            "' OR 1=1 LIMIT 1 OFFSET 0 --"
        ]
        
        # Test endpoints that might be vulnerable
        test_endpoints = [
            ("/api/v1/agents", {"name": "payload"}),
            ("/api/v1/sessions", {"name": "payload"}),
            ("/api/v1/users", {"email": "payload"}),
            ("/auth/login", {"email": "payload", "password": "test"})
        ]
        
        vulnerabilities_found = []
        
        for endpoint, data_template in test_endpoints:
            for payload in sql_payloads:
                # Test in different fields
                for field in data_template.keys():
                    test_data = data_template.copy()
                    test_data[field] = payload
                    
                    try:
                        response = requests.post(
                            f"{self.BASE_URL}{endpoint}",
                            json=test_data,
                            timeout=5
                        )
                        
                        # Look for SQL error messages in response
                        response_text = response.text.lower()
                        sql_errors = [
                            "sql syntax", "mysql", "postgresql", "sqlite",
                            "syntax error", "column", "table", "database"
                        ]
                        
                        if any(error in response_text for error in sql_errors):
                            vulnerabilities_found.append({
                                "endpoint": endpoint,
                                "payload": payload,
                                "field": field,
                                "response": response.text[:200]
                            })
                            
                    except requests.exceptions.Timeout:
                        # Potential time-based SQL injection
                        vulnerabilities_found.append({
                            "endpoint": endpoint,
                            "payload": payload,
                            "field": field,
                            "issue": "Timeout - possible time-based SQL injection"
                        })
                    except Exception as e:
                        continue
        
        # Assert no SQL injection vulnerabilities found
        if vulnerabilities_found:
            print("SQL Injection vulnerabilities found:")
            for vuln in vulnerabilities_found:
                print(f"  - {vuln}")
        
        assert len(vulnerabilities_found) == 0, f"Found {len(vulnerabilities_found)} potential SQL injection vulnerabilities"

    def test_xss_vulnerabilities(self):
        """Test for Cross-Site Scripting (XSS) vulnerabilities"""
        
        xss_payloads = [
            "<script>alert('XSS')</script>",
            "javascript:alert('XSS')",
            "<img src=x onerror=alert('XSS')>",
            "';alert('XSS');//",
            "<svg onload=alert('XSS')>"
        ]
        
        # Test form submissions and data display
        test_data = [
            ("/api/v1/agents", {"name": "payload", "type": "general"}),
            ("/api/v1/sessions", {"name": "payload"}),
        ]
        
        xss_vulnerabilities = []
        
        for endpoint, data_template in test_data:
            for payload in xss_payloads:
                for field in data_template.keys():
                    if field == "type":  # Skip enum fields
                        continue
                        
                    test_data = data_template.copy()
                    test_data[field] = payload
                    
                    try:
                        # Submit data with XSS payload
                        response = requests.post(
                            f"{self.BASE_URL}{endpoint}",
                            json=test_data,
                            headers={"Content-Type": "application/json"}
                        )
                        
                        if response.status_code == 201:
                            created_id = response.json().get('id')
                            
                            # Try to retrieve the data to see if payload is reflected
                            get_response = requests.get(f"{self.BASE_URL}{endpoint}/{created_id}")
                            
                            if payload in get_response.text:
                                xss_vulnerabilities.append({
                                    "endpoint": endpoint,
                                    "field": field,
                                    "payload": payload,
                                    "reflected": True
                                })
                                
                    except Exception as e:
                        continue
        
        assert len(xss_vulnerabilities) == 0, f"Found {len(xss_vulnerabilities)} XSS vulnerabilities"

    def test_authentication_bypass_attempts(self):
        """Test for authentication bypass vulnerabilities"""
        
        # Test accessing protected endpoints without authentication
        protected_endpoints = [
            "/api/v1/agents",
            "/api/v1/sessions",
            "/api/v1/users/profile",
        ]
        
        auth_bypass_issues = []
        
        for endpoint in protected_endpoints:
            # Test without any authentication
            response = requests.get(f"{self.BASE_URL}{endpoint}")
            
            if response.status_code == 200:
                auth_bypass_issues.append({
                    "endpoint": endpoint,
                    "issue": "Accessible without authentication",
                    "status_code": response.status_code
                })
            
            # Test with invalid/malformed tokens
            invalid_tokens = [
                "Bearer invalid_token",
                "Bearer ",
                "InvalidScheme valid_token",
                "Bearer expired_token_that_is_very_long_and_invalid"
            ]
            
            for token in invalid_tokens:
                response = requests.get(
                    f"{self.BASE_URL}{endpoint}",
                    headers={"Authorization": token}
                )
                
                if response.status_code == 200:
                    auth_bypass_issues.append({
                        "endpoint": endpoint,
                        "issue": f"Accessible with invalid token: {token}",
                        "status_code": response.status_code
                    })
        
        assert len(auth_bypass_issues) == 0, f"Authentication bypass issues found: {auth_bypass_issues}"

    def test_rate_limiting(self):
        """Test rate limiting implementation"""
        
        # Test rate limiting on authentication endpoint
        login_url = f"{self.BASE_URL}/auth/login"
        
        # Send many requests rapidly
        def send_login_request():
            return requests.post(login_url, json={
                "email": "test@example.com",
                "password": "wrongpassword"
            })
        
        # Send 50 requests in parallel
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(send_login_request) for _ in range(50)]
            responses = [future.result() for future in futures]
        
        # Check if any requests were rate limited (status 429)
        rate_limited = [r for r in responses if r.status_code == 429]
        
        # Should have some rate limiting after many failed attempts
        assert len(rate_limited) > 0, "No rate limiting detected on authentication endpoint"

    def test_input_validation(self):
        """Test input validation and sanitization"""
        
        # Test extremely large payloads
        large_string = 'A' * 10000
        
        test_cases = [
            ("/api/v1/agents", {"name": large_string, "type": "general"}),
            ("/api/v1/sessions", {"name": large_string}),
        ]
        
        input_validation_issues = []
        
        for endpoint, data in test_cases:
            try:
                response = requests.post(
                    f"{self.BASE_URL}{endpoint}",
                    json=data,
                    timeout=10
                )
                
                # Should either reject with 400/422 or handle gracefully
                if response.status_code == 500:
                    input_validation_issues.append({
                        "endpoint": endpoint,
                        "issue": "Server error with large input",
                        "status_code": response.status_code
                    })
                    
            except requests.exceptions.Timeout:
                input_validation_issues.append({
                    "endpoint": endpoint,
                    "issue": "Timeout with large input - possible DoS vector"
                })
        
        # Test special characters and encoding
        special_chars = [
            "../../etc/passwd",
            "../../../windows/system32",
            "\x00\x01\x02\x03",
            "日本語テスト",
            "💻🚀🔒"
        ]
        
        for endpoint, data_template in [("/api/v1/agents", {"name": "test", "type": "general"})]:
            for special in special_chars:
                test_data = data_template.copy()
                test_data["name"] = special
                
                response = requests.post(f"{self.BASE_URL}{endpoint}", json=test_data)
                
                # Should handle special characters gracefully
                if response.status_code == 500:
                    input_validation_issues.append({
                        "endpoint": endpoint,
                        "issue": f"Server error with special characters: {special}",
                        "status_code": response.status_code
                    })
        
        assert len(input_validation_issues) == 0, f"Input validation issues: {input_validation_issues}"
```

---

## 📝 Test Data Management

### **🏭 Test Data Factory**

```python
# test_utils/factories.py
import factory
from factory import fuzzy
from datetime import datetime, timezone
from core.models import Agent, Session, Message, User

class UserFactory(factory.Factory):
    class Meta:
        model = User
    
    id = factory.Sequence(lambda n: f"user-{n}")
    email = factory.LazyAttribute(lambda obj: f"{obj.id}@example.com")
    name = factory.Faker('name')
    created_at = factory.LazyFunction(lambda: datetime.now(timezone.utc))
    is_active = True
    subscription_type = fuzzy.FuzzyChoice(['free', 'pro', 'enterprise'])

class AgentFactory(factory.Factory):
    class Meta:
        model = Agent
    
    id = factory.Sequence(lambda n: f"agent-{n}")
    name = factory.Faker('catch_phrase')
    type = fuzzy.FuzzyChoice(['blockchain_analyst', 'general', 'researcher'])
    user_id = factory.SubFactory(UserFactory).id
    configuration = factory.LazyFunction(lambda: {
        "model": "gpt-4",
        "temperature": 0.1,
        "max_tokens": 2000,
        "tools": ["web_search"]
    })
    created_at = factory.LazyFunction(lambda: datetime.now(timezone.utc))
    is_active = True

class SessionFactory(factory.Factory):
    class Meta:
        model = Session
    
    id = factory.Sequence(lambda n: f"session-{n}")
    name = factory.Faker('sentence', nb_words=3)
    agent_id = factory.SubFactory(AgentFactory).id
    user_id = factory.LazyAttribute(lambda obj: obj.agent.user_id)
    created_at = factory.LazyFunction(lambda: datetime.now(timezone.utc))
    is_active = True

class MessageFactory(factory.Factory):
    class Meta:
        model = Message
    
    id = factory.Sequence(lambda n: f"message-{n}")
    content = factory.Faker('text', max_nb_chars=500)
    message_type = fuzzy.FuzzyChoice(['user', 'agent'])
    session_id = factory.SubFactory(SessionFactory).id
    created_at = factory.LazyFunction(lambda: datetime.now(timezone.utc))
    
    # Additional fields for agent messages
    tool_calls = factory.LazyFunction(lambda: [] if factory.Faker('boolean').generate() else [
        {
            "tool": "web_search",
            "parameters": {"query": factory.Faker('sentence').generate()},
            "result": factory.Faker('text', max_nb_chars=200).generate()
        }
    ])
```

### **🎭 Mock Data Services**

```python
# test_utils/mocks.py
from unittest.mock import Mock, AsyncMock
from typing import Dict, Any, List
import json

class MockLLMService:
    """Mock LLM service for testing agent responses"""
    
    def __init__(self, responses: Dict[str, str] = None):
        self.responses = responses or {
            "default": "This is a mock response from the AI agent.",
            "blockchain": "Based on my analysis, Bitcoin shows strong momentum with increased trading volume.",
            "error": "I'm sorry, I couldn't process that request right now."
        }
        self.call_count = 0
        self.last_prompt = None
        self.last_parameters = None
    
    async def generate_response(
        self,
        prompt: str,
        model: str = "gpt-4",
        **parameters
    ) -> Dict[str, Any]:
        self.call_count += 1
        self.last_prompt = prompt
        self.last_parameters = parameters
        
        # Simulate different response types based on prompt content
        if "error" in prompt.lower():
            raise Exception("Mock LLM error")
        elif "bitcoin" in prompt.lower() or "blockchain" in prompt.lower():
            response = self.responses.get("blockchain", self.responses["default"])
        else:
            response = self.responses["default"]
        
        return {
            "response": response,
            "model": model,
            "tokens_used": len(prompt.split()) + len(response.split()),
            "finish_reason": "completed"
        }

class MockWebSearchTool:
    """Mock web search tool for testing"""
    
    def __init__(self, results: List[Dict] = None):
        self.results = results or [
            {
                "title": "Bitcoin Price Analysis",
                "url": "https://example.com/bitcoin-analysis",
                "snippet": "Bitcoin shows strong upward momentum with technical indicators suggesting continued growth.",
                "relevance_score": 0.95
            },
            {
                "title": "Crypto Market Update",
                "url": "https://example.com/crypto-market",
                "snippet": "Latest cryptocurrency market trends and analysis from industry experts.",
                "relevance_score": 0.87
            }
        ]
    
    async def search(self, query: str, limit: int = 5) -> Dict[str, Any]:
        return {
            "query": query,
            "results": self.results[:limit],
            "total_results": len(self.results),
            "search_time": 0.234
        }

class MockOnchainService:
    """Mock onchain analysis service"""
    
    def __init__(self):
        self.token_data = {
            "0xa0b86a33e6776ca5c2a4d5d8176ec9c3a9a6e9a0": {
                "symbol": "MOCK",
                "name": "Mock Token",
                "total_supply": "1000000",
                "holders": 1500,
                "liquidity_score": 85,
                "price_usd": 1.25,
                "market_cap": 1250000,
                "volume_24h": 125000
            }
        }
    
    async def analyze_token(self, address: str) -> Dict[str, Any]:
        if address in self.token_data:
            return {
                "address": address,
                **self.token_data[address],
                "analysis_timestamp": "2025-01-15T12:00:00Z"
            }
        else:
            raise ValueError(f"Token not found: {address}")
    
    async def get_transaction_history(
        self,
        address: str,
        limit: int = 10
    ) -> Dict[str, Any]:
        return {
            "address": address,
            "transactions": [
                {
                    "hash": f"0x{i:064x}",
                    "value": f"{i * 0.1:.1f}",
                    "timestamp": 1642000000 + i * 3600,
                    "type": "transfer"
                }
                for i in range(limit)
            ],
            "total_count": limit,
            "has_more": False
        }

def create_mock_database_session():
    """Create mock database session for testing"""
    
    session_mock = Mock()
    
    # Mock query methods
    session_mock.query.return_value.filter.return_value.first.return_value = None
    session_mock.query.return_value.filter.return_value.all.return_value = []
    session_mock.query.return_value.count.return_value = 0
    
    # Mock transaction methods
    session_mock.commit = Mock()
    session_mock.rollback = Mock()
    session_mock.add = Mock()
    session_mock.delete = Mock()
    session_mock.merge = Mock()
    
    return session_mock

def create_mock_redis_client():
    """Create mock Redis client for testing"""
    
    redis_mock = Mock()
    
    # Mock Redis operations
    redis_mock.get = AsyncMock(return_value=None)
    redis_mock.set = AsyncMock(return_value=True)
    redis_mock.delete = AsyncMock(return_value=1)
    redis_mock.exists = AsyncMock(return_value=0)
    redis_mock.expire = AsyncMock(return_value=True)
    redis_mock.flushall = AsyncMock(return_value=True)
    
    # Mock pub/sub
    redis_mock.publish = AsyncMock(return_value=1)
    redis_mock.subscribe = AsyncMock()
    
    return redis_mock
```

### **🧹 Test Data Cleanup**

```python
# test_utils/cleanup.py
import asyncio
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from core.models import Base, Agent, Session as AgentSession, Message, User

class TestDataCleaner:
    """Utility class for cleaning up test data"""
    
    def __init__(self, db_session: Session = None):
        self.db_session = db_session or SessionLocal()
    
    def cleanup_test_users(self):
        """Remove test users and related data"""
        test_users = self.db_session.query(User).filter(
            User.email.like('%example.com%')
        ).all()
        
        for user in test_users:
            # Delete related agents, sessions, and messages
            agents = self.db_session.query(Agent).filter(Agent.user_id == user.id).all()
            for agent in agents:
                sessions = self.db_session.query(AgentSession).filter(
                    AgentSession.agent_id == agent.id
                ).all()
                for session in sessions:
                    self.db_session.query(Message).filter(
                        Message.session_id == session.id
                    ).delete()
                    self.db_session.delete(session)
                self.db_session.delete(agent)
            
            self.db_session.delete(user)
        
        self.db_session.commit()
        return len(test_users)
    
    def cleanup_test_agents(self):
        """Remove test agents created during testing"""
        test_agents = self.db_session.query(Agent).filter(
            Agent.name.like('Test%') | 
            Agent.name.like('Mock%') |
            Agent.name.like('E2E%') |
            Agent.name.like('Load Test%')
        ).all()
        
        for agent in test_agents:
            # Cascading deletes should handle sessions and messages
            self.db_session.delete(agent)
        
        self.db_session.commit()
        return len(test_agents)
    
    def cleanup_old_test_data(self, days_old: int = 7):
        """Remove test data older than specified days"""
        from datetime import datetime, timedelta
        
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        
        # Delete old messages first (most specific)
        old_messages = self.db_session.query(Message).filter(
            Message.created_at < cutoff_date,
            Message.content.like('%test%')
        ).delete()
        
        # Delete old sessions
        old_sessions = self.db_session.query(AgentSession).filter(
            AgentSession.created_at < cutoff_date,
            AgentSession.name.like('%test%')
        ).delete()
        
        # Delete old agents
        old_agents = self.db_session.query(Agent).filter(
            Agent.created_at < cutoff_date,
            Agent.name.like('%test%')
        ).delete()
        
        self.db_session.commit()
        
        return {
            'messages': old_messages,
            'sessions': old_sessions,
            'agents': old_agents
        }
    
    def reset_test_database(self):
        """Complete database reset for testing"""
        # Drop all tables
        Base.metadata.drop_all(bind=engine)
        
        # Recreate all tables
        Base.metadata.create_all(bind=engine)
        
        return True
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.db_session:
            self.db_session.close()

# Pytest fixture for automatic cleanup
import pytest

@pytest.fixture(scope="function", autouse=True)
def cleanup_test_data():
    """Automatically cleanup test data after each test"""
    yield
    
    # Cleanup after test
    with TestDataCleaner() as cleaner:
        cleaner.cleanup_test_agents()

@pytest.fixture(scope="session", autouse=True)
def cleanup_session_data():
    """Cleanup data after entire test session"""
    yield
    
    # Final cleanup
    with TestDataCleaner() as cleaner:
        cleaner.cleanup_test_users()
        cleaner.cleanup_old_test_data(days_old=0)  # Clean all test data
```

---

## 📊 Quality Metrics & Reporting

### **📈 Test Metrics Dashboard**

```python
# test_utils/metrics.py
import json
import time
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any
import pytest

class TestMetricsCollector:
    """Collect and analyze test execution metrics"""
    
    def __init__(self, db_path: str = "test_metrics.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize metrics database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS test_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                total_tests INTEGER,
                passed INTEGER,
                failed INTEGER,
                skipped INTEGER,
                duration REAL,
                coverage_percentage REAL,
                branch TEXT,
                commit_hash TEXT
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS test_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER,
                test_name TEXT,
                status TEXT,
                duration REAL,
                error_message TEXT,
                FOREIGN KEY (run_id) REFERENCES test_runs (id)
            )
        """)
        
        conn.commit()
        conn.close()
    
    def record_test_run(
        self,
        total_tests: int,
        passed: int,
        failed: int,
        skipped: int,
        duration: float,
        coverage: float = None,
        branch: str = None,
        commit_hash: str = None
    ) -> int:
        """Record a complete test run"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO test_runs 
            (timestamp, total_tests, passed, failed, skipped, duration, 
             coverage_percentage, branch, commit_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.now().isoformat(),
            total_tests, passed, failed, skipped, duration,
            coverage, branch, commit_hash
        ))
        
        run_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return run_id
    
    def record_test_result(
        self,
        run_id: int,
        test_name: str,
        status: str,
        duration: float,
        error_message: str = None
    ):
        """Record individual test result"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO test_results (run_id, test_name, status, duration, error_message)
            VALUES (?, ?, ?, ?, ?)
        """, (run_id, test_name, status, duration, error_message))
        
        conn.commit()
        conn.close()
    
    def get_test_metrics(self, days: int = 30) -> Dict[str, Any]:
        """Get test metrics for the last N days"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get overall metrics
        cursor.execute("""
            SELECT 
                COUNT(*) as total_runs,
                AVG(passed * 100.0 / total_tests) as avg_pass_rate,
                AVG(duration) as avg_duration,
                AVG(coverage_percentage) as avg_coverage
            FROM test_runs 
            WHERE timestamp > datetime('now', '-{} days')
        """.format(days))
        
        overall_metrics = cursor.fetchone()
        
        # Get trend data
        cursor.execute("""
            SELECT 
                DATE(timestamp) as date,
                AVG(passed * 100.0 / total_tests) as pass_rate,
                AVG(duration) as duration,
                AVG(coverage_percentage) as coverage
            FROM test_runs 
            WHERE timestamp > datetime('now', '-{} days')
            GROUP BY DATE(timestamp)
            ORDER BY date
        """.format(days))
        
        trend_data = cursor.fetchall()
        
        # Get most failed tests
        cursor.execute("""
            SELECT 
                tr.test_name,
                COUNT(*) as failure_count,
                AVG(tr.duration) as avg_duration
            FROM test_results tr
            JOIN test_runs run ON tr.run_id = run.id
            WHERE tr.status = 'failed' 
            AND run.timestamp > datetime('now', '-{} days')
            GROUP BY tr.test_name
            ORDER BY failure_count DESC
            LIMIT 10
        """.format(days))
        
        flaky_tests = cursor.fetchall()
        
        conn.close()
        
        return {
            "overall": {
                "total_runs": overall_metrics[0],
                "avg_pass_rate": round(overall_metrics[1], 2) if overall_metrics[1] else 0,
                "avg_duration": round(overall_metrics[2], 2) if overall_metrics[2] else 0,
                "avg_coverage": round(overall_metrics[3], 2) if overall_metrics[3] else 0
            },
            "trend": [
                {
                    "date": row[0],
                    "pass_rate": round(row[1], 2) if row[1] else 0,
                    "duration": round(row[2], 2) if row[2] else 0,
                    "coverage": round(row[3], 2) if row[3] else 0
                }
                for row in trend_data
            ],
            "flaky_tests": [
                {
                    "test_name": row[0],
                    "failure_count": row[1],
                    "avg_duration": round(row[2], 2) if row[2] else 0
                }
                for row in flaky_tests
            ]
        }
    
    def generate_html_report(self, output_path: str = "test_metrics_report.html"):
        """Generate HTML metrics report"""
        metrics = self.get_test_metrics()
        
        html_template = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Test Metrics Dashboard</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .metric-card { 
                    display: inline-block; 
                    margin: 10px; 
                    padding: 20px; 
                    border: 1px solid #ddd; 
                    border-radius: 8px;
                    min-width: 200px;
                }
                .metric-value { font-size: 2em; font-weight: bold; color: #2196F3; }
                .metric-label { color: #666; }
                .chart-container { width: 100%; height: 400px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <h1>🧪 Test Metrics Dashboard</h1>
            
            <div class="metrics-overview">
                <div class="metric-card">
                    <div class="metric-value">{avg_pass_rate}%</div>
                    <div class="metric-label">Average Pass Rate</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">{avg_duration}s</div>
                    <div class="metric-label">Average Duration</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">{avg_coverage}%</div>
                    <div class="metric-label">Average Coverage</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">{total_runs}</div>
                    <div class="metric-label">Total Runs</div>
                </div>
            </div>
            
            <div class="chart-container">
                <canvas id="trendChart"></canvas>
            </div>
            
            <h2>🔍 Most Flaky Tests</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="background-color: #f2f2f2;">
                    <th style="padding: 10px; border: 1px solid #ddd;">Test Name</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Failure Count</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Avg Duration</th>
                </tr>
                {flaky_tests_rows}
            </table>
            
            <script>
                const ctx = document.getElementById('trendChart').getContext('2d');
                const trendChart = new Chart(ctx, {{
                    type: 'line',
                    data: {{
                        labels: {trend_labels},
                        datasets: [{{
                            label: 'Pass Rate (%)',
                            data: {pass_rate_data},
                            borderColor: 'rgb(75, 192, 192)',
                            tension: 0.1
                        }}, {{
                            label: 'Coverage (%)',
                            data: {coverage_data},
                            borderColor: 'rgb(255, 99, 132)',
                            tension: 0.1
                        }}]
                    }},
                    options: {{
                        responsive: true,
                        plugins: {{
                            title: {{
                                display: true,
                                text: 'Test Metrics Trend'
                            }}
                        }}
                    }}
                }});
            </script>
            
            <footer>
                <p>Generated on {timestamp}</p>
            </footer>
        </body>
        </html>
        """
        
        # Prepare data for template
        flaky_tests_rows = ""
        for test in metrics["flaky_tests"]:
            flaky_tests_rows += f"""
                <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;">{test['test_name']}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">{test['failure_count']}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">{test['avg_duration']}s</td>
                </tr>
            """
        
        trend_labels = json.dumps([item["date"] for item in metrics["trend"]])
        pass_rate_data = json.dumps([item["pass_rate"] for item in metrics["trend"]])
        coverage_data = json.dumps([item["coverage"] for item in metrics["trend"]])
        
        html_content = html_template.format(
            avg_pass_rate=metrics["overall"]["avg_pass_rate"],
            avg_duration=metrics["overall"]["avg_duration"],
            avg_coverage=metrics["overall"]["avg_coverage"],
            total_runs=metrics["overall"]["total_runs"],
            flaky_tests_rows=flaky_tests_rows,
            trend_labels=trend_labels,
            pass_rate_data=pass_rate_data,
            coverage_data=coverage_data,
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        )
        
        with open(output_path, 'w') as f:
            f.write(html_content)
        
        return output_path

# Pytest plugin for metrics collection
class MetricsPlugin:
    def __init__(self):
        self.collector = TestMetricsCollector()
        self.start_time = None
        self.test_results = []
    
    def pytest_sessionstart(self, session):
        self.start_time = time.time()
    
    def pytest_runtest_logreport(self, report):
        if report.when == "call":
            self.test_results.append({
                "name": report.nodeid,
                "status": report.outcome,
                "duration": report.duration,
                "error": str(report.longrepr) if report.failed else None
            })
    
    def pytest_sessionfinish(self, session, exitstatus):
        if self.start_time:
            duration = time.time() - self.start_time
            
            passed = len([r for r in self.test_results if r["status"] == "passed"])
            failed = len([r for r in self.test_results if r["status"] == "failed"])
            skipped = len([r for r in self.test_results if r["status"] == "skipped"])
            total = len(self.test_results)
            
            # Record test run
            run_id = self.collector.record_test_run(
                total_tests=total,
                passed=passed,
                failed=failed,
                skipped=skipped,
                duration=duration
            )
            
            # Record individual test results
            for result in self.test_results:
                self.collector.record_test_result(
                    run_id=run_id,
                    test_name=result["name"],
                    status=result["status"],
                    duration=result["duration"],
                    error_message=result["error"]
                )
            
            # Generate metrics report
            self.collector.generate_html_report()
            print(f"\n📊 Test metrics report generated: test_metrics_report.html")

# Register plugin
def pytest_configure(config):
    config.pluginmanager.register(MetricsPlugin(), "metrics")
```

---

## ✅ Best Practices Summary

### **🎯 Testing Excellence**

1. **📏 Follow Test Pyramid**: 70% unit, 20% integration, 10% E2E
2. **⚡ Fail Fast**: Catch bugs early in development cycle  
3. **🔄 Automate Everything**: CI/CD integration for all test types
4. **📊 Measure Quality**: Track coverage, performance, and reliability metrics
5. **🧹 Clean Test Data**: Proper setup/teardown and data isolation
6. **🔒 Security First**: Regular security testing and vulnerability scanning
7. **📱 Cross-Platform**: Test on different browsers, devices, and environments
8. **🎭 Real Scenarios**: Tests should mirror actual user behavior
9. **📈 Performance Aware**: Include performance testing in regular cycles
10. **🔍 Continuous Improvement**: Regular review and optimization of test suite

### **🚀 Implementation Roadmap**

```mermaid
gantt
    title Testing Implementation Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1
    Unit Test Framework    :done, unit, 2025-01-01, 2025-01-07
    Basic Integration Tests :done, integration, 2025-01-08, 2025-01-14
    section Phase 2
    E2E Test Suite        :e2e, 2025-01-15, 2025-01-21
    Performance Testing   :perf, 2025-01-22, 2025-01-28
    section Phase 3
    Security Testing      :security, 2025-01-29, 2025-02-04
    Metrics Dashboard     :metrics, 2025-02-05, 2025-02-11
    section Phase 4
    CI/CD Integration     :cicd, 2025-02-12, 2025-02-18
    Documentation         :docs, 2025-02-19, 2025-02-25
```

---

**🧙 Generated by BMad Master Testing Framework**  
*Quality is not an act, it is a habit. Test early, test often, test everything.*

**Last Updated**: January 15, 2025  
**Version**: 2.1.0
