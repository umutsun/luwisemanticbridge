import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ModernCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'glass' | 'gradient' | 'elevated';
  hover?: boolean;
  delay?: number;
}

export function ModernCard({
  children,
  className,
  variant = 'default',
  hover = true,
  delay = 0,
  ...props
}: ModernCardProps) {
  const variantStyles = {
    default: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    glass: 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-white/20 dark:border-gray-700/50',
    gradient: 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-gray-200 dark:border-gray-700',
    elevated: 'bg-white dark:bg-gray-800 shadow-lg border-gray-100 dark:border-gray-700'
  };

  return (
    <Card
      className={cn(
        'transition-all duration-300 ease-out',
        variantStyles[variant],
        hover && 'hover:shadow-xl hover:-translate-y-1',
        delay && `transition-delay-${delay}`,
        className
      )}
      style={{
        transitionDelay: `${delay}ms`,
        animation: delay ? `fadeInUp 0.6s ease-out ${delay}ms both` : undefined
      }}
      {...props}
    >
      {children}
    </Card>
  );
}