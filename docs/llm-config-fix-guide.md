# 🔧 LLM Configuration Fix Guide

## ❌ Vấn đề phát hiện

Từ logs backend, phát hiện lỗi:
```
litellm.exceptions.AuthenticationError: AuthenticationError: OpenAIException - Incorrect API key provided
Model: openai/gpt-5-nano-2025-08-07 (model không tồn tại)
No fallback model group found
```

## 🔍 Nguyên nhân

1. **OPENAI_API_KEY không hợp lệ hoặc đã hết hạn**
   - Key hiện tại: `sk-proj-XL...9EUA`
   - OpenAI trả về lỗi "Incorrect API key provided"

2. **Model không tồn tại**
   - Model đang dùng: `openai/gpt-5-nano-2025-08-07`
   - GPT-5 chưa được OpenAI release
   - Model này không tồn tại trong OpenAI API

3. **Fallback không hoạt động**
   - Fallback models chỉ có Bedrock/Anthropic
   - Không có fallback cho OpenAI models

## ✅ Giải pháp

### Option 1: Sử dụng OPENAI_COMPATIBLE_API_KEY (Khuyến nghị)

Bạn đã có `OPENAI_COMPATIBLE_API_KEY` và `OPENAI_COMPATIBLE_API_BASE` được config:
- Key: `sk-Righ5E8...IjaJu4soIi`
- Base: `https://v98store.com/v1`

**Cách fix:**
1. Kiểm tra xem agent config có đang dùng model nào
2. Đổi model sang model hợp lệ (ví dụ: `gpt-4`, `gpt-3.5-turbo`)
3. Hoặc sử dụng OPENAI_COMPATIBLE endpoint với model tương thích

### Option 2: Sử dụng ANTHROPIC_API_KEY

Bạn đã có `ANTHROPIC_API_KEY`:
- Key: `sk-ant-api...w-2z9qngAA`

**Cách fix:**
1. Đổi model sang Anthropic model (ví dụ: `anthropic/claude-sonnet-4`)
2. Model này sẽ dùng ANTHROPIC_API_KEY

### Option 3: Update OPENAI_API_KEY

Nếu muốn tiếp tục dùng OpenAI:
1. Tạo API key mới tại: https://platform.openai.com/account/api-keys
2. Update trong `backend/.env`:
   ```bash
   OPENAI_API_KEY=sk-proj-YOUR_NEW_KEY_HERE
   ```
3. Restart backend service

## 🛠️ Cách kiểm tra và fix ngay

### Bước 1: Kiểm tra model đang dùng

```bash
# Check agent config trong database
# Hoặc check logs để xem model nào đang được dùng
tail -50 logs/backend.log | grep -i "model"
```

### Bước 2: Update model trong agent config

Nếu agent đang dùng `gpt-5-nano-2025-08-07`, cần đổi sang model hợp lệ:

**Option A: Dùng OpenAI Compatible**
- Model: `openai/gpt-4` hoặc `openai/gpt-3.5-turbo`
- Sẽ tự động dùng `OPENAI_COMPATIBLE_API_KEY` và `OPENAI_COMPATIBLE_API_BASE`

**Option B: Dùng Anthropic**
- Model: `anthropic/claude-sonnet-4` hoặc `anthropic/claude-haiku-4-5-20251001`
- Sẽ dùng `ANTHROPIC_API_KEY`

### Bước 3: Restart backend

```bash
# Kill và restart backend
pkill -f "uvicorn.*api"
cd backend && uv run uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

## 📝 Quick Fix Script

Tạo script để test và fix:

```python
# test_llm_fix.py
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

# Test OPENAI_COMPATIBLE
print("Testing OPENAI_COMPATIBLE_API_KEY...")
compatible_key = os.getenv('OPENAI_COMPATIBLE_API_KEY')
compatible_base = os.getenv('OPENAI_COMPATIBLE_API_BASE')

if compatible_key and compatible_base:
    print(f"✅ OPENAI_COMPATIBLE configured")
    print(f"   Base: {compatible_base}")
    print(f"   Key: {compatible_key[:10]}...{compatible_key[-10:]}")
    print("\n💡 Recommended: Use model 'openai/gpt-4' or 'openai/gpt-3.5-turbo'")
else:
    print("❌ OPENAI_COMPATIBLE not configured")

# Test ANTHROPIC
print("\nTesting ANTHROPIC_API_KEY...")
anthropic_key = os.getenv('ANTHROPIC_API_KEY')
if anthropic_key:
    print(f"✅ ANTHROPIC_API_KEY configured")
    print(f"   Key: {anthropic_key[:10]}...{anthropic_key[-10:]}")
    print("\n💡 Recommended: Use model 'anthropic/claude-sonnet-4'")
else:
    print("❌ ANTHROPIC_API_KEY not configured")
```

## 🎯 Action Items

1. **Immediate Fix:**
   - [ ] Check agent config model trong database
   - [ ] Update model từ `gpt-5-nano-2025-08-07` sang model hợp lệ
   - [ ] Restart backend

2. **Long-term:**
   - [ ] Update OPENAI_API_KEY nếu muốn dùng OpenAI chính thức
   - [ ] Hoặc config để default dùng OPENAI_COMPATIBLE hoặc ANTHROPIC
   - [ ] Add validation để prevent invalid models

## 🔗 References

- OpenAI API Keys: https://platform.openai.com/account/api-keys
- LiteLLM Models: https://docs.litellm.ai/docs/providers
- Anthropic Models: https://docs.anthropic.com/claude/docs/models-overview

