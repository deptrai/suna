#!/usr/bin/env python3
"""
Advanced auto-fix merge conflicts
"""
import re
import sys
from pathlib import Path

def fix_conflicts_in_file(filepath):
    """Fix conflicts in a single file with advanced strategies"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        changes = 0
        
        # Strategy 1: Remove simple conflict markers where upstream deleted content
        # Pattern: <<<<<<< HEAD\n...content...\n=======\n>>>>>>> upstream/main
        pattern1 = r'<<<<<<< HEAD\n(.*?)\n=======\n>>>>>>> upstream/main'
        def keep_head(match):
            return match.group(1)
        new_content = re.sub(pattern1, keep_head, content, flags=re.DOTALL)
        if new_content != content:
            content = new_content
            changes += 1
        
        # Strategy 2: Keep HEAD for branding
        pattern2 = r'<<<<<<< HEAD\n(.*?(?:epsilon|chainlens|Epsilon|ChainLens).*?)\n=======\n(.*?(?:kortix|suna|Kortix|Suna).*?)\n>>>>>>> upstream/main'
        def keep_branding(match):
            return match.group(1)
        new_content = re.sub(pattern2, keep_branding, content, flags=re.DOTALL)
        if new_content != content:
            content = new_content
            changes += 1
        
        # Strategy 3: Keep HEAD for custom features
        pattern3 = r'<<<<<<< HEAD\n(.*?(?:companyShowcase|useCases|use-chainlens|chainlens-modes).*?)\n=======\n(.*?)\n>>>>>>> upstream/main'
        def keep_features(match):
            return match.group(1)
        new_content = re.sub(pattern3, keep_features, content, flags=re.DOTALL)
        if new_content != content:
            content = new_content
            changes += 1
        
        # Strategy 4: General conflict resolution - prefer HEAD if longer or has keywords
        pattern4 = r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> upstream/main'
        def resolve_general(match):
            head = match.group(1).strip()
            upstream = match.group(2).strip()
            
            # Keep HEAD if it has branding
            if any(kw in head.lower() for kw in ['epsilon', 'chainlens']):
                return head
            # Keep HEAD if it has custom features
            if any(kw in head for kw in ['companyShowcase', 'useCases', 'use-chainlens']):
                return head
            # Keep HEAD if significantly longer (likely has more features)
            if len(head) > len(upstream) * 1.2:
                return head
            # If upstream is empty or very short, keep HEAD
            if not upstream or len(upstream) < 10:
                return head
            # If both are similar, prefer upstream (newer code)
            if abs(len(head) - len(upstream)) < 50:
                return upstream
            # Default: keep HEAD
            return head
        
        new_content = re.sub(pattern4, resolve_general, content, flags=re.DOTALL)
        if new_content != content:
            content = new_content
            changes += 1
        
        # Strategy 5: Fix file path conflicts in conflict markers
        # Pattern: <<<<<<< HEAD:path1\n...\n=======\n...\n>>>>>>> upstream/main:path2
        pattern5 = r'<<<<<<< HEAD:[^\n]+\n(.*?)\n=======\n(.*?)\n>>>>>>> upstream/main:[^\n]+'
        def resolve_path_conflict(match):
            head = match.group(1).strip()
            upstream = match.group(2).strip()
            # Prefer upstream for path conflicts (file was moved)
            return upstream if upstream else head
        new_content = re.sub(pattern5, resolve_path_conflict, content, flags=re.DOTALL)
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
    fixed_files = []
    for filepath in conflicted_files:
        full_path = Path('/Users/mac_1/Documents/GitHub/chainlens') / filepath
        if full_path.exists():
            fixes = fix_conflicts_in_file(full_path)
            if fixes > 0:
                fixed_files.append(filepath)
                total_fixes += fixes
    
    print(f"\nFixed conflicts in {len(fixed_files)} files:")
    for f in fixed_files[:20]:  # Show first 20
        print(f"  {f}")
    if len(fixed_files) > 20:
        print(f"  ... and {len(fixed_files) - 20} more")
    
    print(f"\nTotal: Fixed {total_fixes} conflict blocks")

if __name__ == '__main__':
    main()

