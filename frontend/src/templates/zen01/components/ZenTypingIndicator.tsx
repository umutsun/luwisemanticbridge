'use client';

import React from 'react';

/**
 * Zen01 Typing Indicator Component
 * Displays animated dots while assistant is thinking
 */
export const ZenTypingIndicator: React.FC = () => {
  return (
    <div className="zen01-typing">
      <div className="zen01-typing-dot" />
      <div className="zen01-typing-dot" />
      <div className="zen01-typing-dot" />
    </div>
  );
};

export default ZenTypingIndicator;
