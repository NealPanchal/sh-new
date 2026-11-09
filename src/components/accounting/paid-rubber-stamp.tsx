'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface PaidRubberStampProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  title?: string;
  subtitle?: string;
  date?: string;
  amount?: number | string;
  refNo?: string;
  color?: 'emerald' | 'red' | 'blue' | 'amber';
  angle?: number;
  className?: string;
  watermark?: boolean;
}

export function PaidRubberStamp({
  size = 'md',
  title = 'PAID',
  subtitle = 'SHOWHOUSE',
  date,
  amount,
  refNo,
  color = 'emerald',
  angle = -8,
  className,
  watermark = false,
}: PaidRubberStampProps) {
  // Color palette styles (completely transparent background to keep text legible)
  const colorStyles = {
    emerald: {
      border: 'border-emerald-600/80 print:border-emerald-700/60',
      outline: 'outline-emerald-600/50 print:outline-emerald-700/40',
      text: 'text-emerald-700/90 print:text-emerald-800/80',
      shadow: 'shadow-[0_0_0_1px_rgba(21,128,61,0.15)]',
      stars: 'text-emerald-600/70',
    },
    red: {
      border: 'border-rose-600/80 print:border-rose-700/60',
      outline: 'outline-rose-600/50 print:outline-rose-700/40',
      text: 'text-rose-700/90 print:text-rose-800/80',
      shadow: 'shadow-[0_0_0_1px_rgba(190,18,60,0.15)]',
      stars: 'text-rose-600/70',
    },
    blue: {
      border: 'border-blue-600/80 print:border-blue-700/60',
      outline: 'outline-blue-600/50 print:outline-blue-700/40',
      text: 'text-blue-700/90 print:text-blue-800/80',
      shadow: 'shadow-[0_0_0_1px_rgba(29,78,216,0.15)]',
      stars: 'text-blue-600/70',
    },
    amber: {
      border: 'border-amber-600/80 print:border-amber-700/60',
      outline: 'outline-amber-600/50 print:outline-amber-700/40',
      text: 'text-amber-700/90 print:text-amber-800/80',
      shadow: 'shadow-[0_0_0_1px_rgba(180,83,9,0.15)]',
      stars: 'text-amber-600/70',
    },
  }[color];

  // Compact inline badge mode
  if (size === 'xs') {
    return (
      <span
        style={{ transform: `rotate(${angle / 2}deg)` }}
        className={cn(
          'inline-flex items-center gap-1 font-mono font-black uppercase tracking-wider rounded border-[1.5px] px-1.5 py-0.2 select-none text-[9px] bg-transparent backdrop-blur-[0.5px]',
          colorStyles.border,
          colorStyles.text,
          className
        )}
      >
        <span>★</span>
        <span>{title}</span>
        {amount !== undefined && <span>• ₹{Number(amount).toLocaleString('en-IN')}</span>}
        <span>★</span>
      </span>
    );
  }

  // Size specifications - Compact & elegant so it never blocks details
  const sizeClasses = {
    xs: {
      box: 'px-1.5 py-0.5 border-[1px] rounded min-w-[70px]',
      title: 'text-[11px] tracking-[0.14em]',
      subtitle: 'text-[6px] tracking-wider',
      meta: 'text-[7px]',
      outline: 'outline-1 outline-offset-[-2px]',
    },
    sm: {
      box: 'px-2 py-0.5 border-[1.5px] rounded-md min-w-[95px]',
      title: 'text-xs sm:text-sm tracking-[0.16em]',
      subtitle: 'text-[6.5px] tracking-wider',
      meta: 'text-[7.5px]',
      outline: 'outline-1 outline-offset-[-2.5px]',
    },
    md: {
      box: 'px-2.5 py-1 border-[1.5px] rounded-md min-w-[115px]',
      title: 'text-sm sm:text-base tracking-[0.18em]',
      subtitle: 'text-[7px] tracking-wider',
      meta: 'text-[8px] tracking-tight',
      outline: 'outline-1 outline-offset-[-3px]',
    },
    lg: {
      box: 'px-3 py-1 border-2 rounded-lg min-w-[135px]',
      title: 'text-base sm:text-lg tracking-[0.2em]',
      subtitle: 'text-[7.5px] tracking-wider',
      meta: 'text-[8.5px] tracking-tight',
      outline: 'outline-1 outline-offset-[-3px]',
    },
    xl: {
      box: 'px-3.5 py-1.5 border-2 rounded-lg min-w-[155px]',
      title: 'text-lg sm:text-xl tracking-[0.2em]',
      subtitle: 'text-[8px] tracking-wider',
      meta: 'text-[9px] tracking-tight',
      outline: 'outline-[1.5px] outline-offset-[-3.5px]',
    },
  }[size];

  const content = (
    <div
      style={{ transform: `rotate(${angle}deg)` }}
      className={cn(
        // 100% transparent background and light opacity so background text is 100% legible
        'relative inline-flex flex-col items-center justify-center text-center font-mono select-none outline-dashed transition-all bg-transparent mix-blend-multiply opacity-65 hover:opacity-85 print:opacity-35 print:bg-transparent print:mix-blend-multiply',
        sizeClasses.box,
        sizeClasses.outline,
        colorStyles.border,
        colorStyles.outline,
        colorStyles.text,
        colorStyles.shadow,
        className
      )}
    >
      {/* Top Banner with Stars */}
      <div className={cn('flex items-center gap-1 font-bold uppercase', sizeClasses.subtitle)}>
        <span className={colorStyles.stars}>★</span>
        <span className="font-extrabold">{subtitle}</span>
        <span className={colorStyles.stars}>★</span>
      </div>

      {/* Main Big Stamp Title */}
      <div
        className={cn(
          'font-black font-sans my-0.2 leading-none',
          sizeClasses.title
        )}
      >
        {title}
      </div>

      {/* Meta Information Footer (Date / Ref / Amount) */}
      {(date || amount !== undefined || refNo) && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.2 border-t border-current/30 pt-0.5 mt-0.5 font-bold w-full uppercase',
            sizeClasses.meta
          )}
        >
          {date && <span>{date}</span>}
          {amount !== undefined && (
            <span>
              ₹
              {typeof amount === 'number'
                ? amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                : amount}
            </span>
          )}
          {refNo && <span>{refNo}</span>}
        </div>
      )}
    </div>
  );

  if (watermark) {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden">
        {content}
      </div>
    );
  }

  return content;
}
