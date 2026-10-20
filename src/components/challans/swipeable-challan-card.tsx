'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Challan } from '@/types';
import { formatDateIndian, cn } from '@/lib/utils';
import {
  Trash2,
  Printer,
  Receipt,
  Send,
  Edit,
  ChevronLeft,
} from 'lucide-react';

interface SwipeableChallanCardProps {
  challan: Challan;
  onDelete: (challan: Challan) => void;
  onPrint: (challan: Challan, e: React.MouseEvent) => void;
  onWhatsApp: (challan: Challan, e: React.MouseEvent) => void;
}

export function SwipeableChallanCard({
  challan,
  onDelete,
  onPrint,
  onWhatsApp,
}: SwipeableChallanCardProps) {
  const router = useRouter();
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const REVEAL_WIDTH = 78;
  const FULL_SWIPE_THRESHOLD = 150;

  // Handle Touch Start
  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = startXRef.current;
    setIsDragging(true);
  };

  // Handle Touch Move with Apple rubber-banding
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - startXRef.current;

    if (isOpen) {
      // If already open, can swipe right to close or left further
      const newOffset = -REVEAL_WIDTH + deltaX;
      if (newOffset > 10) {
        setOffsetX(0);
      } else {
        setOffsetX(Math.max(-FULL_SWIPE_THRESHOLD - 30, newOffset));
      }
    } else {
      // Swiping left from closed
      if (deltaX < 0) {
        // Resistance after reveal width
        const raw = Math.abs(deltaX);
        const resisted =
          raw <= REVEAL_WIDTH
            ? raw
            : REVEAL_WIDTH + (raw - REVEAL_WIDTH) * 0.45;
        setOffsetX(-resisted);
      } else {
        // Little resistance to the right
        setOffsetX(deltaX * 0.15);
      }
    }
  };

  // Handle Touch End (Spring physics)
  const handleTouchEnd = () => {
    setIsDragging(false);

    if (Math.abs(offsetX) >= FULL_SWIPE_THRESHOLD) {
      // Full swipe triggers delete directly
      setOffsetX(0);
      setIsOpen(false);
      onDelete(challan);
    } else if (Math.abs(offsetX) >= 42) {
      // Snap open to reveal action
      setOffsetX(-REVEAL_WIDTH);
      setIsOpen(true);
    } else {
      // Snap back closed
      setOffsetX(0);
      setIsOpen(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isOpen) {
      e.stopPropagation();
      setOffsetX(0);
      setIsOpen(false);
      return;
    }
    router.push(`/challans/${challan.id}`);
  };

  const creator = challan.created_by || challan.prepared_by || 'Rushank';

  return (
    <div className="relative overflow-hidden rounded-xl touch-pan-y select-none group">
      {/* Background Action: Red Apple Trash Panel */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          setOffsetX(0);
          setIsOpen(false);
          onDelete(challan);
        }}
        className={cn(
          'absolute inset-y-0 right-0 w-[84px] bg-[#FF3B30] flex flex-col items-center justify-center text-white cursor-pointer transition-opacity z-0',
          Math.abs(offsetX) > 5 ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          boxShadow: 'inset 4px 0 8px rgba(0,0,0,0.15)',
        }}
      >
        <div
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          style={{
            transform: `scale(${Math.min(1.2, Math.max(0.7, Math.abs(offsetX) / REVEAL_WIDTH))})`,
            transition: 'transform 0.1s ease',
          }}
        >
          <Trash2 size={20} className="stroke-[2.2] animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider">
            {Math.abs(offsetX) >= FULL_SWIPE_THRESHOLD ? 'Release' : 'Delete'}
          </span>
        </div>
      </div>

      {/* Front Card Layer with Hardware Acceleration */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardClick}
        style={{
          transform: `translate3d(${offsetX}px, 0, 0)`,
          transition: isDragging
            ? 'none'
            : 'transform 360ms cubic-bezier(0.25, 1, 0.5, 1)',
          willChange: 'transform',
        }}
        className={cn(
          'relative z-10 card p-3 shadow-xs active:scale-[0.99] border border-surface-200/90 bg-white transition-shadow',
          isOpen && 'shadow-md ring-1 ring-red-500/30'
        )}
      >
        {/* Swipe Hint Indicator on Hover/Focus */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-surface-200 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

        {/* Header row: Number, Date, Status */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-primary-600 text-sm">
              {challan.challan_number}
            </span>
            <span className="text-[11px] text-surface-400">
              • {formatDateIndian(challan.challan_date)}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-surface-100 text-surface-600 border border-surface-200">
              👤 {creator}
            </span>
          </div>

          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
              challan.status === 'final'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : challan.status === 'draft'
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-red-50 text-red-700 border-red-200'
            )}
          >
            {challan.status}
          </span>
        </div>

        {/* Customer name & Item snippet */}
        <div className="py-1.5 border-y border-surface-100">
          <div className="font-bold text-xs text-surface-900 truncate">
            {challan.customer_name}
          </div>
          <div className="text-[11px] text-surface-500 truncate mt-0.5">
            {challan.items && challan.items[0]?.item_description ? (
              <span>
                {challan.items[0].item_description}
                {challan.items[0].rate && ` @ ₹${challan.items[0].rate}`}
                {challan.items.length > 1 && ` (+${challan.items.length - 1} more)`}
              </span>
            ) : (
              'No items specified'
            )}
          </div>
        </div>

        {/* Footer row: Quantity, Amount & Fast Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-surface-800">
              {challan.total_quantity}{' '}
              <span className="font-normal text-[11px] text-surface-400">
                {challan.items?.[0]?.unit || 'sheets'}
              </span>
            </span>
            {challan.total_amount && challan.total_amount > 0 ? (
              <span className="font-mono text-primary-700 bg-primary-50 border border-primary-200 px-1.5 py-0.5 rounded text-[11px] font-bold flex items-center gap-1">
                {challan.apply_gst && (
                  <span className="text-[9px] uppercase font-bold text-emerald-700 bg-emerald-100/70 px-1 rounded">
                    GST
                  </span>
                )}
                ₹{challan.total_amount.toLocaleString('en-IN')}
              </span>
            ) : null}
          </div>

          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* View Slip */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/challans/${challan.id}/bill`);
              }}
              className="p-1.5 bg-[#b8860b]/10 text-[#b8860b] rounded-lg hover:bg-[#b8860b]/20 active:scale-95 transition-all"
              title="View Paper Memo Slip"
            >
              <Receipt size={14} />
            </button>

            {/* Print / PDF */}
            <button
              onClick={(e) => onPrint(challan, e)}
              className="p-1.5 bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 active:scale-95 transition-all"
              title="Print Official Proforma / Challan"
            >
              <Printer size={14} />
            </button>

            {/* WhatsApp */}
            {challan.customer_phone && (
              <button
                onClick={(e) => onWhatsApp(challan, e)}
                className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 active:scale-95 transition-all"
                title="WhatsApp Share"
              >
                <Send size={14} />
              </button>
            )}

            {/* Edit */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/challans/${challan.id}/edit`);
              }}
              className="p-1.5 bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 active:scale-95 transition-all"
              title="Edit Challan"
            >
              <Edit size={14} />
            </button>

            {/* Visible Direct Trash / Delete Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(challan);
              }}
              className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg active:scale-90 transition-all border border-rose-200/60"
              title="Delete Challan"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Swipe Left Hint on Card */}
        {isOpen && (
          <div className="absolute right-2 top-2 flex items-center gap-1 text-[10px] text-rose-600 font-semibold animate-pulse">
            <ChevronLeft size={12} />
            <span>Swipe or tap red to delete</span>
          </div>
        )}
      </div>
    </div>
  );
}
