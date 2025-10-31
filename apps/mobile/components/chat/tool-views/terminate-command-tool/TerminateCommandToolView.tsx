import React from 'react';
import { View, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/ui/icon';
import { StopCircle, CheckCircle2, AlertCircle, Terminal, Power } from 'lucide-react-native';
import type { ToolViewProps } from '../types';
import { extractTerminateCommandData } from './_utils';

export function TerminateCommandToolView({ toolData, isStreaming = false }: ToolViewProps) {
  const { sessionName, output, success } = extractTerminateCommandData(toolData);
  
  const lines = output ? output.split('\n') : [];

  if (isStreaming) {
    return (
      <View className="flex-1 items-center justify-center py-12 px-6">
        <View className="bg-red-500/10 rounded-2xl items-center justify-center mb-6" style={{ width: 80, height: 80 }}>
          <Icon as={StopCircle} size={40} className="text-red-500 animate-pulse" />
        </View>
        <Text className="text-xl font-roobert-semibold text-foreground mb-2">
          Terminating Session
        </Text>
        {sessionName && (
          <View className="bg-card border border-border rounded-2xl px-4 py-3 mt-3">
            <Text className="text-sm font-roobert-mono text-foreground/60 text-center">
              {sessionName}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      <View className="px-6 py-4 gap-6">
        <View className="flex-row items-center gap-3">
          <View className="bg-red-500/10 rounded-2xl items-center justify-center" style={{ width: 48, height: 48 }}>
            <Icon as={StopCircle} size={24} className="text-red-500" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-roobert-medium text-foreground/50 uppercase tracking-wider mb-1">
              Terminate Session
            </Text>
            <Text className="text-xl font-roobert-semibold text-foreground" numberOfLines={1}>
              {sessionName || 'Session'}
            </Text>
          </View>
          <View className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-full ${
            success ? 'bg-primary/10' : 'bg-destructive/10'
          }`}>
            <Icon 
              as={success ? CheckCircle2 : AlertCircle} 
              size={12} 
              className={success ? 'text-primary' : 'text-destructive'} 
            />
            <Text className={`text-xs font-roobert-medium ${
              success ? 'text-primary' : 'text-destructive'
            }`}>
              {success ? 'Terminated' : 'Failed'}
            </Text>
          </View>
        </View>

        <View className="bg-zinc-900 dark:bg-zinc-950 rounded-xl p-4 border border-zinc-700 dark:border-zinc-800">
          <View className="flex-row items-center gap-2 mb-3">
            <Icon as={Power} size={16} className="text-zinc-400" />
            <Text className="text-sm font-roobert-medium text-zinc-300">Session</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-red-500" selectable>●</Text>
            <Text className="text-sm font-roobert-mono text-zinc-300 flex-1" selectable>
              {sessionName || 'Unknown'}
            </Text>
          </View>
        </View>

        {output && (
          <View className="gap-2">
            <Text className="text-sm font-roobert-medium text-foreground/70">
              Result
            </Text>
            <View className="bg-zinc-900 dark:bg-zinc-950 rounded-xl overflow-hidden border border-zinc-700 dark:border-zinc-800">
              <View className="bg-zinc-800 dark:bg-zinc-900 px-3 py-2 border-b border-zinc-700 dark:border-zinc-800">
                <Text className="text-xs font-roobert-medium text-zinc-300">Termination Output</Text>
              </View>
              <View className="p-3">
                {lines.map((line, idx) => (
                  <Text 
                    key={idx}
                    className="text-xs font-roobert-mono text-zinc-300 leading-5"
                    selectable
                  >
                    {line || ' '}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

