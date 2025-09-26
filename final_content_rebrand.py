#!/usr/bin/env python3
"""
Final Content Rebrand Script
Replaces all content instances of chainlens/epsilon branding with chainlens/epsilon
"""

import os
import re
import glob
from pathlib import Path

def replace_content_in_file(file_path, replacements):
    """Replace content in a single file"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        original_content = content
        
        # Apply all replacements
        for old_text, new_text in replacements.items():
            content = content.replace(old_text, new_text)
        
        # Only write if content changed
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

def main():
    print("🚀 Starting Final Content Rebrand: Chainlens -> Chainlens, Epsilon -> Epsilon")
    print("=" * 70)
    
    # Define replacements
    replacements = {
        # Chainlens -> Chainlens
        'chainlens': 'chainlens',
        'Chainlens': 'Chainlens', 
        'CHAINLENS': 'CHAINLENS',
        
        # Epsilon -> Epsilon
        'epsilon': 'epsilon',
        'Epsilon': 'Epsilon',
        'EPSILON': 'EPSILON',
        
        # URL and domain replacements
        'chainlens.ai': 'chainlens.ai',
        'epsilon.ai': 'epsilon.ai',
        'install.chainlens.ai': 'install.chainlens.ai',
        'install.epsilon.ai': 'install.epsilon.ai',
        
        # Package names
        'chainlens-agent': 'chainlens-agent',
        'epsilon-agent': 'epsilon-agent',
        'chainlens_agent': 'chainlens_agent',
        'epsilon_agent': 'epsilon_agent',
        
        # API endpoints
        '/chainlens-agents/': '/chainlens-agents/',
        '/epsilon-agents/': '/epsilon-agents/',
        'chainlens-agents': 'chainlens-agents',
        'epsilon-agents': 'epsilon-agents',
        
        # Environment variables
        'CHAINLENS_': 'CHAINLENS_',
        'EPSILON_': 'EPSILON_',
        
        # Database/table names
        'chainlens_': 'chainlens_',
        'epsilon_': 'epsilon_',
        
        # CSS classes and IDs
        '.chainlens-': '.chainlens-',
        '.epsilon-': '.epsilon-',
        '#chainlens-': '#chainlens-',
        '#epsilon-': '#epsilon-',
        
        # Comments and descriptions
        'Chainlens Agent': 'Chainlens Agent',
        'Epsilon Agent': 'Epsilon Agent',
        'Chainlens platform': 'Chainlens platform',
        'Epsilon platform': 'Epsilon platform',
    }
    
    # File extensions to process
    extensions = [
        '*.py', '*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.md', '*.txt',
        '*.sql', '*.env*', '*.yml', '*.yaml', '*.toml', '*.cfg', '*.ini',
        '*.html', '*.css', '*.scss', '*.sass', '*.vue', '*.svelte',
        '*.sh', '*.bash', '*.zsh', '*.fish', '*.ps1', '*.bat', '*.cmd',
        '*.dockerfile', 'Dockerfile*', '*.conf', '*.config'
    ]
    
    # Directories to skip
    skip_dirs = {
        '.git', '__pycache__', 'node_modules', '.next', 'dist', 'build',
        '.venv', 'venv', '.env', 'target', '.cargo', '.npm', '.yarn',
        '.pnpm-store', 'coverage', '.nyc_output', '.pytest_cache',
        '.mypy_cache', '.tox', '.cache', 'logs', 'tmp', 'temp'
    }
    
    # Get all files to process
    all_files = []
    for ext in extensions:
        for file_path in glob.glob(f"**/{ext}", recursive=True):
            path_obj = Path(file_path)
            # Skip if any parent directory is in skip_dirs
            if not any(part in skip_dirs for part in path_obj.parts):
                all_files.append(file_path)
    
    print(f"📁 Found {len(all_files)} files to process")
    
    # Process files
    updated_count = 0
    for file_path in all_files:
        if replace_content_in_file(file_path, replacements):
            print(f"  ✅ Updated: {file_path}")
            updated_count += 1
    
    print(f"\n🎉 Content rebrand completed!")
    print(f"📊 Updated {updated_count} files")
    print("🔍 Please review the changes and test the application")

if __name__ == "__main__":
    main()
