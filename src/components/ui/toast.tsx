'use client';

import { useApp } from '@/lib/context';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export function Toast() {
  const { toast } = useApp();

  if (!toast) return null;

  const icons = {
    success: <CheckCircle size={18} className="text-emerald-200" />,
    error: <AlertCircle size={18} className="text-red-200" />,
    info: <Info size={18} className="text-surface-300" />,
  };

  const classes = {
    success: 'toast-success',
    error: 'toast-error',
    info: 'toast-info',
  };

  return (
    <div className={classes[toast.type as keyof typeof classes] || 'toast-success'}>
      <div className="flex items-center gap-2.5">
        {icons[toast.type as keyof typeof icons]}
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
