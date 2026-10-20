'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import {
  ArrowLeft,
  Edit,
  Phone,
  MapPin,
  FileText,
  Plus,
  Building2,
  Calendar,
} from 'lucide-react';
import { formatPhone, formatDateIndian } from '@/lib/utils';
import { CustomerFormModal } from '@/components/customers/customer-form-modal';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getCustomer, getCustomerChallans } = useApp();
  const [showEdit, setShowEdit] = useState(false);

  const customerId = params.id as string;
  const customer = useMemo(() => getCustomer(customerId), [getCustomer, customerId]);
  const challans = useMemo(
    () => getCustomerChallans(customerId),
    [getCustomerChallans, customerId]
  );

  if (!customer) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto">
        <Building2 className="w-10 h-10 mx-auto text-surface-400 mb-2" />
        <p className="text-base font-bold text-surface-800">Customer not found</p>
        <Link href="/customers" className="btn-secondary text-xs mt-3 inline-flex items-center gap-1.5">
          <ArrowLeft size={14} />
          <span>Back to Customers</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 pb-20 sm:pb-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-surface-900 tracking-tight">
              {customer.business_name}
            </h1>
            {customer.contact_person && (
              <p className="text-xs text-surface-500">{customer.contact_person}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEdit(true)}
            className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
          >
            <Edit size={14} />
            <span>Edit</span>
          </button>
          <Link
            href={`/challans/new?customerId=${customer.id}`}
            className="btn-primary py-1.5 px-3 text-xs font-semibold flex items-center gap-1 shadow-xs"
          >
            <Plus size={14} />
            <span>New Challan</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        {/* Customer Info Card */}
        <div className="card p-4 space-y-3">
          <div className="text-xs font-bold text-surface-500 uppercase tracking-wider">
            Customer Information
          </div>

          <div className="space-y-2 text-xs">
            {customer.phone && (
              <div className="flex items-center gap-2 text-surface-700">
                <Phone size={14} className="text-surface-400 shrink-0" />
                <a href={`tel:${customer.phone}`} className="hover:text-primary-600 font-medium">
                  {formatPhone(customer.phone)}
                </a>
              </div>
            )}

            {customer.billing_address && (
              <div className="flex items-start gap-2 text-surface-600">
                <MapPin size={14} className="text-surface-400 shrink-0 mt-0.5" />
                <span>{customer.billing_address}</span>
              </div>
            )}

            {customer.delivery_address && (
              <div className="flex items-start gap-2 text-surface-600 pt-1 border-t border-surface-100">
                <MapPin size={14} className="text-primary-500 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] text-surface-400 uppercase font-semibold block">Delivery Site</span>
                  <span>{customer.delivery_address}</span>
                </div>
              </div>
            )}

            {customer.gstin && (
              <div className="flex items-center gap-2 text-surface-700 pt-1 border-t border-surface-100">
                <FileText size={14} className="text-surface-400 shrink-0" />
                <span className="font-mono text-xs">{customer.gstin}</span>
              </div>
            )}
          </div>
        </div>

        {/* Challan History */}
        <div className="lg:col-span-2 card p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-surface-100">
            <h3 className="text-sm font-bold text-surface-900">
              Challan History ({challans.length})
            </h3>
            <Link
              href={`/challans/new?customerId=${customer.id}`}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <Plus size={13} />
              <span>Create Challan</span>
            </Link>
          </div>

          {challans.length === 0 ? (
            <div className="py-8 text-center text-xs text-surface-400">
              No challans generated for this customer yet.
            </div>
          ) : (
            <>
              {/* Mobile Card list */}
              <div className="sm:hidden space-y-2">
                {challans.map((c) => (
                  <Link
                    key={c.id}
                    href={`/challans/${c.id}`}
                    className="p-2.5 rounded-lg border border-surface-200 bg-surface-50/50 block hover:bg-white transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-bold text-xs text-primary-600">{c.challan_number}</span>
                      <span className="text-[10px] uppercase font-bold text-surface-600 px-1.5 py-0.5 rounded bg-surface-200">
                        {c.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-surface-500">
                      <span>{formatDateIndian(c.challan_date)}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-surface-900">{c.total_quantity} sheets</span>
                        {c.total_amount && c.total_amount > 0 ? (
                          <span className="font-mono text-primary-700 font-bold bg-primary-50 px-1 rounded text-[10px]">
                            ₹{c.total_amount.toLocaleString('en-IN')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>Challan No.</th>
                      <th>Date</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Total Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {challans.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-50">
                        <td>
                          <Link href={`/challans/${c.id}`} className="font-mono font-bold text-primary-600 hover:underline">
                            {c.challan_number}
                          </Link>
                        </td>
                        <td className="text-surface-600">{formatDateIndian(c.challan_date)}</td>
                        <td className="text-right font-bold text-surface-900">{c.total_quantity}</td>
                        <td className="text-right font-mono font-bold text-surface-900">
                          {c.total_amount && c.total_amount > 0 ? `₹${c.total_amount.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td>
                          <span className="text-[10px] font-bold uppercase text-surface-600 px-2 py-0.5 rounded bg-surface-100 border border-surface-200">
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {showEdit && <CustomerFormModal editId={customer.id} onClose={() => setShowEdit(false)} />}
    </div>
  );
}
