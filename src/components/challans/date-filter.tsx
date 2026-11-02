'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CalendarDays,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
} from 'lucide-react';
import { cn, formatDateIndian } from '@/lib/utils';

export type DateFilterPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'          // Current Month (e.g. November 2026)
  | 'previous_month' // Previous Month (e.g. October 2026)
  | 'specific_month' // Chosen Month (e.g. 2026-10)
  | 'single'         // Specific Single Day
  | 'custom';        // Custom Range (From -> To)

export interface DateFilterState {
  preset: DateFilterPreset;
  singleDate: string;     // YYYY-MM-DD
  fromDate: string;       // YYYY-MM-DD
  toDate: string;         // YYYY-MM-DD
  selectedMonth?: string; // YYYY-MM (e.g. "2026-10")
}

interface DateFilterProps {
  value: DateFilterState;
  onChange: (val: DateFilterState) => void;
  availableChallans?: { challan_date: string }[];
  filteredCount?: number;
  totalCount?: number;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Return start and end YYYY-MM-DD strings for a given year & monthIndex (0-11)
 */
export function getMonthBounds(year: number, monthIndex: number): { start: string; end: string } {
  const mStr = String(monthIndex + 1).padStart(2, '0');
  const start = `${year}-${mStr}-01`;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const end = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

/**
 * Compute the active filter date range and a human-readable title label
 */
export function getDateFilterRange(state: DateFilterState): {
  from?: string;
  to?: string;
  single?: string;
  label?: string;
} {
  const now = new Date();
  const toYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  if (state.preset === 'today') {
    const today = toYMD(now);
    return { single: today, label: 'Today' };
  }

  if (state.preset === 'yesterday') {
    const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { single: toYMD(yest), label: 'Yesterday' };
  }

  if (state.preset === 'week') {
    const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return { from: toYMD(weekAgo), to: toYMD(now), label: 'Last 7 Days' };
  }

  if (state.preset === 'month') {
    const bounds = getMonthBounds(now.getFullYear(), now.getMonth());
    const mName = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
    return { from: bounds.start, to: bounds.end, label: `This Month (${mName})` };
  }

  if (state.preset === 'previous_month') {
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const bounds = getMonthBounds(prevDate.getFullYear(), prevDate.getMonth());
    const mName = `${MONTH_NAMES[prevDate.getMonth()]} ${prevDate.getFullYear()}`;
    return { from: bounds.start, to: bounds.end, label: `Last Month (${mName})` };
  }

  if (state.preset === 'specific_month' && state.selectedMonth) {
    const parts = state.selectedMonth.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
      const bounds = getMonthBounds(y, m - 1);
      const mName = `${MONTH_NAMES[m - 1]} ${y}`;
      return { from: bounds.start, to: bounds.end, label: mName };
    }
  }

  if (state.preset === 'single') {
    return {
      single: state.singleDate,
      label: state.singleDate ? formatDateIndian(state.singleDate) : 'Specific Day',
    };
  }

  if (state.preset === 'custom') {
    const label =
      state.fromDate && state.toDate
        ? `${formatDateIndian(state.fromDate)} → ${formatDateIndian(state.toDate)}`
        : 'Custom Range';
    return { from: state.fromDate, to: state.toDate, label };
  }

  return {};
}

/**
 * Filter an array of items by their `challan_date` field
 */
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

export function DateFilter({
  value,
  onChange,
  availableChallans = [],
  filteredCount,
  totalCount,
}: DateFilterProps) {
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [showMonthPanel, setShowMonthPanel] = useState(false);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonthIndex = now.getMonth();
  const curMonthKey = `${curYear}-${String(curMonthIndex + 1).padStart(2, '0')}`;
  const curMonthLabel = `${MONTH_NAMES[curMonthIndex]} ${curYear}`;
  const curMonthShort = MONTH_SHORT[curMonthIndex];

  const prevDate = new Date(curYear, curMonthIndex - 1, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonthIndex = prevDate.getMonth();
  const prevMonthKey = `${prevYear}-${String(prevMonthIndex + 1).padStart(2, '0')}`;
  const prevMonthLabel = `${MONTH_NAMES[prevMonthIndex]} ${prevYear}`;
  const prevMonthShort = MONTH_SHORT[prevMonthIndex];

  // Derive unique months that exist in the database with challan counts
  const availableMonths = useMemo(() => {
    const countMap = new Map<string, number>();

    // Always include current & previous month in list
    countMap.set(curMonthKey, 0);
    countMap.set(prevMonthKey, 0);

    availableChallans.forEach((c) => {
      if (c.challan_date) {
        const key = c.challan_date.slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(key)) {
          countMap.set(key, (countMap.get(key) || 0) + 1);
        }
      }
    });

    const sortedKeys = Array.from(countMap.keys()).sort().reverse();

    return sortedKeys.map((key) => {
      const [yStr, mStr] = key.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const label = `${MONTH_NAMES[m - 1]} ${y}`;
      return {
        key,
        year: y,
        month: m,
        label,
        count: countMap.get(key) || 0,
        isCurrent: key === curMonthKey,
        isPrevious: key === prevMonthKey,
      };
    });
  }, [availableChallans, curMonthKey, prevMonthKey]);

  // Determine currently active month key for selector
  const activeMonthKey = useMemo(() => {
    if (value.preset === 'previous_month') return prevMonthKey;
    if (value.preset === 'month') return curMonthKey;
    if (value.preset === 'specific_month' && value.selectedMonth) return value.selectedMonth;
    return prevMonthKey; // default to previous month for fast access
  }, [value.preset, value.selectedMonth, curMonthKey, prevMonthKey]);

  const range = useMemo(() => getDateFilterRange(value), [value]);

  const isMonthPresetActive =
    value.preset === 'month' ||
    value.preset === 'previous_month' ||
    value.preset === 'specific_month';

  const handlePresetSelect = (preset: DateFilterPreset) => {
    const today = new Date().toISOString().slice(0, 10);

    if (preset === 'previous_month') {
      onChange({
        ...value,
        preset: 'previous_month',
        selectedMonth: prevMonthKey,
      });
      setShowCustomRange(false);
      setShowMonthPanel(true);
      return;
    }

    if (preset === 'month') {
      onChange({
        ...value,
        preset: 'month',
        selectedMonth: curMonthKey,
      });
      setShowCustomRange(false);
      setShowMonthPanel(true);
      return;
    }

    if (preset === 'single') {
      onChange({
        ...value,
        preset: 'single',
        singleDate: value.singleDate || today,
      });
      setShowCustomRange(false);
      setShowMonthPanel(false);
      return;
    }

    if (preset === 'custom') {
      const bounds = getMonthBounds(curYear, curMonthIndex);
      onChange({
        ...value,
        preset: 'custom',
        fromDate: value.fromDate || bounds.start,
        toDate: value.toDate || today,
      });
      setShowCustomRange(true);
      setShowMonthPanel(false);
      return;
    }

    setShowCustomRange(false);
    setShowMonthPanel(false);
    onChange({
      ...value,
      preset,
    });
  };

  const handleMonthDropdownChange = (monthKey: string) => {
    if (monthKey === prevMonthKey) {
      onChange({
        ...value,
        preset: 'previous_month',
        selectedMonth: prevMonthKey,
      });
    } else if (monthKey === curMonthKey) {
      onChange({
        ...value,
        preset: 'month',
        selectedMonth: curMonthKey,
      });
    } else {
      onChange({
        ...value,
        preset: 'specific_month',
        selectedMonth: monthKey,
      });
    }
    setShowMonthPanel(true);
  };

  const handleStepMonth = (step: number) => {
    const [yStr, mStr] = activeMonthKey.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const d = new Date(y, m - 1 + step, 1);
    const targetKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    handleMonthDropdownChange(targetKey);
  };

  const handleClear = () => {
    onChange({
      preset: 'all',
      singleDate: '',
      fromDate: '',
      toDate: '',
      selectedMonth: undefined,
    });
    setShowCustomRange(false);
    setShowMonthPanel(false);
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

        {/* All Dates */}
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

        {/* Today */}
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

        {/* Yesterday */}
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

        {/* Last 7 Days */}
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

        {/* This Month (Nov) */}
        <button
          type="button"
          onClick={() => handlePresetSelect('month')}
          className={cn(
            'px-2.5 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer border',
            value.preset === 'month'
              ? 'bg-primary-600 text-white border-primary-600 shadow-2xs'
              : 'bg-surface-50 text-surface-600 border-surface-200 hover:bg-surface-100 hover:text-surface-900'
          )}
          title={`Filter challans for ${curMonthLabel}`}
        >
          This Month ({curMonthShort})
        </button>

        {/* Last Month (Oct) - Direct 1-Click Access for Previous Month! */}
        <button
          type="button"
          onClick={() => handlePresetSelect('previous_month')}
          className={cn(
            'px-2.5 py-1 rounded-md font-bold text-xs transition-colors cursor-pointer border flex items-center gap-1',
            value.preset === 'previous_month'
              ? 'bg-blue-700 text-white border-blue-700 shadow-2xs'
              : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-900'
          )}
          title={`Filter previous month challans (${prevMonthLabel})`}
        >
          <Clock size={12} />
          <span>Last Month ({prevMonthShort})</span>
        </button>

        {/* Professional Month Picker Dropdown Button */}
        <button
          type="button"
          onClick={() => setShowMonthPanel(!showMonthPanel)}
          className={cn(
            'px-2.5 py-1 rounded-md font-semibold text-xs transition-colors cursor-pointer border flex items-center gap-1',
            value.preset === 'specific_month' || showMonthPanel
              ? 'bg-[#2B5EA7] text-white border-[#2B5EA7] shadow-2xs'
              : 'bg-surface-50 text-surface-700 border-surface-200 hover:bg-surface-100'
          )}
          title="Pick any month (October 2026, September 2026, etc.)"
        >
          <Calendar size={12} />
          <span>
            {value.preset === 'specific_month' && value.selectedMonth
              ? range.label
              : 'Select Month'}
          </span>
          <ChevronDown size={12} />
        </button>

        {/* Specific Day */}
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

        {/* Custom Range */}
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

        {/* Clear Filter Button */}
        {isFiltered && (
          <button
            type="button"
            onClick={handleClear}
            className="px-2 py-0.5 rounded text-[11px] font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-1 ml-auto cursor-pointer"
            title="Reset date filter to show all dates"
          >
            <X size={12} />
            <span>Clear Date Filter</span>
          </button>
        )}
      </div>

      {/* ============================================================ */}
      {/* PROFESSIONAL MONTH SELECTOR & STEPPER BAR                    */}
      {/* ============================================================ */}
      {(showMonthPanel || isMonthPresetActive) && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-blue-950 flex items-center gap-1 text-xs">
              <Calendar size={14} className="text-blue-700" />
              <span>Month:</span>
            </span>

            {/* Quick Month Dropdown */}
            <select
              value={activeMonthKey}
              onChange={(e) => handleMonthDropdownChange(e.target.value)}
              className="input text-xs py-1 px-2.5 bg-white font-bold text-blue-900 border-blue-300 h-8 max-w-[270px] cursor-pointer shadow-2xs"
            >
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.count} {m.count === 1 ? 'challan' : 'challans'})
                  {m.isCurrent ? ' — Current Month' : m.isPrevious ? ' — Previous Month' : ''}
                </option>
              ))}
            </select>

            {/* Month Stepper: < Prev Month | Next Month > */}
            <div className="flex items-center gap-0.5 bg-white border border-blue-300 rounded-md p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => handleStepMonth(-1)}
                className="px-2 py-1 hover:bg-blue-50 text-blue-800 rounded text-xs font-semibold flex items-center gap-0.5 cursor-pointer"
                title="View previous month"
              >
                <ChevronLeft size={13} />
                <span>Prev Month</span>
              </button>
              <span className="text-blue-200">|</span>
              <button
                type="button"
                onClick={() => handleStepMonth(1)}
                className="px-2 py-1 hover:bg-blue-50 text-blue-800 rounded text-xs font-semibold flex items-center gap-0.5 cursor-pointer"
                title="View next month"
              >
                <span>Next Month</span>
                <ChevronRight size={13} />
              </button>
            </div>

            {/* Quick 1-click Month Chips */}
            <div className="hidden md:flex items-center gap-1">
              <button
                type="button"
                onClick={() => handlePresetSelect('previous_month')}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer',
                  value.preset === 'previous_month'
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-100'
                )}
              >
                {prevMonthLabel}
              </button>
              <button
                type="button"
                onClick={() => handlePresetSelect('month')}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer',
                  value.preset === 'month'
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-100'
                )}
              >
                {curMonthLabel}
              </button>
            </div>
          </div>

          {/* Active Range Preview */}
          {range.from && range.to && (
            <div className="text-[11px] text-blue-900 font-bold bg-white px-2 py-1 rounded border border-blue-200 shadow-2xs">
              <span>
                {formatDateIndian(range.from)} → {formatDateIndian(range.to)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SPECIFIC SINGLE DAY PICKER                                   */}
      {/* ============================================================ */}
      {value.preset === 'single' && (
        <div className="flex items-center gap-2 p-2 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs animate-in fade-in duration-150">
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

      {/* ============================================================ */}
      {/* CUSTOM DATE RANGE PICKER (WITH QUICK SHORTCUT CHIPS)         */}
      {/* ============================================================ */}
      {(value.preset === 'custom' || showCustomRange) && (
        <div className="space-y-2 p-2.5 bg-primary-50/60 border border-primary-200/80 rounded-lg text-xs animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center gap-2">
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

          {/* Range Quick Shortcuts */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-primary-200/50 text-[11px]">
            <span className="text-surface-500 font-medium">Quick Fill:</span>
            <button
              type="button"
              onClick={() => {
                const b = getMonthBounds(prevYear, prevMonthIndex);
                onChange({ ...value, preset: 'custom', fromDate: b.start, toDate: b.end });
              }}
              className="px-2 py-0.5 rounded bg-white hover:bg-primary-100 text-primary-800 border border-primary-200 font-semibold cursor-pointer"
            >
              Last Month ({prevMonthLabel})
            </button>
            <button
              type="button"
              onClick={() => {
                const b = getMonthBounds(curYear, curMonthIndex);
                onChange({ ...value, preset: 'custom', fromDate: b.start, toDate: b.end });
              }}
              className="px-2 py-0.5 rounded bg-white hover:bg-primary-100 text-primary-800 border border-primary-200 font-semibold cursor-pointer"
            >
              This Month ({curMonthLabel})
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
                const toYMD = (dt: Date) =>
                  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
                    dt.getDate()
                  ).padStart(2, '0')}`;
                onChange({ ...value, preset: 'custom', fromDate: toYMD(d), toDate: toYMD(now) });
              }}
              className="px-2 py-0.5 rounded bg-white hover:bg-primary-100 text-primary-800 border border-primary-200 font-semibold cursor-pointer"
            >
              Past 30 Days
            </button>
            <button
              type="button"
              onClick={() => {
                // FY 2026-27 (01-04-2026 to 31-03-2027)
                onChange({
                  ...value,
                  preset: 'custom',
                  fromDate: '2026-04-01',
                  toDate: '2027-03-31',
                });
              }}
              className="px-2 py-0.5 rounded bg-white hover:bg-primary-100 text-primary-800 border border-primary-200 font-semibold cursor-pointer"
            >
              Full FY 2026-27
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* ACTIVE FILTER SUMMARY STATUS BAR                             */}
      {/* ============================================================ */}
      {isFiltered && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-surface-100/90 rounded-md border border-surface-200 text-xs">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="font-semibold text-surface-800 truncate">
              Showing: <span className="font-bold text-primary-700">{range.label || 'Filtered Dates'}</span>
              {range.from && range.to && (
                <span className="text-surface-500 ml-1.5 hidden sm:inline">
                  ({formatDateIndian(range.from)} → {formatDateIndian(range.to)})
                </span>
              )}
            </span>
            {filteredCount !== undefined && (
              <span className="bg-white px-2 py-0.5 rounded border border-surface-200 font-bold text-surface-900 text-[11px] shrink-0">
                {filteredCount} {filteredCount === 1 ? 'challan' : 'challans'}
                {totalCount !== undefined && totalCount > 0 && ` (of ${totalCount} total)`}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] text-rose-600 hover:text-rose-800 font-bold hover:underline shrink-0 cursor-pointer"
          >
            Clear Filter ×
          </button>
        </div>
      )}
    </div>
  );
}
