#!/usr/bin/env python3
"""
Auto-fix merge conflicts by keeping ChainLens/Epsilon branding and custom features
"""
import re
import sys
from pathlib import Path

def fix_conflicts_in_file(filepath):
    """Fix conflicts in a single file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        changes = 0
        
        # Strategy 1: Keep HEAD for branding (epsilon/chainlens)
        # Pattern: conflict with kortix/suna in upstream
        patterns = [
            # Keep epsilon/chainlens branding
            (r'<<<<<<< HEAD\n(.*?epsilon.*?|.*?chainlens.*?|.*?Epsilon.*?|.*?ChainLens.*?)\n=======\n(.*?kortix.*?|.*?suna.*?|.*?Kortix.*?|.*?Suna.*?)\n>>>>>>> upstream/main', 
             lambda m: m.group(1)),
            
            # Keep HEAD if it has companyShowcase or useCases (custom features)
            (r'<<<<<<< HEAD\n(.*?companyShowcase.*?)\n=======\n>>>>>>> upstream/main', 
             lambda m: m.group(1)),
            (r'<<<<<<< HEAD\n(.*?useCases.*?)\n=======\n>>>>>>> upstream/main', 
             lambda m: m.group(1)),
            
            # Keep HEAD for custom hooks/files
            (r'<<<<<<< HEAD\n(.*?use-chainlens.*?)\n=======\n(.*?use-suna.*?)\n>>>>>>> upstream/main', 
             lambda m: m.group(1)),
        ]
        
        for pattern, replacement in patterns:
            new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
            if new_content != content:
                content = new_content
                changes += 1
        
        # Strategy 2: Simple conflicts - keep HEAD if it's longer or has custom content
        conflict_pattern = r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> upstream/main'
        def choose_side(match):
            head = match.group(1)
            upstream = match.group(2)
            
            # Keep HEAD if it has epsilon/chainlens
            if 'epsilon' in head.lower() or 'chainlens' in head.lower():
                return head
            # Keep HEAD if it has custom features
            if 'companyShowcase' in head or 'useCases' in head or 'use-chainlens' in head:
                return head
            # Keep HEAD if it's significantly longer (likely has more features)
            if len(head) > len(upstream) * 1.5:
                return head
            # Otherwise merge both if possible
            if head.strip() and upstream.strip():
                # Try to merge
                return f"{head}\n{upstream}"
            return head if head.strip() else upstream
        
        new_content = re.sub(conflict_pattern, choose_side, content, flags=re.DOTALL)
        if new_content != content:
            content = new_content
            changes += 1
        
        if changes > 0:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return changes
        
        return 0
    except Exception as e:
        print(f"Error fixing {filepath}: {e}", file=sys.stderr)
        return 0

def main():
    # Get list of conflicted files
    import subprocess
    result = subprocess.run(
        ['git', 'diff', '--name-only', '--diff-filter=U'],
        capture_output=True,
        text=True,
        cwd='/Users/mac_1/Documents/GitHub/chainlens'
    )
    
    conflicted_files = [f.strip() for f in result.stdout.split('\n') if f.strip()]
    
    print(f"Found {len(conflicted_files)} conflicted files")
    
    total_fixes = 0
    for filepath in conflicted_files:
        full_path = Path('/Users/mac_1/Documents/GitHub/chainlens') / filepath
        if full_path.exists():
            fixes = fix_conflicts_in_file(full_path)
            if fixes > 0:
                print(f"Fixed {fixes} conflicts in {filepath}")
                total_fixes += fixes
    
    print(f"\nTotal: Fixed conflicts in {total_fixes} files")

if __name__ == '__main__':
    main()

