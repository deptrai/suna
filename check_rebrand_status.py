#!/usr/bin/env python3
"""
Check Rebrand Status Script
Scans for any remaining instances of old branding
"""

import os
import re
import glob
from pathlib import Path

def check_file_for_old_branding(file_path):
    """Check a file for old branding terms"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # Terms to look for (case-insensitive)
        old_terms = [
            'suna', 'kortix', 'SUNA', 'KORTIX', 'Suna', 'Kortix',
            'suna-agent', 'kortix-agent', 'suna_agent', 'kortix_agent',
            'suna.ai', 'kortix.ai', 'install.suna.ai', 'install.kortix.ai'
        ]
        
        found_terms = []
        for term in old_terms:
            if term.lower() in content.lower():
                # Count occurrences
                count = content.lower().count(term.lower())
                found_terms.append((term, count))
        
        return found_terms
    except Exception as e:
        return []

def main():
    print("🔍 Checking Rebrand Status")
    print("=" * 50)
    
    # File extensions to check
    extensions = [
        '*.py', '*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.md',
        '*.sql', '*.env*', '*.yml', '*.yaml', '*.html', '*.css'
    ]
    
    # Directories to skip
    skip_dirs = {
        '.git', '__pycache__', 'node_modules', '.next', 'dist', 'build',
        '.venv', 'venv', '.env', 'target', '.cargo', '.npm', '.yarn',
        '.pnpm-store', 'coverage', 'logs', 'tmp', 'temp'
    }
    
    # Get all files to check
    all_files = []
    for ext in extensions:
        for file_path in glob.glob(f"**/{ext}", recursive=True):
            path_obj = Path(file_path)
            if not any(part in skip_dirs for part in path_obj.parts):
                all_files.append(file_path)
    
    print(f"📁 Checking {len(all_files)} files...")
    
    # Check files
    files_with_old_branding = []
    total_old_terms = 0
    
    for file_path in all_files:
        found_terms = check_file_for_old_branding(file_path)
        if found_terms:
            files_with_old_branding.append((file_path, found_terms))
            total_old_terms += sum(count for _, count in found_terms)
    
    # Report results
    print(f"\n📊 Rebrand Status Report:")
    print(f"   Files checked: {len(all_files)}")
    print(f"   Files with old branding: {len(files_with_old_branding)}")
    print(f"   Total old term instances: {total_old_terms}")
    
    if files_with_old_branding:
        print(f"\n⚠️  Files still containing old branding:")
        for file_path, found_terms in files_with_old_branding[:20]:  # Show first 20
            print(f"   📄 {file_path}")
            for term, count in found_terms:
                print(f"      - '{term}': {count} instances")
        
        if len(files_with_old_branding) > 20:
            print(f"   ... and {len(files_with_old_branding) - 20} more files")
    else:
        print(f"\n✅ No old branding found! Rebrand appears complete.")
    
    # Check specific important files
    important_files = [
        'frontend/package.json',
        'frontend/src/app/layout.tsx',
        'frontend/src/app/metadata.ts',
        'backend/.env',
        'README.md'
    ]
    
    print(f"\n🎯 Checking important files:")
    for file_path in important_files:
        if os.path.exists(file_path):
            found_terms = check_file_for_old_branding(file_path)
            if found_terms:
                print(f"   ⚠️  {file_path}: {sum(count for _, count in found_terms)} old terms")
            else:
                print(f"   ✅ {file_path}: Clean")
        else:
            print(f"   ❓ {file_path}: Not found")

if __name__ == "__main__":
    main()
