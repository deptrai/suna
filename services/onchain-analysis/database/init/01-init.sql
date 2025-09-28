-- OnChain Analysis Service Database Initialization
-- T2.1.1c: Database Setup

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS analysis;
CREATE SCHEMA IF NOT EXISTS cache;
CREATE SCHEMA IF NOT EXISTS metrics;

-- Set default search path
ALTER DATABASE chainlens_microservices SET search_path TO public, analysis, cache, metrics;

-- Create analysis tables
CREATE TABLE IF NOT EXISTS analysis.token_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(255) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    chain_id VARCHAR(50) NOT NULL,
    risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    metadata JSONB,
    price_data JSONB,
    holders_analysis JSONB,
    transaction_analysis JSONB,
    data_sources TEXT[],
    warnings TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_token_analysis UNIQUE (project_id, token_address, chain_id)
);

CREATE TABLE IF NOT EXISTS analysis.risk_assessment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_address VARCHAR(42) NOT NULL,
    chain_id VARCHAR(50) NOT NULL,
    overall_risk_score INTEGER CHECK (overall_risk_score >= 0 AND overall_risk_score <= 100),
    risk_category VARCHAR(20) CHECK (risk_category IN ('low', 'medium', 'high', 'extreme')),
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    protocol_risk JSONB,
    market_risk JSONB,
    yield_risk JSONB,
    liquidity_risk JSONB,
    key_risk_factors TEXT[],
    recommendations TEXT[],
    warnings TEXT[],
    cross_chain_data JSONB,
    processing_time INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_risk_assessment UNIQUE (token_address, chain_id)
);

CREATE TABLE IF NOT EXISTS analysis.transaction_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_address VARCHAR(42) NOT NULL,
    chain_id VARCHAR(50) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    volume_analysis JSONB,
    whale_activity JSONB,
    risk_factors TEXT[],
    confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    processing_time INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_transaction_analysis UNIQUE (token_address, chain_id, timeframe)
);

-- Create cache tables
CREATE TABLE IF NOT EXISTS cache.api_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cache_key VARCHAR(500) NOT NULL UNIQUE,
    data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_cache_key ON cache.api_cache (cache_key),
    INDEX idx_expires_at ON cache.api_cache (expires_at)
);

-- Create metrics tables
CREATE TABLE IF NOT EXISTS metrics.api_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name VARCHAR(100) NOT NULL,
    endpoint VARCHAR(200) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_service_endpoint ON metrics.api_metrics (service_name, endpoint),
    INDEX idx_timestamp ON metrics.api_metrics (timestamp)
);

CREATE TABLE IF NOT EXISTS metrics.error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name VARCHAR(100) NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT,
    stack_trace TEXT,
    context JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_service_error ON metrics.error_logs (service_name, error_type),
    INDEX idx_timestamp ON metrics.error_logs (timestamp)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_analysis_token_chain 
    ON analysis.token_analysis (token_address, chain_id);
CREATE INDEX IF NOT EXISTS idx_token_analysis_created_at 
    ON analysis.token_analysis (created_at);
CREATE INDEX IF NOT EXISTS idx_token_analysis_risk_score 
    ON analysis.token_analysis (risk_score);

CREATE INDEX IF NOT EXISTS idx_risk_assessment_token_chain 
    ON analysis.risk_assessment (token_address, chain_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessment_risk_category 
    ON analysis.risk_assessment (risk_category);
CREATE INDEX IF NOT EXISTS idx_risk_assessment_created_at 
    ON analysis.risk_assessment (created_at);

CREATE INDEX IF NOT EXISTS idx_transaction_analysis_token_chain 
    ON analysis.transaction_analysis (token_address, chain_id);
CREATE INDEX IF NOT EXISTS idx_transaction_analysis_created_at 
    ON analysis.transaction_analysis (created_at);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_token_analysis_updated_at 
    BEFORE UPDATE ON analysis.token_analysis 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_risk_assessment_updated_at 
    BEFORE UPDATE ON analysis.risk_assessment 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transaction_analysis_updated_at 
    BEFORE UPDATE ON analysis.transaction_analysis 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing
INSERT INTO analysis.token_analysis (
    project_id, 
    token_address, 
    chain_id, 
    risk_score, 
    confidence,
    metadata,
    data_sources,
    warnings
) VALUES (
    'sample-project',
    '0xA0b86a33E6441e6e80A0c4C7596C5C0B6b8b8b8b',
    'ethereum',
    45,
    0.85,
    '{"name": "Sample Token", "symbol": "SAMPLE", "decimals": 18}',
    ARRAY['moralis', 'defillama'],
    ARRAY['sample_data']
) ON CONFLICT (project_id, token_address, chain_id) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA analysis TO chainlens;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cache TO chainlens;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA metrics TO chainlens;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA analysis TO chainlens;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA cache TO chainlens;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA metrics TO chainlens;

-- Create user for application (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'onchain_app') THEN
        CREATE ROLE onchain_app WITH LOGIN PASSWORD 'onchain_app_password';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE chainlens_microservices TO onchain_app;
GRANT USAGE ON SCHEMA analysis, cache, metrics TO onchain_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA analysis, cache, metrics TO onchain_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analysis, cache, metrics TO onchain_app;
