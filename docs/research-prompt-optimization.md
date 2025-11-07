# Research Prompt: System Prompt Optimization for ChainLens AI Worker

## 🎯 Research Objective

Bạn là một AI Research Specialist chuyên về LLM prompt engineering và system optimization. Nhiệm vụ của bạn là research và đề xuất chi tiết cách tối ưu system prompt cho hệ thống ChainLens AI Worker - một generalist AI Worker với full-stack architecture.

## 📋 System Context

### 1. System Architecture
- **Frontend**: Next.js 15+ với TypeScript, React Query
- **Backend**: Python 3.11+ với FastAPI, Supabase, Redis, LiteLLM, Dramatiq
- **Agent System**: Isolated Docker environments với comprehensive tool execution
- **Database**: Supabase PostgreSQL với Row Level Security
- **LLM Integration**: LiteLLM cho multi-provider support (OpenAI Compatible, Anthropic, Bedrock)

### 2. Current LLM Models
Hệ thống hỗ trợ nhiều models:
- **OpenAI Compatible** (v98store API): gpt-4o-mini, qwen3-30b, deepseek-v3-1, qwen3-235b, claude-haiku-4-5
- **Anthropic**: Claude Haiku 4.5, Sonnet 4.5
- **AWS Bedrock**: MAP-tagged application inference profiles

### 3. Current System Prompt Structure

System prompt được build trong `backend/core/run.py` - `PromptManager.build_system_prompt()` với cấu trúc:

```
1. Default system prompt (get_system_prompt())
   - Agent role và capabilities
   - Core instructions
   
2. Agent-specific system prompt (if exists)
   - Custom instructions từ agent config
   
3. Agent builder prompt (if builder tools enabled)
   - Instructions cho agent creation/management tools
   
4. Knowledge base context (if available)
   - Agent-specific knowledge base
   - Formatted với headers
   
5. MCP tools info (if MCP enabled)
   - List of available MCP tools
   - Usage instructions
   - Critical result handling instructions
   
6. XML tool calling instructions (if tools available)
   - Full OpenAPI schemas in JSON format
   - Function calling examples
   - Parameter formatting rules
   
7. Current date/time information
   - Full date string
   - Year, month, day separately
   - Usage instructions
```

### 4. Current Issues Identified

#### Issue 1: System Prompt Bloat
- **Problem**: System prompt được build bằng cách concatenate nhiều sections
- **Current Size**: ~3000-5000 tokens
- **Impact**: 
  - Tăng token count → tăng cost ($0.001-0.002 per request)
  - Giảm context window cho actual conversation
  - Slower processing (2-5 seconds)

#### Issue 2: Redundant Information
- Date/time info được append mỗi request (có thể cache)
- Tool schemas duplicate (trong prompt + API parameters)
- Verbose section headers và instructions

#### Issue 3: No Optimization
- Không có prompt compression
- Không có dynamic loading (load tất cả sections mỗi lần)
- Không có token budget management

#### Issue 4: Limited Caching
- Prompt caching chỉ work với Anthropic models
- OpenAI Compatible models (v98store) không được benefit
- No response caching

### 5. Code Locations

**Key Files**:
- `backend/core/run.py` - `PromptManager.build_system_prompt()` (lines 326-491)
- `backend/core/prompts/prompt.py` - `get_system_prompt()` function
- `backend/core/agentpress/prompt_caching.py` - Prompt caching (chỉ Anthropic)
- `backend/core/services/llm.py` - LLM API calls
- `backend/core/agentpress/thread_manager.py` - Message processing

**Current Implementation Pattern**:
```python
system_content = default_system_content
if agent_config:
    system_content += agent_specific_prompt
if has_builder_tools:
    system_content += builder_prompt
if has_knowledge_base:
    system_content += kb_section
if has_mcp:
    system_content += mcp_info
if has_tools:
    system_content += tool_schemas_json
system_content += datetime_info
```

## 🔬 Research Requirements

### Requirement 1: Prompt Compression Techniques
Research và đề xuất:
1. **Semantic Compression Methods**
   - Cách remove redundant instructions mà không mất meaning
   - Techniques để merge similar sections
   - Abbreviation strategies cho common phrases
   - Token reduction targets: 30-50%

2. **Latest Research (2024-2025)**
   - Prompt compression papers
   - Semantic similarity techniques
   - LLM-aware compression methods
   - Empirical results và benchmarks

3. **Implementation Approaches**
   - Pre-processing compression
   - Runtime compression
   - Model-specific optimizations
   - Trade-offs giữa compression và quality

### Requirement 2: Dynamic Prompt Loading
Research và đề xuất:
1. **Section Prioritization**
   - Cách determine which sections are essential
   - Priority scoring mechanisms
   - Context-aware section selection
   - Token budget allocation strategies

2. **Adaptive Prompt Length**
   - Cách calculate optimal prompt length based on:
     - Model context window (128k, 200k, 1M+)
     - Available tokens for conversation
     - Task complexity
     - Historical performance data

3. **Lazy Loading Strategies**
   - Conditional section inclusion
   - Progressive enhancement
   - On-demand section loading
   - Cache-friendly approaches

### Requirement 3: Tool Schema Optimization
Research và đề xuất:
1. **Schema Representation**
   - Alternatives to full JSON schema in prompt
   - Tool name + description only
   - Hierarchical tool organization
   - Schema compression techniques

2. **Separation of Concerns**
   - Tool schemas trong API params vs system prompt
   - When to include tool info in prompt
   - Format optimization (XML vs JSON vs text)

3. **Tool Discovery Patterns**
   - How LLMs discover available tools
   - Minimal tool description requirements
   - Example-based tool documentation

### Requirement 4: Prompt Caching for All Models
Research và đề xuất:
1. **OpenAI Compatible Caching**
   - Does v98store API support caching?
   - OpenAI API caching mechanisms
   - Implementation patterns
   - Cost/benefit analysis

2. **Universal Caching Strategy**
   - Model-agnostic caching approach
   - Cache key generation
   - Cache invalidation strategies
   - Performance optimization

3. **Hybrid Caching**
   - Combine prompt caching + response caching
   - Semantic similarity for cache lookup
   - Cache hit rate optimization

### Requirement 5: Message Compression
Research và đề xuất:
1. **Conversation Summarization**
   - Techniques để summarize old messages
   - When to summarize vs keep full history
   - Summary quality preservation
   - Token savings calculation

2. **Sliding Window Strategies**
   - Recent messages + summary of old
   - Context window management
   - Important message retention
   - User preference handling

3. **Smart Message Selection**
   - Relevance scoring
   - Context-aware message filtering
   - Priority-based retention

### Requirement 6: Response Caching
Research và đề xuất:
1. **Cache Key Generation**
   - Semantic similarity hashing
   - Prompt fingerprinting
   - Model-specific considerations
   - Cache granularity (full vs partial)

2. **Cache Strategies**
   - LRU vs LFU vs semantic
   - Cache size management
   - TTL strategies
   - Invalidation policies

3. **Quality Assurance**
   - Cache hit validation
   - Response quality checks
   - Fallback mechanisms
   - User experience impact

### Requirement 7: Multi-Model Orchestration (Model Routing)
Research và đề xuất:
1. **Hierarchical Model Usage**
   - **Concept**: Sử dụng nhiều models trong cùng 1 request, mỗi model cho task phù hợp
   - **Use Cases**:
     - Model nhỏ/cheap (gpt-4o-mini) → Phân tích câu hỏi, simple reasoning
     - Model medium (gpt-4o) → Tạo plan, complex reasoning
     - Model specialized (qwen3-30b) → Web crawling, data extraction
     - Model large (gpt-5, claude-sonnet) → Tổng hợp, final analysis
   - **Benefits**:
     - Cost optimization (dùng cheap model cho simple tasks)
     - Quality optimization (dùng powerful model cho complex tasks)
     - Speed optimization (parallel execution)
     - Specialized capabilities (model phù hợp cho từng task)

2. **Model Routing Strategies**
   - **Task-based routing**: Route based on task complexity
     - Simple: gpt-4o-mini ($0.15/$0.60)
     - Medium: gpt-4o ($2.50/$10.00)
     - Complex: claude-sonnet ($3.00/$15.00)
   - **Capability-based routing**: Route based on required capabilities
     - Web crawling: qwen3-30b (specialized)
     - Code generation: gpt-4o (better at coding)
     - Analysis: claude-sonnet (better reasoning)
   - **Cost-aware routing**: Route based on cost/quality trade-off
     - Use cheap model first, upgrade if needed
     - Fallback to expensive model only when necessary

3. **Implementation Patterns**
   - **Sequential Chaining**:
     ```
     Step 1: gpt-4o-mini → Analyze question → Extract intent
     Step 2: gpt-4o → Create execution plan → Break down tasks
     Step 3: qwen3-30b → Execute web crawling → Gather data
     Step 4: claude-sonnet → Analyze results → Generate final response
     ```
   - **Parallel Execution**:
     ```
     Task A: gpt-4o-mini → Research topic A (parallel)
     Task B: qwen3-30b → Crawl website B (parallel)
     Task C: gpt-4o → Analyze data C (parallel)
     Final: claude-sonnet → Synthesize all results
     ```
   - **Conditional Routing**:
     ```
     If task_complexity < threshold:
         Use: gpt-4o-mini
     Else if task_complexity < high_threshold:
         Use: gpt-4o
     Else:
         Use: claude-sonnet
     ```

4. **Technical Implementation**
   - **LiteLLM Router**: Sử dụng LiteLLM's router với fallbacks
   - **Custom Router**: Build custom routing logic
   - **Task Classification**: AI-powered task classification để chọn model
   - **Cost Tracking**: Track cost per model per task
   - **Quality Monitoring**: Monitor quality per model

5. **Research Questions**
   - What are the latest multi-model orchestration techniques?
   - How to determine optimal model for each task?
   - What's the cost/quality trade-off?
   - How to implement in LiteLLM?
   - What's the latency impact?
   - How to handle errors và fallbacks?
   - What's the optimal routing strategy?

6. **Expected Benefits**
   - **Cost Reduction**: 40-60% (use cheap models for simple tasks)
   - **Quality Improvement**: Better results (right model for right task)
   - **Speed**: Parallel execution can be faster
   - **Flexibility**: Adapt to different task requirements

### Requirement 8: Cost Optimization
Research và đề xuất:
1. **Token Cost Analysis**
   - Current cost breakdown
   - Optimization impact calculation
   - ROI analysis
   - Cost monitoring strategies

2. **Model Selection Optimization**
   - When to use cheaper models
   - Quality vs cost trade-offs
   - Model routing strategies (see Requirement 7)
   - Fallback mechanisms

3. **Batch Processing**
   - Batch prompt optimization
   - Parallel request handling
   - Cost aggregation benefits

## 📊 Expected Deliverables

### Deliverable 1: Comprehensive Research Report
Format: Markdown document với sections:
1. **Executive Summary**
   - Key findings
   - Priority recommendations
   - Expected impact

2. **Detailed Analysis per Requirement**
   - Current state analysis
   - Research findings
   - Best practices
   - Implementation recommendations
   - Code examples (Python)
   - Performance benchmarks

3. **Implementation Roadmap**
   - Phase 1: Quick wins (1-2 hours)
   - Phase 2: Medium optimizations (4-6 hours)
   - Phase 3: Advanced features (1-2 days)
   - Dependencies và prerequisites

4. **Code Examples**
   - Optimized `build_system_prompt()` function
   - Prompt compression utilities
   - Caching implementations
   - **Multi-model orchestration router** (NEW)
   - Testing strategies

5. **Metrics & Monitoring**
   - KPIs to track
   - Measurement methods
   - Success criteria
   - Baseline vs optimized comparison

6. **Multi-Model Orchestration Design** (NEW)
   - Router architecture
   - Task classification system
   - Model selection algorithms
   - Cost/quality optimization strategies
   - Implementation examples với LiteLLM

### Deliverable 2: Implementation Code
- Optimized prompt builder class
- Compression utilities
- Caching implementations
- Unit tests
- Integration examples

### Deliverable 3: Performance Benchmarks
- Token count reduction (target: 60-70%)
- Cost reduction (target: 50-60%)
- Response time improvement (target: 40-60%)
- Quality preservation metrics
- Cache hit rates

## 🎯 Success Criteria

### Quantitative Metrics:
- ✅ System prompt token count: Reduce 60-70%
- ✅ API call cost: Reduce 50-60%
- ✅ Response time: Improve 40-60%
- ✅ Cache hit rate: 20-40% for responses
- ✅ Code changes: Minimal (mostly refactoring)

### Qualitative Metrics:
- ✅ Response quality: Maintained or improved
- ✅ Code maintainability: Improved
- ✅ System flexibility: Enhanced
- ✅ Developer experience: Better

## 📚 Research Sources

### Academic Papers:
- Prompt compression research (2024-2025)
- LLM optimization techniques
- Caching strategies for LLMs
- Token efficiency studies

### Industry Best Practices:
- OpenAI prompt engineering guide
- Anthropic prompt caching documentation
- LiteLLM optimization patterns
- LangChain optimization techniques

### Technical Documentation:
- OpenAI API caching
- Anthropic prompt caching
- LiteLLM router documentation
- Model-specific optimizations

## 🔍 Specific Research Questions

1. **Prompt Compression**:
   - What are the latest semantic compression techniques?
   - How much can we compress without quality loss?
   - Are there model-specific compression strategies?
   - What's the optimal compression ratio?

2. **Dynamic Loading**:
   - How to determine essential vs optional sections?
   - What's the best token budget allocation?
   - How to handle context window variations?
   - What's the impact on response quality?

3. **Tool Schema Optimization**:
   - Can we remove schemas from prompt entirely?
   - What's the minimal tool description needed?
   - How do different models discover tools?
   - What's the quality impact of schema reduction?

4. **Caching**:
   - Does OpenAI Compatible API support caching?
   - What's the best caching strategy for multi-model systems?
   - How to handle cache invalidation?
   - What's the optimal cache size?

5. **Message Compression**:
   - When to summarize vs keep full history?
   - What's the best summarization technique?
   - How to preserve important context?
   - What's the user experience impact?

6. **Multi-Model Orchestration** (NEW):
   - What are the latest multi-model orchestration techniques?
   - How to classify tasks for optimal model selection?
   - What's the cost/quality trade-off for different routing strategies?
   - How to implement sequential vs parallel model chaining?
   - What's the latency impact of multi-model workflows?
   - How to handle errors và fallbacks in multi-model chains?
   - What's the optimal routing algorithm?
   - How to balance cost vs quality vs speed?
   - Examples: GPT-4o-mini for analysis → GPT-4o for planning → Qwen3-30b for crawling → Claude-Sonnet for synthesis

7. **Cost Optimization**:
   - What's the actual cost breakdown?
   - Which optimizations have highest ROI?
   - How to monitor and track savings?
   - What's the break-even point?
   - How much can multi-model orchestration save? (40-60% potential)

## 💡 Additional Considerations

### Technical Constraints:
- Must work with LiteLLM router
- Must support multiple model providers
- Must maintain backward compatibility
- Must not break existing functionality

### Business Requirements:
- Minimize code changes
- Maximize cost savings
- Maintain response quality
- Improve user experience

### Implementation Priorities:
1. **High Impact, Low Effort**: Quick wins
2. **High Impact, Medium Effort**: Core optimizations
3. **High Impact, High Effort**: Advanced features
4. **Low Impact**: Nice-to-have improvements

## 📝 Research Methodology

1. **Literature Review**
   - Academic papers (2024-2025)
   - Industry documentation
   - Best practices guides
   - Case studies

2. **Code Analysis**
   - Review current implementation
   - Identify optimization opportunities
   - Analyze token usage patterns
   - Benchmark current performance

3. **Experimental Design**
   - Design optimization experiments
   - Define success metrics
   - Plan A/B testing approach
   - Create test scenarios

4. **Implementation Planning**
   - Break down into phases
   - Estimate effort
   - Identify dependencies
   - Plan rollback strategies

5. **Validation**
   - Test optimizations
   - Measure improvements
   - Validate quality preservation
   - Document results

## 🚀 Expected Output Format

### Research Report Structure:
```markdown
# System Prompt Optimization Research Report

## Executive Summary
[Key findings, recommendations, impact]

## 1. Prompt Compression Analysis
[Detailed analysis, techniques, implementation]

## 2. Dynamic Loading Strategies
[Prioritization, adaptive length, lazy loading]

## 3. Tool Schema Optimization
[Alternatives, separation, discovery patterns]

## 4. Caching Implementation
[Universal caching, OpenAI Compatible, hybrid]

## 5. Message Compression
[Summarization, sliding window, smart selection]

## 6. Response Caching
[Key generation, strategies, quality assurance]

## 7. Cost Optimization Analysis
[Token analysis, model selection, batch processing]

## Implementation Roadmap
[Phased approach, code examples, testing]

## Performance Benchmarks
[Metrics, comparisons, validation]

## Conclusion & Recommendations
[Summary, next steps, risks]
```

## ⚠️ Important Notes

1. **Quality Preservation**: Tất cả optimizations phải maintain hoặc improve response quality
2. **Backward Compatibility**: Không break existing functionality
3. **Minimal Code Changes**: Ưu tiên refactoring over rewriting
4. **Measurable Impact**: Tất cả optimizations phải có metrics để track
5. **Production Ready**: Code examples phải production-ready, not just prototypes

## 🎯 Final Instructions

Hãy research chi tiết và comprehensive về tất cả các aspects trên. Đưa ra:
- **Concrete recommendations** với code examples
- **Performance benchmarks** với actual numbers
- **Implementation roadmap** với clear phases
- **Risk assessment** và mitigation strategies
- **Success metrics** và monitoring approaches

**Đặc biệt chú ý Requirement 7: Multi-Model Orchestration** - đây là một kỹ thuật mới và quan trọng:
- Research các techniques để sử dụng nhiều models trong 1 request
- Design architecture cho model routing system
- Provide code examples cho sequential và parallel model chaining
- Analyze cost/quality/speed trade-offs
- Recommend optimal routing strategies

Focus vào **practical, implementable solutions** với **minimal code changes** nhưng **maximum impact**.

### Example Multi-Model Workflow to Research:
```
User Question: "Research latest AI trends and create a comprehensive report"

Step 1: gpt-4o-mini ($0.15/$0.60)
  → Analyze question
  → Extract key topics: "AI trends", "comprehensive report"
  → Determine research scope

Step 2: gpt-4o ($2.50/$10.00)
  → Create research plan
  → Break down into subtasks
  → Define report structure

Step 3: qwen3-30b ($0.10/$0.50) - Parallel execution
  → Task A: Crawl tech news websites
  → Task B: Search academic papers
  → Task C: Gather social media trends

Step 4: claude-sonnet ($3.00/$15.00)
  → Synthesize all research data
  → Analyze trends
  → Generate comprehensive report
  → Add insights và recommendations

Total Cost: ~$0.20 (vs $3.00 if use claude-sonnet for everything)
Quality: Better (right model for right task)
Speed: Faster (parallel execution)
```

Research cách implement workflow này trong LiteLLM và ChainLens architecture.

---

**Research Deadline**: [Specify if needed]  
**Output Format**: Markdown document + Code examples  
**Target Audience**: Senior developers implementing the optimizations

