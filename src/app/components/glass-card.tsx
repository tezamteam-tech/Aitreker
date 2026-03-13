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
    default: 'border border-white/[0.08]',
    elevated: 'border border-white/[0.12] shadow-lg shadow-black/20',
    interactive: 'border border-white/[0.08] hover:border-white/[0.14] active:scale-[0.98] transition-all duration-200 cursor-pointer',
    accent: 'border border-[#6c5ce7]/25',
  };

  const paddings = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
  };

  return (
    <div
      className={cn(
        'rounded-2xl bg-liquid-glass',
        variants[variant],
        paddings[padding],
        className
      )}
      style={{
        boxShadow: 'inset 0 0.5px 0 0 rgba(255,255,255,0.1), 0 4px 16px rgba(0,0,0,0.12)',
      }}
      {...props}
    >
      {children}
    </div>
  );
}