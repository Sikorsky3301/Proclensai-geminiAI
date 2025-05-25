import React, { useEffect, useRef } from 'react';
import { useProcesses } from './ProcessProvider';
import { Clock, Bot } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChatMessage {
  response: string;
  timestamp: string;
}

export const ResponseBox: React.FC = () => {
  const { chatHistory } = useProcesses();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Convert chat history to include timestamps
  const messages: ChatMessage[] = chatHistory.map(response => ({
    response,
    timestamp: new Date().toLocaleTimeString()
  }));

  // Reverse the messages to show newest first
  const sortedMessages = [...messages].reverse();
  
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">AI Responses</h2>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{chatHistory.length} response{chatHistory.length !== 1 ? 's' : ''}</span>
      </div>
      
      <ScrollArea className="h-[600px] pr-4">
        <div ref={scrollRef} className="space-y-3">
          {sortedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-center text-gray-500 dark:text-gray-400 animate-fade-in">
              <Bot className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium tracking-wide">No responses yet</p>
              <p className="text-sm font-light mt-1">Ask a question about your system processes to get started</p>
            </div>
          ) : (
            sortedMessages.map((message, index) => (
              <div 
                key={index} 
                className="glass-card p-4 border-l-4 border-l-primary animate-fade-in hover:border-l-primary/80 transition-colors"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <pre className="whitespace-pre-wrap leading-relaxed font-sans text-base text-gray-800 dark:text-gray-200 antialiased tracking-wide">{message.response}</pre>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
                    <Clock size={12} className="opacity-75" />
                    <span>{message.timestamp}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
