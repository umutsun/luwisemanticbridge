import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface ModernTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

interface TabsData {
  value: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
}

interface ModernTabsListProps {
  tabs: TabsData[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function ModernTabsList({ tabs, value, onValueChange, className }: ModernTabsListProps) {
  return (
    <div className={cn(
      'relative bg-gray-100 dark:bg-gray-800 rounded-lg p-1 mb-6',
      'backdrop-blur-sm border border-gray-200 dark:border-gray-700',
      className
    )}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              'relative flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200',
              'hover:bg-white/50 dark:hover:bg-gray-700/50',
              value === tab.value
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.badge && (
              <span className={cn(
                'absolute -top-1 -right-1 px-1.5 py-0.5 text-xs rounded-full',
                value === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ModernTabs({ value, onValueChange, children, className }: ModernTabsProps) {
  return (
    <div className={cn('w-full', className)}>
      <Tabs value={value} onValueChange={onValueChange}>
        {children}
      </Tabs>
    </div>
  );
}

export { TabsContent as ModernTabsContent };