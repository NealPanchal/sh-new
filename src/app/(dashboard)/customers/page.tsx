'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import {
  Users,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Phone,
  MapPin,
  X,
  FilePlus,
} from 'lucide-react';
import { formatPhone, cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CustomerFormModal } from '@/components/customers/customer-form-modal';

export default function CustomersPage() {
  const { customers, deleteCustomer, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.business_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.contact_person && c.contact_person.toLowerCase().includes(q))
    );
  }, [customers, search]);

  const handleDelete = useCallback(() => {
    if (deleteId) {
      deleteCustomer(deleteId);
      showToast('Customer deleted', 'success');
      setDeleteId(null);
    }
  }, [deleteId, deleteCustomer, showToast]);

  return (
    <div className="space-y-3.5 pb-20 sm:pb-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-surface-900 tracking-tight">
            Customer Records
          </h1>
          <p className="text-xs text-surface-500 mt-0.5">
            {customers.length} total customers & parties
          </p>
        </div>

        <button
          className="btn-primary py-2 px-3.5 text-xs font-semibold shadow-xs flex items-center gap-1.5"
          onClick={() => {
            setEditId(null);
            setShowForm(true);
          }}
        >
          <Plus size={16} />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search customers by name, phone, or contact..."
          className="input pl-9 pr-8 text-xs py-2 w-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 p-1"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-2.5">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <Users className="w-10 h-10 mx-auto text-surface-400 mb-2" />
            <p className="text-sm font-semibold text-surface-800">No customers found</p>
            <p className="text-xs text-surface-400 mt-0.5">Add a new customer to keep records.</p>
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="card p-3 shadow-xs space-y-2 hover:border-surface-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={`/customers/${c.id}`} className="flex-1">
                  <h3 className="font-bold text-xs text-surface-900">{c.business_name}</h3>
                  {c.contact_person && (
                    <p className="text-[11px] text-surface-500 mt-0.5">{c.contact_person}</p>
                  )}
                </Link>

                <div className="flex items-center gap-1">
                  <Link
                    href={`/challans/new?customerId=${c.id}`}
                    className="p-1.5 bg-primary-50 text-primary-600 rounded-md hover:bg-primary-100"
                    title="New Challan"
                  >
                    <FilePlus size={14} />
                  </Link>
                  <button
                    className="p-1.5 bg-surface-100 text-surface-700 rounded-md hover:bg-surface-200"
                    onClick={() => {
                      setEditId(c.id);
                      setShowForm(true);
                    }}
                    title="Edit"
                  >
                    <Edit size={14} />
                  </button>
                </div>
              </div>

              <div className="pt-1.5 border-t border-surface-100 text-xs space-y-1">
                {c.phone && (
                  <div className="flex items-center gap-1.5 text-surface-600 text-[11px]">
                    <Phone size={12} className="text-surface-400" />
                    <a href={`tel:${c.phone}`} className="hover:text-primary-600 font-medium">
                      {formatPhone(c.phone)}
                    </a>
                  </div>
                )}
                {c.billing_address && (
                  <div className="flex items-center gap-1.5 text-surface-500 text-[11px] truncate">
                    <MapPin size={12} className="text-surface-400 shrink-0" />
                    <span className="truncate">{c.billing_address}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="card hidden md:block overflow-hidden shadow-xs">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Customer / Business</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Address</th>
                <th>GSTIN</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-surface-400">
                    No customers found
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-50 transition-colors">
                    <td>
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-bold text-xs text-surface-900 hover:text-primary-600"
                      >
                        {c.business_name}
                      </Link>
                    </td>
                    <td className="text-xs text-surface-600">{c.contact_person || '—'}</td>
                    <td className="text-xs text-surface-600">
                      {c.phone ? (
                        <a href={`tel:${c.phone}`} className="hover:text-primary-600">
                          {formatPhone(c.phone)}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-xs text-surface-500 max-w-xs truncate">
                      {c.billing_address || '—'}
                    </td>
                    <td className="text-xs font-mono text-surface-600">{c.gstin || '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/challans/new?customerId=${c.id}`}
                          className="p-1 text-primary-600 hover:bg-primary-50 rounded"
                          title="New Challan for Customer"
                        >
                          <FilePlus size={15} />
                        </Link>
                        <Link
                          href={`/customers/${c.id}`}
                          className="p-1 text-surface-500 hover:text-primary-600 rounded"
                          title="View"
                        >
                          <Eye size={15} />
                        </Link>
                        <button
                          className="p-1 text-surface-500 hover:text-surface-800 rounded"
                          onClick={() => {
                            setEditId(c.id);
                            setShowForm(true);
                          }}
                          title="Edit"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          className="p-1 text-surface-400 hover:text-red-500 rounded"
                          onClick={() => setDeleteId(c.id)}
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <CustomerFormModal
          editId={editId}
          onClose={() => {
            setShowForm(false);
            setEditId(null);
          }}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Customer"
        message="Are you sure you want to delete this customer? Saved challans will still retain their records."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
