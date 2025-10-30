'use client';

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ConfirmTooltipProps {
  children: React.ReactNode;
  onConfirm: () => void;
  message?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export const ConfirmTooltip: React.FC<ConfirmTooltipProps> = ({
  children,
  onConfirm,
  message = 'Are you sure?',
  side = 'top'
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!showConfirm) {
      setShowConfirm(true);
    }
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onConfirm();
    setShowConfirm(false);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(false);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={showConfirm} onOpenChange={setShowConfirm}>
        <TooltipTrigger asChild onClick={handleClick}>
          {children}
        </TooltipTrigger>
        {showConfirm && (
          <TooltipContent
            side={side}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg px-2 py-2"
            onPointerDownOutside={() => setShowConfirm(false)}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={handleConfirm}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 transition-colors"
                title="Yes"
              >
                <ThumbsUp className="w-4 h-4 text-green-600 dark:text-green-400" />
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 transition-colors"
                title="No"
              >
                <ThumbsDown className="w-4 h-4 text-red-600 dark:text-red-400" />
              </button>
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};
