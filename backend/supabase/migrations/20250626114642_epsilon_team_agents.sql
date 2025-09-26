-- Migration: Add is_epsilon_team field to agent_templates
-- This migration adds support for marking templates as Epsilon team templates

BEGIN;

-- Add is_epsilon_team column to agent_templates table
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS is_epsilon_team BOOLEAN DEFAULT false;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_agent_templates_is_epsilon_team ON agent_templates(is_epsilon_team);

-- Add comment
COMMENT ON COLUMN agent_templates.is_epsilon_team IS 'Indicates if this template is created by the Epsilon team (official templates)';

COMMIT; 