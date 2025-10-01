"""
Extract modules from monolithic system prompt
Phase 2 Task 2.1.2
"""
import re
from pathlib import Path

# Read the original prompt
with open("core/prompts/prompt.py", "r") as f:
    content = f.read()

# Extract the SYSTEM_PROMPT string
match = re.search(r'SYSTEM_PROMPT = f"""(.*)"""', content, re.DOTALL)
if not match:
    print("❌ Could not find SYSTEM_PROMPT")
    exit(1)

prompt_content = match.group(1)
print(f"✅ Found SYSTEM_PROMPT: {len(prompt_content)} chars")

# Define module structure based on analysis
# Simplified: Extract main sections only
modules = {
    "core/identity.txt": {
        "start": "# 1. CORE IDENTITY & CAPABILITIES",
        "end": "# 2. EXECUTION ENVIRONMENT"
    },
    "core/workspace.txt": {
        "start": "# 2. EXECUTION ENVIRONMENT",
        "end": "# 3. TOOLKIT & METHODOLOGY"
    },
    "tools/toolkit.txt": {
        "start": "# 3. TOOLKIT & METHODOLOGY",
        "end": "# 4. DATA PROCESSING & EXTRACTION"
    },
    "tools/data_processing.txt": {
        "start": "# 4. DATA PROCESSING & EXTRACTION",
        "end": "# 5. WORKFLOW MANAGEMENT"
    },
    "tools/workflow.txt": {
        "start": "# 5. WORKFLOW MANAGEMENT",
        "end": "# 6. CONTENT CREATION"
    },
    "tools/content_creation.txt": {
        "start": "# 6. CONTENT CREATION",
        "end": "# 7. COMMUNICATION & USER INTERACTION"
    },
    "response/format.txt": {
        "start": "# 7. COMMUNICATION & USER INTERACTION",
        "end": "# 9. COMPLETION PROTOCOLS"
    },
    "core/critical_rules.txt": {
        "start": "# 9. COMPLETION PROTOCOLS",
        "end": None  # Until end
    }
}

# Extract each module
modules_dir = Path("core/prompts/modules")
total_extracted = 0

for module_path, boundaries in modules.items():
    start_marker = boundaries["start"]
    end_marker = boundaries["end"]
    
    # Find start position
    start_pos = prompt_content.find(start_marker)
    if start_pos == -1:
        print(f"⚠️  Could not find start marker for {module_path}: {start_marker}")
        continue
    
    # Find end position
    if end_marker:
        end_pos = prompt_content.find(end_marker, start_pos + len(start_marker))
        if end_pos == -1:
            print(f"⚠️  Could not find end marker for {module_path}: {end_marker}")
            continue
    else:
        end_pos = len(prompt_content)
    
    # Extract content
    module_content = prompt_content[start_pos:end_pos].strip()
    
    # Add metadata
    module_with_metadata = f"""# Module: {module_path}
# Version: 1.0.0
# Extracted: 2025-10-01
# Size: {len(module_content)} chars

{module_content}
"""
    
    # Write to file
    full_path = modules_dir / module_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(full_path, "w") as f:
        f.write(module_with_metadata)
    
    print(f"✅ Extracted {module_path}: {len(module_content)} chars")
    total_extracted += len(module_content)

print(f"\n{'='*80}")
print(f"✅ Module extraction complete!")
print(f"   Total modules: {len(modules)}")
print(f"   Total extracted: {total_extracted} chars")
print(f"   Original prompt: {len(prompt_content)} chars")
print(f"   Coverage: {total_extracted/len(prompt_content)*100:.1f}%")
print(f"{'='*80}")

# Log to GlitchTip
try:
    import sentry_sdk
    sentry_sdk.capture_message(
        f"Modules extracted: {len(modules)} modules, total {total_extracted} chars",
        level="info",
        extras={
            "module_count": len(modules),
            "total_chars": total_extracted,
            "original_chars": len(prompt_content),
            "coverage": f"{total_extracted/len(prompt_content)*100:.1f}%"
        }
    )
    print("✅ Logged to GlitchTip")
except Exception as e:
    print(f"⚠️  Failed to log to GlitchTip: {e}")

