'use client';

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const buttonClass = variant === 'danger' ? 'btn-danger' : 'btn-primary';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content p-6 animate-slide-up max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {variant === 'danger' && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-surface-800">{title}</h3>
            <p className="mt-2 text-sm text-surface-600">{message}</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-surface-100 text-surface-400">
            <X size={18} />
          </button>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={buttonClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
