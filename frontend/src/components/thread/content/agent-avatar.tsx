'use client';

import React from 'react';
import { useAgentFromCache } from '@/hooks/react-query/agents/use-agents';
import { EpsilonLogo } from '@/components/sidebar/epsilon-logo';
import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import type { Agent } from '@/hooks/react-query/agents/utils';

interface AgentAvatarProps {
  // For passing agent data directly (preferred - no fetch)
  agent?: Agent;

  // For fetching agent by ID (will use cache if available)
  agentId?: string;
  fallbackName?: string;

  // For direct props (bypasses agent fetch)
  iconName?: string | null;
  iconColor?: string;
  backgroundColor?: string;
  agentName?: string;
  isChainLensDefault?: boolean;

  // Common props
  size?: number;
  className?: string;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({
  // Agent data props
  agent: propAgent,
  agentId,
  fallbackName = "ChainLens",

  // Direct props
  iconName: propIconName,
  iconColor: propIconColor,
  backgroundColor: propBackgroundColor,
  agentName: propAgentName,
  isChainLensDefault: propIsChainLensDefault,

  // Common props
  size = 16,
  className = ""
}) => {
  // Try to get agent from cache if agentId is provided and agent prop is not
  const cachedAgent = useAgentFromCache(!propAgent && agentId ? agentId : undefined);
  const agent = propAgent || cachedAgent;

  // Determine values from props or agent data
  const iconName = propIconName ?? agent?.icon_name;
  const iconColor = propIconColor ?? agent?.icon_color ?? '#6B7280';
  const backgroundColor = propBackgroundColor ?? agent?.icon_background ?? '#F3F4F6';
  const isChainLens = propIsChainLensDefault ?? agent?.metadata?.is_chainlens_default;

  // Calculate responsive border radius - proportional to size
  // Use a ratio that prevents full rounding while maintaining nice corners
  const borderRadiusStyle = {
    borderRadius: `${Math.min(size * 0.25, 16)}px` // 25% of size, max 16px
  };

  // Show skeleton when no data is available
  if (!agent && !propIconName && !propIsChainLensDefault && agentId) {
    return (
      <div
        className={cn("bg-muted animate-pulse", className)}
        style={{ width: size, height: size, ...borderRadiusStyle }}
      />
    );
  }

  if (isChainLens) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-card border",
          className
        )}
        style={{ width: size, height: size, ...borderRadiusStyle }}
      >
        <EpsilonLogo size={size * 0.5} />
      </div>
    );
  }

  if (iconName) {
    return (
      <div
        className={cn(
          "flex items-center justify-center transition-all border",
          className
        )}
        style={{
          width: size,
          height: size,
          backgroundColor,
          ...borderRadiusStyle
        }}
      >
        <DynamicIcon
          name={iconName as any}
          size={size * 0.5}
          color={iconColor}
        />
      </div>
    );
  }

  // Fallback to default bot icon
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-card border",
        className
      )}
      style={{ width: size, height: size, ...borderRadiusStyle }}
    >
      <DynamicIcon
        name="bot"
        size={size * 0.5}
        color="#6B7280"
      />
    </div>
  );
};

interface AgentNameProps {
  agent?: Agent;
  agentId?: string;
  fallback?: string;
}

export const AgentName: React.FC<AgentNameProps> = ({
  agent: propAgent,
  agentId,
  fallback = "ChainLens"
}) => {
  const cachedAgent = useAgentFromCache(!propAgent && agentId ? agentId : undefined);
  const agent = propAgent || cachedAgent;

  return <span>{agent?.name || fallback}</span>;
};

// Utility function for checking if agent has custom profile
export function hasCustomProfile(agent: {
  icon_name?: string | null;
}): boolean {
  return !!(agent.icon_name);
} 