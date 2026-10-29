'use client';

import React, { useState } from 'react';
import { Calendar, CalendarDays, X, ChevronDown } from 'lucide-react';
import { cn, formatDateIndian } from '@/lib/utils';

export type DateFilterPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'single'
  | 'custom';

export interface DateFilterState {
  preset: DateFilterPreset;
  singleDate: string; // YYYY-MM-DD
  fromDate: string;   // YYYY-MM-DD
  toDate: string;     // YYYY-MM-DD
}

interface DateFilterProps {
  value: DateFilterState;
  onChange: (val: DateFilterState) => void;
  filteredCount?: number;
  totalCount?: number;
}

export function getDateFilterRange(state: DateFilterState): { from?: string; to?: string; single?: string } {
  const now = new Date();
  const toYMD = (d: Date) => d.toISOString().slice(0, 10);

  if (state.preset === 'today') {
    const today = toYMD(now);
    return { single: today };
  }

  if (state.preset === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    return { single: toYMD(yest) };
  }

  if (state.preset === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return { from: toYMD(weekAgo), to: toYMD(now) };
  }

  if (state.preset === 'month') {
    const monthStart = `${toYMD(now).slice(0, 7)}-01`;
    return { from: monthStart, to: toYMD(now) };
  }

  if (state.preset === 'single') {
    return { single: state.singleDate };
  }

  if (state.preset === 'custom') {
    return { from: state.fromDate, to: state.toDate };
  }

  return {};
}

export function filterChallansByDate<T extends { challan_date: string }>(
  items: T[],
  state: DateFilterState
): T[] {
  if (state.preset === 'all') return items;

  const range = getDateFilterRange(state);

  if (range.single) {
    return items.filter((item) => {
      const d = (item.challan_date || '').slice(0, 10);
      return d === range.single;
    });
  }

  if (range.from || range.to) {
    return items.filter((item) => {
      const d = (item.challan_date || '').slice(0, 10);
      if (!d) return false;
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    });
  }

  return items;
}

export function DateFilter({ value, onChange, filteredCount, totalCount }: DateFilterProps) {
  const [showCustomRange, setShowCustomRange] = useState(false);

  const handlePresetSelect = (preset: DateFilterPreset) => {
    const today = new Date().toISOString().slice(0, 10);
    if (preset === 'single') {
      onChange({
        ...value,
        preset: 'single',
        singleDate: value.singleDate || today,
      });
      setShowCustomRange(false);
      return;
    }
    if (preset === 'custom') {
      onChange({
        ...value,
        preset: 'custom',
        fromDate: value.fromDate || today,
        toDate: value.toDate || today,
      });
      setShowCustomRange(true);
      return;
    }

    setShowCustomRange(false);
    onChange({
      ...value,
      preset,
    });
  };

  const handleClear = () => {
    onChange({
      preset: 'all',
      singleDate: '',
      fromDate: '',
      toDate: '',
    });
    setShowCustomRange(false);
  };

  const isFiltered = value.preset !== 'all';

  return (
    <div className="space-y-2">
      {/* Quick Filter Pill Buttons */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[11px] font-bold text-surface-500 uppercase tracking-wider flex items-center gap-1 mr-1">
          <CalendarDays size={13} className="text-primary-600" />
          <span>Date Filter:</span>
        </span>

        <button
          type="button"
          onClick={() => handlePresetSelect('all')}
          className={cn(
            'px-2.5 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer border',
            value.preset === 'all'
              ? 'bg-surface-900 text-white border-surface-900 shadow-2xs'
              : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100 hover:text-surface-900'
          )}
        >
          All Dates
        </button>

        <button
          type="button"
          onClick={() => handlePresetSelect('today')}
          className={cn(
            'px-2.5 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer border',
            value.preset === 'today'
              ? 'bg-primary-600 text-white border-primary-600 shadow-2xs'
              : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100 hover:text-surface-900'
          )}
        >
          Today
        </button>

        <button
          type="button"
          onClick={() => handlePresetSelect('yesterday')}
          className={cn(
            'px-2.5 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer border',
            value.preset === 'yesterday'
              ? 'bg-primary-600 text-white border-primary-600 shadow-2xs'
              : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100 hover:text-surface-900'
          )}
        >
          Yesterday
        </button>

        <button
          type="button"
          onClick={() => handlePresetSelect('week')}
          className={cn(
            'px-2.5 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer border',
            value.preset === 'week'
              ? 'bg-primary-600 text-white border-primary-600 shadow-2xs'
              : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100 hover:text-surface-900'
          )}
        >
          Last 7 Days
        </button>

        <button
          type="button"
          onClick={() => handlePresetSelect('month')}
          className={cn(
            'px-2.5 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer border',
            value.preset === 'month'
              ? 'bg-primary-600 text-white border-primary-600 shadow-2xs'
              : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100 hover:text-surface-900'
          )}
        >
          This Month
        </button>

        <button
          type="button"
          onClick={() => handlePresetSelect('single')}
          className={cn(
            'px-2.5 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer border flex items-center gap-1',
            value.preset === 'single'
              ? 'bg-[#b8860b] text-white border-[#b8860b] shadow-2xs'
              : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100 hover:text-surface-900'
          )}
        >
          <Calendar size={12} />
          <span>Specific Day</span>
        </button>

        <button
          type="button"
          onClick={() => handlePresetSelect('custom')}
          className={cn(
            'px-2.5 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer border flex items-center gap-1',
            value.preset === 'custom'
              ? 'bg-primary-600 text-white border-primary-600 shadow-2xs'
              : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100 hover:text-surface-900'
          )}
        >
          <span>Custom Range</span>
          <ChevronDown size={12} />
        </button>

        {isFiltered && (
          <button
            type="button"
            onClick={handleClear}
            className="px-2 py-0.5 rounded text-[11px] font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-1 ml-auto cursor-pointer"
            title="Reset date filter"
          >
            <X size={12} />
            <span>Clear Date Filter</span>
          </button>
        )}
      </div>

      {/* Specific Single Day Picker */}
      {value.preset === 'single' && (
        <div className="flex items-center gap-2 p-2 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs">
          <Calendar size={15} className="text-[#b8860b] shrink-0" />
          <span className="font-semibold text-amber-900">Show challans for exact date:</span>
          <input
            type="date"
            value={value.singleDate}
            onChange={(e) =>
              onChange({
                ...value,
                singleDate: e.target.value,
              })
            }
            className="input text-xs py-1 px-2.5 bg-white max-w-[160px] font-medium"
          />
          {value.singleDate && (
            <span className="text-[11px] text-amber-800 font-semibold ml-2">
              📅 {formatDateIndian(value.singleDate)}
            </span>
          )}
        </div>
      )}

      {/* Custom Date Range Picker */}
      {(value.preset === 'custom' || showCustomRange) && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-primary-50/60 border border-primary-200/80 rounded-lg text-xs">
          <CalendarDays size={15} className="text-primary-600 shrink-0" />
          <span className="font-semibold text-primary-900">From:</span>
          <input
            type="date"
            value={value.fromDate}
            onChange={(e) =>
              onChange({
                ...value,
                fromDate: e.target.value,
              })
            }
            className="input text-xs py-1 px-2.5 bg-white max-w-[150px] font-medium"
          />
          <span className="font-semibold text-primary-900">To:</span>
          <input
            type="date"
            value={value.toDate}
            onChange={(e) =>
              onChange({
                ...value,
                toDate: e.target.value,
              })
            }
            className="input text-xs py-1 px-2.5 bg-white max-w-[150px] font-medium"
          />
          {value.fromDate && value.toDate && (
            <span className="text-[11px] text-primary-800 font-semibold ml-2">
              ({formatDateIndian(value.fromDate)} → {formatDateIndian(value.toDate)})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

