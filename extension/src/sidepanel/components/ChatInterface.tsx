/**
 * Chat Interface Component
 * 
 * Main chat interface for side panel với header, message area, và input area.
 * Story 15.1: Chat Interface Setup
 */

import { useState, useRef, useEffect } from 'react';
import type { ChatInputHandles, ChatInputProps } from '@/components/thread/chat-input/chat-input';
// @ts-ignore - React type mismatch between extension and frontend
import { ChatInput as ChatInputComponent } from '@/components/thread/chat-input/chat-input';
import { MessageList } from './MessageList';
import { formatCoinPrompt } from '../utils/coin-formatter';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

interface ChatInterfaceProps {
  onClose?: () => void;
  coinInfo?: {
    name?: string;
    symbol?: string;
    price?: number;
  };
}

export function ChatInterface({ onClose, coinInfo }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const chatInputRef = useRef<ChatInputHandles>(null);

  // Pre-fill prompt with coin info when available (Story 15.2)
  // Track last coin name to detect changes
  const [lastCoinName, setLastCoinName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (coinInfo?.name) {
      // Pre-fill if coin changed (new coin selected) or if prompt is empty
      const coinChanged = lastCoinName !== coinInfo.name;
      const promptEmpty = !prompt || prompt.trim() === '';
      
      if (coinChanged || promptEmpty) {
        const formattedPrompt = formatCoinPrompt({
          name: coinInfo.name,
          symbol: coinInfo.symbol,
          price: coinInfo.price,
        });
        // Pre-fill with coin context and analysis request
        const defaultPrompt = `${formattedPrompt}\n\nProvide a comprehensive analysis including:\n- Current market status\n- Technical indicators\n- Price trends\n- Market sentiment\n- Risk assessment`;
        setPrompt(defaultPrompt);
        setLastCoinName(coinInfo.name);
      }
    } else if (!coinInfo?.name && lastCoinName) {
      // Clear tracking when coin info is removed
      setLastCoinName(undefined);
    }
  }, [coinInfo?.name, coinInfo?.symbol, coinInfo?.price, lastCoinName, prompt]);

  const handleSubmit = (message: string, options?: { model_name?: string }) => {
    // Add user message to list
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Log for now - will implement agent creation in Story 15.3
    console.log('Submit message:', message, options);
    
    // Clear prompt after submit (will be handled by ChatInput in controlled mode)
    setPrompt('');
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      // Default: Close side panel
      if (typeof window !== 'undefined') {
        window.close();
      }
    }
  };

  // Build header title with coin info if available
  const headerTitle = coinInfo?.name
    ? `ChainLens - ${coinInfo.name}${coinInfo.symbol ? ` (${coinInfo.symbol})` : ''}`
    : 'ChainLens Coin Analysis';

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground">
      {/* Header - Fixed height */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0 h-14">
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo/Icon placeholder */}
          <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">CL</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground truncate">{headerTitle}</h1>
        </div>
        {onClose && (
          <button
            onClick={handleClose}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Close chat"
          >
            ✕
          </button>
        )}
      </header>

      {/* Message Area - Scrollable, takes remaining space */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 p-4">
        <MessageList messages={messages} />
      </main>

      {/* Input Area - Fixed height */}
      <footer className="p-4 border-t border-border bg-card shrink-0">
        <div className="w-full">
          {/* @ts-ignore - React type mismatch between extension and frontend React types */}
          <ChatInputComponent
            ref={chatInputRef}
            onSubmit={handleSubmit}
            value={prompt}
            onChange={setPrompt}
            placeholder={coinInfo?.name ? `Analyze ${coinInfo.name}...` : 'Analyze coin...'}
            loading={false}
            disabled={false}
            isAgentRunning={false}
            hideAttachments={true}
            hideAgentSelection={true}
            enableAdvancedConfig={false}
            isLoggedIn={true}
          />
        </div>
      </footer>
    </div>
  );
}

