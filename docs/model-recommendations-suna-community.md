# Model Recommendations for ChainLens.so Community

## 📊 Research Summary: Cost-Effective Models

Dựa trên research về cộng đồng chainlens.so và các best practices, đây là các model được recommend vừa tiết kiệm chi phí vừa hiệu quả:

## 🏆 Top Recommended Models (Cost-Effective)

### 1. **GPT-4o Mini** ⭐ (Đang sử dụng)
- **Provider**: OpenAI Compatible (v98store)
- **Pricing**: 
  - Input: $0.15 / million tokens
  - Output: $0.60 / million tokens
- **Context Window**: 128,000 tokens
- **Capabilities**: Chat, Function Calling, Vision
- **Priority**: 95 (Recommended)
- **Tier**: Free + Paid
- **Why**: 
  - ✅ Rất tiết kiệm chi phí
  - ✅ Hiệu suất tốt cho đa số use cases
  - ✅ Hỗ trợ function calling và vision
  - ✅ Context window đủ lớn (128k)

### 2. **DeepSeek V3 (0324)** 💡 (Nên thêm)
- **Provider**: DeepSeek (OpenRouter hoặc Self-hosted)
- **Pricing**:
  - Input: $0.27 / million tokens (cache miss) hoặc $0.07 (cache hit)
  - Output: $1.10 / million tokens
- **Context Window**: 128,000+ tokens
- **Capabilities**: Chat, Function Calling
- **Why**:
  - ✅ Rất rẻ, đặc biệt với cache
  - ✅ Có thể self-host để tiết kiệm hơn
  - ✅ Performance tốt
  - ⚠️ Cần thêm vào registry nếu muốn dùng

### 3. **Claude Haiku 4.5** (Đang có)
- **Provider**: Anthropic / Bedrock
- **Pricing**:
  - Input: $1.00 / million tokens
  - Output: $5.00 / million tokens
- **Context Window**: 200,000 tokens
- **Capabilities**: Chat, Function Calling, Vision
- **Priority**: 102 (Highest)
- **Why**:
  - ✅ Giá hợp lý cho performance
  - ✅ Context window lớn (200k)
  - ✅ Hỗ trợ đầy đủ capabilities

### 4. **Qwen3 235B** 💡 (Commented out, có thể enable)
- **Provider**: OpenRouter
- **Pricing**:
  - Input: $0.13 / million tokens
  - Output: $0.60 / million tokens
- **Context Window**: 128,000 tokens
- **Capabilities**: Chat, Function Calling
- **Status**: Currently disabled
- **Why**:
  - ✅ Rẻ nhất trong danh sách ($0.13 input)
  - ✅ Performance tốt
  - ⚠️ Cần test trước khi enable

## 📈 Cost Comparison (per million tokens)

| Model | Input Cost | Output Cost | Total (1M in + 1M out) | Best For |
|-------|-----------|-------------|------------------------|----------|
| **Qwen3 235B** | $0.13 | $0.60 | **$0.73** | Ultra budget |
| **GPT-4o Mini** | $0.15 | $0.60 | **$0.75** | General purpose ⭐ |
| **DeepSeek V3** | $0.27 | $1.10 | **$1.37** | Self-hosted option |
| **Claude Haiku 4.5** | $1.00 | $5.00 | **$6.00** | High quality |
| **Claude Sonnet 4.5** | $3.00 | $15.00 | **$18.00** | Complex reasoning |

## 🎯 Recommendations for ChainLens.so

### Current Setup ✅
- **GPT-4o Mini** đã được config và đang hoạt động tốt
- Pricing: $0.15/$0.60 - rất competitive
- Recommended và enabled

### Suggested Additions 💡

1. **Enable Qwen3 235B** (nếu OpenRouter có sẵn)
   - Rẻ nhất: $0.13/$0.60
   - Cần test performance trước

2. **Add DeepSeek V3** (nếu có OpenRouter hoặc self-hosted)
   - Rất rẻ với cache: $0.07/$1.10
   - Performance tốt

3. **Keep Claude Haiku 4.5** as premium option
   - Giá hợp lý cho quality cao
   - Context window lớn (200k)

## 💰 Cost Optimization Tips

1. **Use GPT-4o Mini for most tasks** - Best balance
2. **Use Qwen3/DeepSeek for high-volume, simple tasks** - Ultra cheap
3. **Use Claude Haiku for complex reasoning** - When quality matters
4. **Enable caching** - Reduces costs significantly (DeepSeek: $0.07 vs $0.27)

## 🔧 Implementation Status

### ✅ Currently Enabled
- `openai-compatible/gpt-4o-mini` - Recommended, Priority 95
- `anthropic/claude-haiku-4-5` - Recommended, Priority 102
- `anthropic/claude-sonnet-4-5-20250929` - Recommended, Priority 101

### 💡 Suggested to Add
- DeepSeek V3 (via OpenRouter or self-hosted)
- Qwen3 235B (enable if available)

## 📝 Notes

- **GPT-4o Mini** là lựa chọn tốt nhất hiện tại cho cost-effectiveness
- Cộng đồng chainlens.so thường prefer models có pricing < $1.00 input
- Self-hosted options (DeepSeek, Ollama) giúp tiết kiệm hơn nữa
- Context window 128k+ là đủ cho hầu hết use cases

