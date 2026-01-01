'use client';

import React from 'react';
import { Send } from 'lucide-react';
import type { ZenInputProps } from '../types';

/**
 * Zen01 Input Component
 * Floating input area with textarea and send button
 */
export const ZenInput: React.FC<ZenInputProps> = ({
  value,
  onChange,
  onSend,
  placeholder,
  isLoading,
  textareaRef,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="zen01-input-container">
      <div className="max-w-4xl mx-auto">
        <div className="zen01-input flex items-end gap-3 p-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || 'Ask anything...'}
            rows={1}
            className="flex-1 bg-transparent border-none text-cyan-100 placeholder:text-slate-500 resize-none focus:outline-none focus:ring-0 py-2 px-3 text-sm"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={onSend}
            disabled={!value.trim() || isLoading}
            className="zen01-send-btn"
            aria-label="Send message"
          >
            {isLoading ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="h-4 w-4 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZenInput;
