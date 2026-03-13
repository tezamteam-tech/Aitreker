import React from 'react';
import { cn } from './ui/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'interactive' | 'accent';
  padding?: 'sm' | 'md' | 'lg';
}

export function GlassCard({
  children,
  className,
  variant = 'default',
  padding = 'md',
  ...props
}: GlassCardProps) {
  const variants = {
    default: '',
    elevated: 'shadow-lg',
    interactive: 'hover:brightness-110 active:scale-[0.98] transition-all duration-200 cursor-pointer',
    accent: 'border-[#6c5ce7]/25',
  };

  const paddings = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
  };

  return (
    <div
      className={cn(
        'rounded-2xl bg-glass-card glass-card-border',
        variants[variant],
        paddings[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
