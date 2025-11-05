'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';

interface InputTooltipProps {
  children: React.ReactNode;
  onConfirm: (value: string) => void;
  placeholder?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  defaultValue?: string;
}

export const InputTooltip: React.FC<InputTooltipProps> = ({
  children,
  onConfirm,
  placeholder = 'Enter value...',
  side = 'bottom',
  defaultValue = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Focus input when tooltip opens
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) {
      setValue(defaultValue);
      setIsOpen(true);
    }
  };

  const handleConfirm = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    if (value.trim()) {
      onConfirm(value.trim());
      setValue('');
      setIsOpen(false);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setValue('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleConfirm(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setValue('');
      setIsOpen(false);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild onClick={handleClick}>
          {children}
        </TooltipTrigger>
        {isOpen && (
          <TooltipContent
            side={side}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg px-3 py-2 min-w-[240px]"
            onPointerDownOutside={() => {
              setValue('');
              setIsOpen(false);
            }}
          >
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="h-8 text-sm flex-1"
              />
              <button
                onClick={handleConfirm}
                disabled={!value.trim()}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Confirm"
              >
                <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center justify-center w-8 h-8 rounded-md bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4 text-red-600 dark:text-red-400" />
              </button>
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};
