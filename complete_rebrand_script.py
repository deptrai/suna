#!/usr/bin/env python3
"""
Complete Rebrand Script for Suna -> Chainlens and Kortix -> Epsilon
This script safely renames files, folders, and replaces content throughout the codebase.
"""

import os
import re
import shutil
import glob
from pathlib import Path

# Define replacement mappings
REPLACEMENTS = {
    # Suna -> Chainlens
    'suna': 'chainlens',
    'Suna': 'Chainlens', 
    'SUNA': 'CHAINLENS',
    
    # Kortix -> Epsilon
    'kortix': 'epsilon',
    'Kortix': 'Epsilon',
    'KORTIX': 'EPSILON',
}

# File extensions to process for content replacement
CONTENT_EXTENSIONS = [
    '*.py', '*.js', '*.jsx', '*.ts', '*.tsx', '*.json', '*.md', '*.txt',
    '*.yml', '*.yaml', '*.toml', '*.sql', '*.html', '*.css', '*.scss',
    '*.env*', '*.example', '*.lock', '*.mdc', '*.mjs'
]

# Directories to exclude from processing
EXCLUDE_DIRS = {
    '.git', 'node_modules', '.next', '__pycache__', '.venv', 'venv',
    'dist', 'build', '.turbo', '.cache', 'coverage', '.pytest_cache',
    'target', 'Cargo.lock', 'package-lock.json', 'pnpm-lock.yaml', 'uv.lock'
}

# Files to exclude from processing
EXCLUDE_FILES = {
    'complete_rebrand_script.py', 'replace_keywords.py'
}

def should_exclude_path(path):
    """Check if a path should be excluded from processing."""
    path_parts = Path(path).parts
    
    # Check if any part of the path is in exclude dirs
    for part in path_parts:
        if part in EXCLUDE_DIRS:
            return True
    
    # Check if filename is in exclude files
    if Path(path).name in EXCLUDE_FILES:
        return True
        
    return False

def backup_file(filepath):
    """Create a backup of the file before modifying."""
    backup_path = f"{filepath}.backup"
    if not os.path.exists(backup_path):
        shutil.copy2(filepath, backup_path)
        print(f"  📋 Backed up: {filepath}")

def replace_in_file(filepath):
    """Replace content in a single file."""
    if should_exclude_path(filepath):
        return False
        
    try:
        # Read file content
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        original_content = content
        
        # Apply all replacements
        for old, new in REPLACEMENTS.items():
            content = content.replace(old, new)
        
        # Only write if content changed
        if content != original_content:
            backup_file(filepath)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"  ✅ Updated content: {filepath}")
            return True
            
    except Exception as e:
        print(f"  ❌ Error processing {filepath}: {e}")
        
    return False

def rename_file_or_dir(old_path):
    """Rename a file or directory if it contains target keywords."""
    if should_exclude_path(old_path):
        return False
        
    old_name = os.path.basename(old_path)
    new_name = old_name
    
    # Apply replacements to filename
    for old, new in REPLACEMENTS.items():
        new_name = new_name.replace(old, new)
    
    if new_name != old_name:
        parent_dir = os.path.dirname(old_path)
        new_path = os.path.join(parent_dir, new_name)
        
        # Avoid conflicts
        if os.path.exists(new_path):
            print(f"  ⚠️  Target already exists: {new_path}")
            return False
            
        try:
            os.rename(old_path, new_path)
            print(f"  📁 Renamed: {old_path} -> {new_path}")
            return True
        except Exception as e:
            print(f"  ❌ Error renaming {old_path}: {e}")
            
    return False

def main():
    """Main function to execute the rebrand."""
    print("🚀 Starting Complete Rebrand: Suna -> Chainlens, Kortix -> Epsilon")
    print("=" * 60)
    
    # Get current directory
    root_dir = os.getcwd()
    print(f"📂 Working directory: {root_dir}")
    
    # Step 1: Replace content in files
    print("\n📝 Step 1: Replacing content in files...")
    updated_files = 0
    
    for extension in CONTENT_EXTENSIONS:
        for filepath in glob.glob(f"**/{extension}", recursive=True):
            if replace_in_file(filepath):
                updated_files += 1
    
    print(f"✅ Updated content in {updated_files} files")
    
    # Step 2: Rename files and directories (bottom-up to avoid path issues)
    print("\n📁 Step 2: Renaming files and directories...")
    renamed_count = 0
    
    # Get all paths and sort by depth (deepest first)
    all_paths = []
    for root, dirs, files in os.walk('.'):
        # Add files
        for file in files:
            all_paths.append(os.path.join(root, file))
        # Add directories
        for dir in dirs:
            all_paths.append(os.path.join(root, dir))
    
    # Sort by depth (deepest first) to avoid path conflicts
    all_paths.sort(key=lambda x: x.count(os.sep), reverse=True)
    
    for path in all_paths:
        if rename_file_or_dir(path):
            renamed_count += 1
    
    print(f"✅ Renamed {renamed_count} files/directories")
    
    print("\n🎉 Rebrand completed successfully!")
    print("📋 Backup files (.backup) have been created for modified files")
    print("🧹 You can remove backup files once you verify everything works correctly")

if __name__ == "__main__":
    main()
