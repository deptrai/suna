-- =====================================================
-- ChainLens Core Schema Migration
-- Version: 001
-- Description: Create core tables for ChainLens-Core service
-- Author: ChainLens Team
-- Date: 2024-01-01
-- =====================================================

-- Create chainlens_core schema
CREATE SCHEMA IF NOT EXISTS chainlens_core;

-- Set search path
SET search_path TO chainlens_core, public;

-- =====================================================
-- PROJECT ANALYSES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS project_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    analysis_type VARCHAR(50) NOT NULL DEFAULT 'full',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    cache_key VARCHAR(255) UNIQUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_analysis_type CHECK (
        analysis_type IN ('full', 'onchain-only', 'sentiment-only', 'tokenomics-only', 'team-only')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('pending', 'processing', 'completed', 'failed', 'cached', 'queued')
    ),
    CONSTRAINT valid_project_id CHECK (
        project_id ~ '^[a-zA-Z0-9\-_]{1,100}$'
    )
);

-- Indexes for project_analyses
CREATE INDEX IF NOT EXISTS idx_project_analyses_user_id ON project_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_project_analyses_project_id ON project_analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_project_analyses_status ON project_analyses(status);
CREATE INDEX IF NOT EXISTS idx_project_analyses_cache_key ON project_analyses(cache_key);
CREATE INDEX IF NOT EXISTS idx_project_analyses_requested_at ON project_analyses(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_analyses_completed_at ON project_analyses(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_analyses_user_project ON project_analyses(user_id, project_id);

-- =====================================================
-- ANALYSIS CACHE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS analysis_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    project_id VARCHAR(100) NOT NULL,
    analysis_data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_freshness DECIMAL(3,2) DEFAULT 1.0,
    analysis_type VARCHAR(50) NOT NULL DEFAULT 'full',
    
    -- Constraints
    CONSTRAINT valid_data_freshness CHECK (
        data_freshness >= 0.0 AND data_freshness <= 1.0
    ),
    CONSTRAINT valid_cache_analysis_type CHECK (
        analysis_type IN ('full', 'onchain-only', 'sentiment-only', 'tokenomics-only', 'team-only')
    )
);

-- Indexes for analysis_cache
CREATE INDEX IF NOT EXISTS idx_analysis_cache_expires_at ON analysis_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_project_id ON analysis_cache(project_id);
CREATE INDEX IF NOT EXISTS idx_analysis_cache_created_at ON analysis_cache(created_at DESC);

-- =====================================================
-- USAGE EVENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    project_id VARCHAR(100) NOT NULL,
    analysis_id UUID REFERENCES project_analyses(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    cost_credits INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_event_type CHECK (
        event_type IN ('analysis_request', 'cache_hit', 'api_call', 'export_data', 'queue_analysis')
    ),
    CONSTRAINT valid_cost_credits CHECK (
        cost_credits >= 0
    )
);

-- Indexes for usage_events
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_event_type ON usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_analysis_id ON usage_events(analysis_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_date ON usage_events(user_id, created_at::DATE);

-- =====================================================
-- RATE LIMITS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS rate_limits (
    user_id UUID NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    window_duration INTERVAL DEFAULT '1 hour',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (user_id, endpoint, window_start),
    
    -- Constraints
    CONSTRAINT valid_request_count CHECK (
        request_count >= 0
    )
);

-- Indexes for rate_limits
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON rate_limits(user_id, endpoint);

-- =====================================================
-- ANALYSIS QUEUE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS analysis_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES project_analyses(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_priority CHECK (
        priority >= 0 AND priority <= 10
    ),
    CONSTRAINT valid_attempts CHECK (
        attempts >= 0 AND attempts <= max_attempts
    )
);

-- Indexes for analysis_queue
CREATE INDEX IF NOT EXISTS idx_analysis_queue_scheduled_at ON analysis_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_analysis_queue_priority ON analysis_queue(priority DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_queue_analysis_id ON analysis_queue(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_queue_status ON analysis_queue(started_at, completed_at, failed_at);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_project_analyses_updated_at 
    BEFORE UPDATE ON project_analyses 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limits_updated_at 
    BEFORE UPDATE ON rate_limits 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_analysis_queue_updated_at 
    BEFORE UPDATE ON analysis_queue 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get user analysis quota
CREATE OR REPLACE FUNCTION get_user_analysis_quota(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    user_tier VARCHAR(50);
    daily_count INTEGER;
BEGIN
    -- Get user tier from auth.users metadata (assuming Supabase structure)
    -- This would need to be adapted based on actual user tier storage
    user_tier := 'free'; -- Default to free tier
    
    -- Count today's analyses
    SELECT COUNT(*) INTO daily_count
    FROM project_analyses
    WHERE user_id = user_uuid 
        AND requested_at > CURRENT_DATE;
    
    -- Return remaining quota based on tier
    CASE user_tier
        WHEN 'free' THEN RETURN GREATEST(0, 5 - daily_count);
        WHEN 'pro' THEN RETURN GREATEST(0, 100 - daily_count);
        WHEN 'enterprise' THEN RETURN 999999; -- Unlimited
        ELSE RETURN 0;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM analysis_cache 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old rate limit windows
CREATE OR REPLACE FUNCTION clean_old_rate_limits()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM rate_limits 
    WHERE window_start < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert initial cache cleanup job marker
INSERT INTO analysis_cache (cache_key, project_id, analysis_data, expires_at, analysis_type)
VALUES (
    'system:cache_cleanup_marker',
    'system',
    '{"type": "system", "purpose": "cache_cleanup_marker"}',
    NOW() + INTERVAL '1 day',
    'full'
) ON CONFLICT (cache_key) DO NOTHING;

-- =====================================================
-- PERMISSIONS (if needed for specific database users)
-- =====================================================

-- Grant permissions to chainlens_core schema
-- GRANT USAGE ON SCHEMA chainlens_core TO chainlens_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA chainlens_core TO chainlens_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA chainlens_core TO chainlens_user;

-- =====================================================
-- MIGRATION COMPLETION
-- =====================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 001_create_chainlens_core_schema completed successfully';
    RAISE NOTICE 'Created schema: chainlens_core';
    RAISE NOTICE 'Created tables: project_analyses, analysis_cache, usage_events, rate_limits, analysis_queue';
    RAISE NOTICE 'Created functions: update_updated_at_column, get_user_analysis_quota, clean_expired_cache, clean_old_rate_limits';
END $$;
