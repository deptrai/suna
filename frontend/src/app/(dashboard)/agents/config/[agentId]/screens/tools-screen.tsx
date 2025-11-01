'use client';

import React, { useState, useEffect } from 'react';
import { useAgent, useUpdateAgent } from '@/hooks/react-query/agents/use-agents';
import { GranularToolConfiguration } from '@/components/agents/tools/granular-tool-configuration';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface ToolsScreenProps {
    agentId: string;
}

export function ToolsScreen({ agentId }: ToolsScreenProps) {
    const { data: agent, isLoading } = useAgent(agentId);
    const updateAgentMutation = useUpdateAgent();
    const [tools, setTools] = useState<Record<string, any>>({});

    useEffect(() => {
        if (agent?.agentpress_tools) {
            setTools(agent.agentpress_tools);
        }
    }, [agent?.agentpress_tools]);

    const isChainLensAgent = agent?.metadata?.is_chainlens_default || false;
    const restrictions = agent?.metadata?.restrictions || {};
    const areToolsEditable = (restrictions.tools_editable !== false) && !isChainLensAgent;

    const handleToolsChange = async (newTools: Record<string, boolean | { enabled: boolean; description: string }>) => {
        if (!areToolsEditable) {
            if (isChainLensAgent) {
                toast.error("Tools cannot be edited", {
                    description: "ChainLens's tools are managed centrally.",
                });
            }
            return;
        }

        try {
            await updateAgentMutation.mutateAsync({
                agentId,
                agentpress_tools: newTools,
            });
            setTools(newTools);
            toast.success('Tools updated successfully');
        } catch (error) {
            console.error('Failed to update tools:', error);
            toast.error('Failed to update tools');
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 overflow-auto pb-6">
                <div className="px-1 pt-1 space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto pb-6 w-full min-w-0">
            <div className="px-1 pt-1 w-full">
                <GranularToolConfiguration
                    tools={tools}
                    onToolsChange={handleToolsChange}
                    disabled={!areToolsEditable}
                    isChainLensAgent={isChainLensAgent}
                    isLoading={updateAgentMutation.isPending}
                />
            </div>
        </div>
    );
}
