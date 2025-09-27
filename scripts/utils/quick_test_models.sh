#!/bin/bash

# 🚀 Quick Model Tester
# Usage: ./quick_test_models.sh [model1,model2,...]

API_KEY="2AXb5AGN4VZPYn2JaxDyCuETC5jCPjxpV8I22KZGRbLprniI"
API_BASE="https://v98store.com/v1/chat/completions"

# Default models if none provided
DEFAULT_MODELS="gpt-4o-mini,gemini-2.5-flash-preview-05-20,grok-3,qwen3-32b"

# Use provided models or default
MODELS=${1:-$DEFAULT_MODELS}

echo "🧪 QUICK MODEL TESTER"
echo "===================="

IFS=',' read -ra MODEL_ARRAY <<< "$MODELS"

for model in "${MODEL_ARRAY[@]}"; do
    echo "Testing: $model"
    
    response=$(curl -s -w "%{http_code}" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"$model\",
            \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}],
            \"max_tokens\": 10
        }" \
        "$API_BASE")
    
    http_code="${response: -3}"
    body="${response%???}"
    
    if [ "$http_code" = "200" ]; then
        content=$(echo "$body" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['choices'][0]['message']['content'][:50] + '...' if len(data['choices'][0]['message']['content']) > 50 else data['choices'][0]['message']['content'])" 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo "✅ SUCCESS: $content"
        else
            echo "✅ SUCCESS: Response received"
        fi
    else
        echo "❌ FAILED ($http_code)"
    fi
    
    echo "------------------------"
done

echo ""
echo "💡 To use working models in frontend:"
echo "   Add Custom Model → openai-compatible/[model-name]"
