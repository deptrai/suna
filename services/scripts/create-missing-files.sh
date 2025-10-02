#!/bin/bash

echo "🔧 Creating missing files for Tokenomics and Team Verification services..."

# Create directories for Tokenomics Analysis
mkdir -p services/tokenomics-analysis/src/analysis/dto
mkdir -p services/tokenomics-analysis/src/entities
mkdir -p services/tokenomics-analysis/src/external-apis
mkdir -p services/tokenomics-analysis/src/cache
mkdir -p services/tokenomics-analysis/src/metrics

# Create directories for Team Verification
mkdir -p services/team-verification/src/analysis/dto
mkdir -p services/team-verification/src/entities
mkdir -p services/team-verification/src/external-apis
mkdir -p services/team-verification/src/cache
mkdir -p services/team-verification/src/metrics

echo "✅ Directories created successfully!"

