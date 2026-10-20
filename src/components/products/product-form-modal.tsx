'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useApp } from '@/lib/context';
import { productSchema, ProductFormValues, UNIT_OPTIONS } from '@/lib/validations';
import { X } from 'lucide-react';

interface ProductFormModalProps {
  editId: string | null;
  onClose: () => void;
}

export function ProductFormModal({ editId, onClose }: ProductFormModalProps) {
  const { getProduct, createProduct, updateProduct, showToast, profile } = useApp();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      brand: '',
      sku: '',
      colour_design: '',
      size_thickness: '',
      unit: profile?.default_unit || 'sheets',
      default_rate: '',
    },
  });

  useEffect(() => {
    if (editId) {
      const product = getProduct(editId);
      if (product) {
        reset({
          name: product.name,
          brand: product.brand || '',
          sku: product.sku || '',
          colour_design: product.colour_design || '',
          size_thickness: product.size_thickness || '',
          unit: product.unit,
          default_rate: product.default_rate ? String(product.default_rate) : '',
        });
      }
    }
  }, [editId, getProduct, reset]);

  const onSubmit = (data: ProductFormValues) => {
    const rate = data.default_rate ? Number(data.default_rate) : null;
    if (editId) {
      updateProduct(editId, {
        name: data.name,
        brand: data.brand || null,
        sku: data.sku || null,
        colour_design: data.colour_design || null,
        size_thickness: data.size_thickness || null,
        unit: data.unit,
        default_rate: rate,
      });
      showToast('Product updated', 'success');
    } else {
      createProduct({
        name: data.name,
        brand: data.brand || null,
        sku: data.sku || null,
        colour_design: data.colour_design || null,
        size_thickness: data.size_thickness || null,
        unit: data.unit,
        default_rate: rate,
      });
      showToast('Product added to catalogue', 'success');
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-slide-up max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-surface-100">
          <h2 className="text-lg font-semibold text-surface-800">
            {editId ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="label">Product Name *</label>
            <input {...register('name')} className={`input ${errors.name ? 'input-error' : ''}`} placeholder="e.g. Century Laminates - Walnut Matte" />
            {errors.name && <p className="error-text">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Brand</label>
              <input {...register('brand')} className="input" placeholder="e.g. Century" />
            </div>
            <div>
              <label className="label">SKU / Product Code</label>
              <input {...register('sku')} className="input" placeholder="e.g. CEN-WM-001" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Colour / Design</label>
              <input {...register('colour_design')} className="input" placeholder="e.g. Walnut" />
            </div>
            <div>
              <label className="label">Size / Thickness</label>
              <input {...register('size_thickness')} className="input" placeholder="e.g. 8x4 ft / 0.8mm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Unit *</label>
              <select {...register('unit')} className="input">
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Default Rate (₹)</label>
              <input
                {...register('default_rate')}
                type="number"
                step="0.01"
                min="0"
                className="input"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-surface-100">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {editId ? 'Update Product' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
