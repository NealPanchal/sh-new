'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '@/lib/context';
import { Package, Plus, Search, Edit, Trash2, X } from 'lucide-react';
import { formatINR, cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProductFormModal } from '@/components/products/product-form-modal';

export default function ProductsPage() {
  const { products, deleteProduct, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q))
    );
  }, [products, search]);

  const handleDelete = useCallback(() => {
    if (deleteId) {
      deleteProduct(deleteId);
      showToast('Product deleted', 'success');
      setDeleteId(null);
    }
  }, [deleteId, deleteProduct, showToast]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-800">Products</h1>
          <p className="text-sm text-surface-500 mt-0.5">{products.length} products in catalogue</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditId(null); setShowForm(true); }}>
          <Plus size={18} />
          <span>Add Product</span>
        </button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
        <input
          type="text"
          placeholder="Search by name, brand, or SKU..."
          className="input pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Desktop table */}
      <div className="card hidden md:block">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Brand</th>
                <th>SKU</th>
                <th>Size / Thickness</th>
                <th>Unit</th>
                <th>Default Rate</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state py-8">
                      <Package className="empty-state-icon" />
                      <p className="empty-state-title">No products found</p>
                      <p className="empty-state-text">Add laminate products to your catalogue.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div>
                        <span className="font-medium text-surface-800">{p.name}</span>
                        {p.colour_design && (
                          <span className="block text-xs text-surface-400">{p.colour_design}</span>
                        )}
                      </div>
                    </td>
                    <td className="text-surface-500">{p.brand || '—'}</td>
                    <td className="text-surface-500 font-mono text-xs">{p.sku || '—'}</td>
                    <td className="text-surface-500">{p.size_thickness || '—'}</td>
                    <td className="text-surface-500">{p.unit}</td>
                    <td className="text-surface-600">{p.default_rate ? formatINR(p.default_rate) : '—'}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          className="btn-icon btn-ghost p-1.5"
                          title="Edit"
                          onClick={() => { setEditId(p.id); setShowForm(true); }}
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          className="btn-icon btn-ghost p-1.5 text-red-400 hover:text-red-600"
                          title="Delete"
                          onClick={() => setDeleteId(p.id)}
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

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state py-8">
              <Package className="empty-state-icon" />
              <p className="empty-state-title">No products found</p>
            </div>
          </div>
        ) : (
          filtered.map((p) => (
            <div key={p.id} className="mobile-card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-surface-800 text-sm">{p.name}</h3>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {[p.brand, p.colour_design, p.size_thickness].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  className="btn-icon btn-ghost p-1.5"
                  onClick={() => { setEditId(p.id); setShowForm(true); }}
                >
                  <Edit size={14} />
                </button>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
                {p.sku && <span>SKU: {p.sku}</span>}
                <span>Unit: {p.unit}</span>
                {p.default_rate && <span>{formatINR(p.default_rate)}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <ProductFormModal
          editId={editId}
          onClose={() => { setShowForm(false); setEditId(null); }}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Product"
        message="Are you sure you want to remove this product from the catalogue?"
        variant="danger"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
