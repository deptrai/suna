/**
 * Message List Component
 * 
 * Displays chat messages in a scrollable list.
 * Story 15.1: Chat Interface Setup
 * 
 * Note: This is a simplified version. Full implementation with streaming
 * will be added in Story 15.4 (Message Streaming).
 */

import { Message } from './ChatInterface';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Start a conversation about a coin
          </p>
          <p className="text-xs text-muted-foreground">
            Click "Analyze" on any coin to begin
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${
            message.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-4 py-2 ${
              message.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
            {message.timestamp && (
              <p className="text-xs opacity-70 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}





