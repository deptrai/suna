# 📏 Testing Standards - ChainLens Platform

**Document Version**: 1.0  
**Last Updated**: 2025-09-10  
**Sprint**: Foundation & Infrastructure (Sprint 1)

## 🎯 Overview

This document establishes testing standards, conventions, and best practices for maintaining high-quality, consistent tests across the ChainLens platform.

## 📝 Test Naming Conventions

### **Unit Tests**
```python
# Python - Use descriptive names with 'should' pattern
def test_should_return_positive_score_when_sentiment_is_positive():
    pass

def test_should_raise_validation_error_when_input_is_empty():
    pass
```

```typescript
// TypeScript - Use describe blocks with nested contexts
describe('SentimentService', () => {
  describe('calculateScore', () => {
    it('should return positive score when sentiment is positive', () => {});
    it('should throw error when input is empty', () => {});
  });
});
```

### **Integration Tests**
```python
# Python - Include 'integration' in filename or mark
def test_api_should_return_200_when_valid_token_provided():
    pass

# Mark integration tests
@pytest.mark.integration
def test_database_integration_with_real_connection():
    pass
```

### **File Naming**
```
backend/tests/
├── unit/
│   ├── test_sentiment_service.py
│   └── test_token_analyzer.py
├── integration/
│   ├── test_api_endpoints.py
│   └── test_database_operations.py
└── e2e/
    └── test_complete_analysis_workflow.py

microservices/*/src/
├── services/
│   └── sentiment.service.spec.ts
├── controllers/
│   └── sentiment.controller.spec.ts
└── __tests__/
    └── integration/
        └── sentiment.api.integration.spec.ts
```

## 🏗️ Test Structure Standards

### **AAA Pattern (Arrange-Act-Assert)**
```python
def test_should_calculate_sentiment_score():
    # Arrange - Set up test data and mocks
    service = SentimentService()
    text = "This is a positive message"
    
    # Act - Execute the function under test
    result = service.analyze(text)
    
    # Assert - Verify the expected outcome
    assert result.score > 0.5
    assert result.confidence > 0.8
```

### **Given-When-Then Pattern**
```typescript
describe('Token Analysis API', () => {
  it('should return analysis when valid token is provided', async () => {
    // Given - Initial state
    const token = 'ETH';
    const mockAnalysis = { score: 0.8, confidence: 0.9 };
    jest.spyOn(analysisService, 'analyze').mockResolvedValue(mockAnalysis);
    
    // When - Action is performed
    const response = await request(app)
      .post('/api/analysis')
      .send({ token });
    
    // Then - Expected outcome
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining(mockAnalysis));
  });
});
```

## 🎨 Code Quality Standards

### **Test Coverage Requirements**
- **Minimum**: 70% line coverage for all components
- **Target**: 85% line coverage for all components
- **Critical**: 95% line coverage for core business logic
- **Branches**: 85% branch coverage for complex logic

### **Test Independence**
```python
# ✅ Good - Each test is independent
def test_sentiment_positive():
    service = SentimentService()  # Fresh instance
    result = service.analyze("Great job!")
    assert result.score > 0.5

def test_sentiment_negative():
    service = SentimentService()  # Fresh instance
    result = service.analyze("This is terrible")
    assert result.score < 0.5
```

```python
# ❌ Bad - Tests depend on each other
class TestSentimentService:
    def setup_class(self):
        self.service = SentimentService()
    
    def test_positive_sets_state(self):
        self.service.analyze("Great!")  # Modifies internal state
    
    def test_negative_depends_on_state(self):
        # This test might fail if previous test didn't run
        assert self.service.last_score > 0
```

### **Mocking Standards**

#### **Mock External Dependencies**
```python
# Python - Mock external services
@pytest.fixture
def mock_external_api():
    with patch('services.external_api.ExternalAPI') as mock:
        mock.return_value.get_data.return_value = {"score": 0.8}
        yield mock

def test_service_with_external_dependency(mock_external_api):
    service = SentimentService()
    result = service.analyze_with_api("test text")
    
    mock_external_api.return_value.get_data.assert_called_once()
    assert result.score == 0.8
```

```typescript
// TypeScript - Mock modules and dependencies
jest.mock('../services/external-api', () => ({
  ExternalAPI: jest.fn().mockImplementation(() => ({
    getData: jest.fn().mockResolvedValue({ score: 0.8 })
  }))
}));
```

#### **Database Mocking**
```python
# Use in-memory database for tests
@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    TestingSessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
```

## 📊 Performance Standards

### **Test Execution Time**
- **Unit Tests**: <100ms per test
- **Integration Tests**: <1s per test
- **E2E Tests**: <30s per test
- **Full Suite**: <5 minutes

### **Test Data Management**
```python
# Use factories for test data generation
class UserFactory(factory.Factory):
    class Meta:
        model = User
    
    email = factory.Sequence(lambda n: f"user{n}@example.com")
    name = factory.Faker('name')
    is_active = True

def test_user_creation():
    user = UserFactory()  # Generates consistent test data
    assert user.email.endswith('@example.com')
```

## 🔧 Error Handling Standards

### **Exception Testing**
```python
# Python - Test exception scenarios
def test_should_raise_validation_error_for_empty_input():
    service = SentimentService()
    
    with pytest.raises(ValidationError) as exc_info:
        service.analyze("")
    
    assert "Input cannot be empty" in str(exc_info.value)
```

```typescript
// TypeScript - Test error conditions
it('should throw validation error for empty input', () => {
  const service = new SentimentService();
  
  expect(() => service.analyze('')).toThrow('Input cannot be empty');
});
```

### **Async Error Handling**
```typescript
it('should handle async errors properly', async () => {
  const service = new TokenAnalysisService();
  
  await expect(service.analyzeInvalidToken('INVALID'))
    .rejects
    .toThrow('Token not found');
});
```

## 🚀 Integration Test Standards

### **API Testing**
```typescript
describe('GET /api/tokens/:id', () => {
  it('should return token data when token exists', async () => {
    // Setup test data
    const tokenId = 'eth';
    await testDb.tokens.create({ id: tokenId, name: 'Ethereum' });
    
    const response = await request(app)
      .get(`/api/tokens/${tokenId}`)
      .expect(200);
    
    expect(response.body).toMatchObject({
      id: tokenId,
      name: 'Ethereum'
    });
  });
});
```

### **Database Testing**
```python
@pytest.mark.integration
def test_repository_should_save_and_retrieve_entity(test_db):
    # Arrange
    repository = TokenRepository(test_db)
    token = Token(symbol="ETH", name="Ethereum")
    
    # Act
    saved_token = repository.save(token)
    retrieved_token = repository.get_by_id(saved_token.id)
    
    # Assert
    assert retrieved_token.symbol == "ETH"
    assert retrieved_token.name == "Ethereum"
```

## 📈 Quality Metrics

### **Code Review Checklist**
- [ ] Tests follow naming conventions
- [ ] AAA/Given-When-Then pattern used
- [ ] External dependencies mocked appropriately
- [ ] Error scenarios covered
- [ ] Test execution time < standards
- [ ] No hardcoded values or magic numbers
- [ ] Descriptive assertions with clear error messages

### **Coverage Metrics**
```bash
# Backend coverage check
uv run pytest --cov --cov-fail-under=85

# Frontend coverage check
pnpm test -- --coverage --coverageThreshold='{"global":{"branches":85,"functions":85,"lines":85,"statements":85}}'

# Microservices coverage check
pnpm test -- --coverage --passWithNoTests
```

## 🔄 Continuous Improvement

### **Regular Reviews**
- **Weekly**: Team reviews failing/flaky tests
- **Sprint Retrospective**: Discuss testing process improvements
- **Monthly**: Update standards based on lessons learned

### **Metrics Tracking**
- Test execution time trends
- Coverage percentage changes
- Flaky test identification
- Bug escape rate analysis

---

*These standards are enforced through pre-commit hooks, CI/CD pipelines, and code review processes. All team members are expected to follow these guidelines to maintain code quality and testing consistency.*
