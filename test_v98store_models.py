#!/usr/bin/env python3
"""
Test v98store model names and availability.
"""

import os
import sys
sys.path.append('backend')

# Set environment variables
os.environ['AUTO_MODEL_ENABLED'] = 'true'
os.environ['ENV_MODE'] = 'local'

from backend.core.ai_models.registry import registry

def test_v98store_models():
    """Test v98store model names."""
    
    print("🧪 Testing v98store Model Names...")
    
    # Test model resolution
    test_models = [
        "gpt-4o",
        "gpt-4o-mini", 
        "openai-compatible/gpt-4o",
        "openai-compatible/gpt-4o-mini"
    ]
    
    for model_name in test_models:
        print(f"\n📝 Testing model: {model_name}")
        
        try:
            # Test if model exists in registry
            model = registry.get(model_name)
            if model:
                print(f"✅ Found in registry: {model.name}")
                print(f"   Provider: {model.provider}")
                print(f"   Model ID: {model.id}")
                print(f"   Pricing: {model.pricing}")
            else:
                print(f"❌ Not found in registry")

            # Test resolution
            resolved = registry.resolve_model_id(model_name)
            print(f"🔍 Resolved to: {resolved}")
            
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
        
        print("-" * 40)

def test_auto_selection_with_debug():
    """Test auto selection with debug info."""
    
    print("\n🤖 Testing Auto Selection with Debug...")
    
    from backend.core.ai_models.manager import model_manager
    
    test_queries = [
        "Hello",
        "Please implement a complex algorithm"
    ]
    
    for query in test_queries:
        print(f"\n📝 Query: '{query}'")
        
        try:
            # Test auto selection
            result = model_manager._auto_select_model(query)
            print(f"✅ Auto selected: {result}")
            
            # Test if selected model exists in registry
            model = registry.get(result)
            if model:
                print(f"✅ Selected model found in registry")
                print(f"   Provider: {model.provider}")
                print(f"   API Base: {getattr(model, 'api_base', 'N/A')}")
            else:
                print(f"❌ Selected model NOT found in registry")
                
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    print("🚀 v98store Model Test")
    print("=" * 60)
    
    test_v98store_models()
    test_auto_selection_with_debug()
    
    print("\n✅ Test completed!")
