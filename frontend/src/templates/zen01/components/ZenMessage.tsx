'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Clock, FileText, ExternalLink } from 'lucide-react';
import { ZenTypingIndicator } from './ZenTypingIndicator';
import type { ZenMessageProps, ZenSource } from '../types';

/**
 * Zen01 Message Component
 * Renders user and assistant messages with glassmorphism styling
 */
export const ZenMessage: React.FC<ZenMessageProps> = ({
  message,
  onSourceClick,
}) => {
  const isUser = message.role === 'user';
  const [showAllSources, setShowAllSources] = useState(false);
  const visibleSources = showAllSources
    ? message.sources
    : message.sources?.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} zen01-fade-in`}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="zen01-avatar zen01-avatar-assistant flex-shrink-0">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
        {/* Message Bubble */}
        <div className={isUser ? 'zen01-message-user' : 'zen01-message-assistant'}>
          <div className="p-4">
            {message.isStreaming ? (
              <div className="flex items-center gap-2">
                <ZenTypingIndicator />
                <span className="text-cyan-400/60 text-sm">Thinking...</span>
              </div>
            ) : (
              <div className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                {message.content}
              </div>
            )}
          </div>

          {/* Response Time Badge */}
          {!isUser && message.responseTime && !message.isStreaming && (
            <div className="px-4 pb-3 flex items-center gap-2">
              <div className="zen01-response-time">
                <Clock className="h-3 w-3" />
                <span>{(message.responseTime / 1000).toFixed(1)}s</span>
              </div>
            </div>
          )}
        </div>

        {/* Sources Section */}
        {!isUser && message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div className="zen01-sources mt-3">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-3.5 w-3.5 text-cyan-400/70" />
              <span className="text-xs font-medium text-cyan-400/70">
                {message.sources.length} source{message.sources.length > 1 ? 's' : ''} found
              </span>
            </div>
            <div className="space-y-2">
              {visibleSources?.map((source: ZenSource, idx: number) => (
                <div
                  key={idx}
                  className="zen01-source-item"
                  onClick={() => onSourceClick(source, message.sources || [])}
                >
                  <div className="flex items-start gap-2">
                    <ExternalLink className="h-3.5 w-3.5 text-cyan-400/60 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-cyan-300/90 truncate">
                        {source.title || source.sourceTable || 'Source'}
                      </p>
                      {source.excerpt && (
                        <p className="text-xs text-slate-400/80 mt-1 line-clamp-2">
                          {source.excerpt}
                        </p>
                      )}
                    </div>
                    {source.score && (
                      <span className="text-[10px] text-cyan-400/50 flex-shrink-0">
                        {Math.round(source.score * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {message.sources.length > 3 && (
              <button
                onClick={() => setShowAllSources(!showAllSources)}
                className="mt-2 text-xs text-cyan-400/70 hover:text-cyan-300 transition-colors"
              >
                {showAllSources ? 'Show less' : `Show ${message.sources.length - 3} more`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="zen01-avatar zen01-avatar-user flex-shrink-0">
          <User className="h-4 w-4" />
        </div>
      )}
    </motion.div>
  );
};

export default ZenMessage;
