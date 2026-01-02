'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Clock, FileText, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
            ) : isUser ? (
              <div className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                {message.content}
              </div>
            ) : (
              <div className="zen01-markdown prose prose-sm max-w-none prose-invert">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Headings
                    h1: ({ children }) => (
                      <h1 className="text-lg font-bold text-cyan-200 mt-4 mb-2 pb-1 border-b border-cyan-500/30">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-base font-semibold text-cyan-300 mt-4 mb-2">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold text-cyan-300 mt-3 mb-1">
                        {children}
                      </h3>
                    ),
                    // Paragraphs - Better spacing for readability
                    p: ({ children }) => (
                      <p className="text-slate-200 my-4 leading-relaxed first:mt-0 last:mb-0">
                        {children}
                      </p>
                    ),
                    // Bold - Darker cyan for better readability
                    strong: ({ children }) => (
                      <strong className="font-semibold text-cyan-300">
                        {children}
                      </strong>
                    ),
                    // Italic
                    em: ({ children }) => (
                      <em className="italic text-slate-300">
                        {children}
                      </em>
                    ),
                    // Unordered lists
                    ul: ({ children }) => (
                      <ul className="list-disc list-outside ml-4 my-2 space-y-1 text-slate-200">
                        {children}
                      </ul>
                    ),
                    // Ordered lists
                    ol: ({ children }) => (
                      <ol className="list-decimal list-outside ml-4 my-2 space-y-1 text-slate-200">
                        {children}
                      </ol>
                    ),
                    // List items
                    li: ({ children }) => (
                      <li className="text-slate-200 pl-1">
                        {children}
                      </li>
                    ),
                    // Code blocks
                    code: ({ className, children }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-cyan-900/40 text-cyan-200 px-1.5 py-0.5 rounded text-sm font-mono">
                          {children}
                        </code>
                      ) : (
                        <code className="block bg-[#0a1628] text-cyan-200 p-3 rounded-lg text-sm font-mono overflow-x-auto my-2">
                          {children}
                        </code>
                      );
                    },
                    // Blockquotes
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-cyan-500/50 pl-4 my-2 text-slate-300 italic">
                        {children}
                      </blockquote>
                    ),
                    // Links
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
                      >
                        {children}
                      </a>
                    ),
                    // Tables
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full border border-cyan-500/30 rounded-lg">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-cyan-900/30">
                        {children}
                      </thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-200 border-b border-cyan-500/30">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 text-sm text-slate-300 border-b border-cyan-500/20">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
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
