#!/usr/bin/env python3
"""
Test để debug toàn bộ flow của enable_context_manager
"""
import sys
sys.path.append('./backend')

def test_agent_config_flow():
    """Test AgentConfig flow"""
    print("🔧 TESTING AGENT CONFIG FLOW")
    print("=" * 50)
    
    try:
        from core.run import AgentConfig
        
        # Test default value
        config = AgentConfig(
            thread_id="test",
            project_id="test",
            stream=True
        )
        print(f"✅ AgentConfig default enable_context_manager: {config.enable_context_manager}")
        
        # Test explicit True
        config_true = AgentConfig(
            thread_id="test",
            project_id="test", 
            stream=True,
            enable_context_manager=True
        )
        print(f"✅ AgentConfig explicit True: {config_true.enable_context_manager}")
        
        # Test explicit False
        config_false = AgentConfig(
            thread_id="test",
            project_id="test",
            stream=True,
            enable_context_manager=False
        )
        print(f"✅ AgentConfig explicit False: {config_false.enable_context_manager}")
        
    except Exception as e:
        print(f"❌ AgentConfig test failed: {e}")

def test_run_agent_signature():
    """Test run_agent function signature"""
    print("\n🔧 TESTING RUN_AGENT SIGNATURE")
    print("=" * 50)
    
    try:
        import inspect
        from core.run import run_agent
        
        sig = inspect.signature(run_agent)
        enable_context_manager_param = sig.parameters['enable_context_manager']
        
        print(f"✅ run_agent parameter: {enable_context_manager_param}")
        print(f"✅ Default value: {enable_context_manager_param.default}")
        print(f"✅ Type annotation: {enable_context_manager_param.annotation}")
        
    except Exception as e:
        print(f"❌ run_agent signature test failed: {e}")

def test_run_agent_background_signature():
    """Test run_agent_background function signature"""
    print("\n🔧 TESTING RUN_AGENT_BACKGROUND SIGNATURE")
    print("=" * 50)

    try:
        import inspect
        from run_agent_background import run_agent_background

        sig = inspect.signature(run_agent_background)
        print(f"✅ All parameters: {list(sig.parameters.keys())}")

        if 'enable_context_manager' in sig.parameters:
            enable_context_manager_param = sig.parameters['enable_context_manager']
            print(f"✅ run_agent_background parameter: {enable_context_manager_param}")
            print(f"✅ Default value: {enable_context_manager_param.default}")
            print(f"✅ Type annotation: {enable_context_manager_param.annotation}")
        else:
            print("❌ enable_context_manager parameter not found!")

    except Exception as e:
        print(f"❌ run_agent_background signature test failed: {e}")
        import traceback
        traceback.print_exc()

def test_thread_manager_signature():
    """Test ThreadManager.run_thread signature"""
    print("\n🔧 TESTING THREAD_MANAGER SIGNATURE")
    print("=" * 50)
    
    try:
        import inspect
        from core.agentpress.thread_manager import ThreadManager
        
        sig = inspect.signature(ThreadManager.run_thread)
        enable_context_manager_param = sig.parameters['enable_context_manager']
        
        print(f"✅ ThreadManager.run_thread parameter: {enable_context_manager_param}")
        print(f"✅ Default value: {enable_context_manager_param.default}")
        print(f"✅ Type annotation: {enable_context_manager_param.annotation}")
        
    except Exception as e:
        print(f"❌ ThreadManager signature test failed: {e}")

def test_agent_runs_endpoint():
    """Test agent_runs endpoint default"""
    print("\n🔧 TESTING AGENT_RUNS ENDPOINT")
    print("=" * 50)
    
    try:
        # Read the file and check the default value
        with open('backend/core/agent_runs.py', 'r') as f:
            content = f.read()
            
        # Look for the Form(True) pattern
        if "enable_context_manager: Optional[bool] = Form(True)" in content:
            print("✅ agent_runs.py: enable_context_manager default is Form(True)")
        elif "enable_context_manager: Optional[bool] = Form(False)" in content:
            print("❌ agent_runs.py: enable_context_manager default is Form(False)")
        else:
            print("⚠️ agent_runs.py: Could not find enable_context_manager Form default")
            
    except Exception as e:
        print(f"❌ agent_runs endpoint test failed: {e}")

def test_all_defaults():
    """Test all default values in the chain"""
    print("\n🎯 SUMMARY OF ALL DEFAULTS")
    print("=" * 50)
    
    defaults = {}
    
    # AgentConfig
    try:
        from core.run import AgentConfig
        config = AgentConfig(thread_id="test", project_id="test", stream=True)
        defaults['AgentConfig'] = config.enable_context_manager
    except:
        defaults['AgentConfig'] = "ERROR"
    
    # run_agent
    try:
        import inspect
        from core.run import run_agent
        sig = inspect.signature(run_agent)
        defaults['run_agent'] = sig.parameters['enable_context_manager'].default
    except:
        defaults['run_agent'] = "ERROR"
    
    # run_agent_background
    try:
        import inspect
        from run_agent_background import run_agent_background
        sig = inspect.signature(run_agent_background)
        defaults['run_agent_background'] = sig.parameters['enable_context_manager'].default
    except:
        defaults['run_agent_background'] = "ERROR"
    
    # ThreadManager.run_thread
    try:
        import inspect
        from core.agentpress.thread_manager import ThreadManager
        sig = inspect.signature(ThreadManager.run_thread)
        defaults['ThreadManager.run_thread'] = sig.parameters['enable_context_manager'].default
    except:
        defaults['ThreadManager.run_thread'] = "ERROR"
    
    for component, default in defaults.items():
        if default is True:
            print(f"✅ {component}: {default}")
        elif default is False:
            print(f"❌ {component}: {default}")
        elif default is None:
            print(f"⚠️ {component}: {default} (None)")
        else:
            print(f"🔍 {component}: {default}")

if __name__ == "__main__":
    test_agent_runs_endpoint()
    test_run_agent_background_signature()
    test_run_agent_signature()
    test_agent_config_flow()
    test_thread_manager_signature()
    test_all_defaults()
