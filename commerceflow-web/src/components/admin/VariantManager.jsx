import { useState } from 'react';
import Button from '../Button.jsx';
import Badge from '../Badge.jsx';
import { formatPrice } from '../../lib/utils.js';

const SKU_REGEX = /^[A-Z0-9_-]+$/;

/**
 * Generate Cartesian product of arrays.
 */
function cartesianProduct(arrays) {
  return arrays.reduce(
    (acc, curr) => acc.flatMap((c) => curr.map((n) => [...c, n])),
    [[]]
  );
}

/**
 * Production Variant Manager component.
 * Supports manual variant editing, dynamic key-value attributes,
 * SKU formatting, price overrides, stock levels, and matrix generation.
 */
export default function VariantManager({
  variants = [],
  onChange,
  basePrice = 0,
  baseSku = '',
  disabled = false,
}) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [matrixAttributes, setMatrixAttributes] = useState([
    { key: 'color', values: 'Olive, Black' },
    { key: 'size', values: 'Small, Medium, Large' },
  ]);
  const [matrixConfirmOpen, setMatrixConfirmOpen] = useState(false);
  const [deleteVariantIndex, setDeleteVariantIndex] = useState(null);

  // Helper to update variants array
  const updateVariants = (newVariants) => {
    onChange(newVariants);
  };

  const handleAddBlankVariant = () => {
    const newVariant = {
      variantId: `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      sku: baseSku ? `${baseSku.toUpperCase()}-${variants.length + 1}` : `SKU-${variants.length + 1}`,
      attributes: { option: 'Standard' },
      price: null,
      stock: 0,
      images: [],
      isActive: true,
    };
    const next = [...variants, newVariant];
    updateVariants(next);
    setEditingIndex(next.length - 1);
  };

  const handleRemoveVariant = (index) => {
    const next = variants.filter((_, i) => i !== index);
    updateVariants(next);
    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
    setDeleteVariantIndex(null);
  };

  const handleVariantFieldChange = (index, field, value) => {
    const next = [...variants];
    next[index] = { ...next[index], [field]: value };
    updateVariants(next);
  };

  const handleAttributeAdd = (variantIndex) => {
    const v = variants[variantIndex];
    const currentAttrs = { ...(v.attributes || {}) };
    const attrCount = Object.keys(currentAttrs).length;
    if (attrCount >= 5) return;

    let keyName = `attr_${attrCount + 1}`;
    let counter = 1;
    while (currentAttrs[keyName]) {
      counter++;
      keyName = `attr_${counter}`;
    }
    currentAttrs[keyName] = 'Option';
    handleVariantFieldChange(variantIndex, 'attributes', currentAttrs);
  };

  const handleAttributeKeyChange = (variantIndex, oldKey, newKey) => {
    const cleanNewKey = newKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanNewKey || cleanNewKey === oldKey) return;

    const v = variants[variantIndex];
    const oldAttrs = { ...(v.attributes || {}) };
    const value = oldAttrs[oldKey];
    delete oldAttrs[oldKey];
    oldAttrs[cleanNewKey] = value;
    handleVariantFieldChange(variantIndex, 'attributes', oldAttrs);
  };

  const handleAttributeValueChange = (variantIndex, key, val) => {
    const v = variants[variantIndex];
    const currentAttrs = { ...(v.attributes || {}) };
    currentAttrs[key] = val;
    handleVariantFieldChange(variantIndex, 'attributes', currentAttrs);
  };

  const handleAttributeDelete = (variantIndex, key) => {
    const v = variants[variantIndex];
    const currentAttrs = { ...(v.attributes || {}) };
    delete currentAttrs[key];
    handleVariantFieldChange(variantIndex, 'attributes', currentAttrs);
  };

  // Matrix generation
  const handleMatrixAttributeChange = (index, field, value) => {
    setMatrixAttributes((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddMatrixAttrRow = () => {
    if (matrixAttributes.length >= 5) return;
    setMatrixAttributes((prev) => [...prev, { key: '', values: '' }]);
  };

  const handleRemoveMatrixAttrRow = (index) => {
    setMatrixAttributes((prev) => prev.filter((_, i) => i !== index));
  };

  const executeMatrixGeneration = () => {
    const validDims = matrixAttributes
      .map((dim) => {
        const cleanKey = dim.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const values = dim.values
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        return { key: cleanKey, values };
      })
      .filter((dim) => dim.key && dim.values.length > 0);

    if (validDims.length === 0) return;

    const valueArrays = validDims.map((dim) =>
      dim.values.map((val) => ({ key: dim.key, value: val }))
    );

    const combinations = cartesianProduct(valueArrays);

    const generated = combinations.map((combo, idx) => {
      const attrs = {};
      const skuSegments = [];
      combo.forEach((item) => {
        attrs[item.key] = item.value;
        skuSegments.push(item.value.slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, ''));
      });

      const prefix = baseSku ? baseSku.trim().toUpperCase() : 'PROD';
      const sku = `${prefix}-${skuSegments.join('-') || idx + 1}`;

      // Check if existing variant has same attribute signature
      const existingMatch = variants.find((ev) => {
        const evAttrs = ev.attributes || {};
        return Object.keys(attrs).every((k) => evAttrs[k]?.toLowerCase() === attrs[k]?.toLowerCase());
      });

      return {
        variantId: existingMatch?.variantId || `var_${Date.now().toString(36)}_${idx}`,
        sku: existingMatch?.sku || sku,
        attributes: attrs,
        price: existingMatch?.price ?? null,
        stock: existingMatch?.stock ?? 0,
        images: existingMatch?.images || [],
        isActive: existingMatch?.isActive ?? true,
      };
    });

    updateVariants(generated);
    setMatrixOpen(false);
    setMatrixConfirmOpen(false);
  };

  const totalVariantStock = variants
    .filter((v) => v.isActive !== false)
    .reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);

  return (
    <div className="space-y-4">
      {/* Top Header / Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
        <div>
          <h4 className="text-sm font-bold text-slate-900">
            Variants ({variants.length})
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Total active inventory:{' '}
            <strong className="text-slate-800">{totalVariantStock} units</strong> across variants.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              if (variants.length > 0) {
                setMatrixConfirmOpen(true);
              } else {
                setMatrixOpen(true);
              }
            }}
            disabled={disabled}
            className="min-h-[38px] text-xs font-semibold"
          >
            <svg className="w-4 h-4 mr-1.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Generate Matrix
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleAddBlankVariant}
            disabled={disabled || variants.length >= 50}
            className="min-h-[38px] text-xs font-semibold"
          >
            <svg className="w-4 h-4 mr-1 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Variant
          </Button>
        </div>
      </div>

      {/* Variants List / Table */}
      {variants.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200 space-y-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">No variants configured yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Add individual variants manually or generate a matrix from attributes like Color and Size.
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setMatrixOpen(true)}>
              Use Variant Matrix
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleAddBlankVariant}>
              Add First Variant
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs divide-y divide-slate-100">
          {variants.map((v, index) => {
            const isEditing = editingIndex === index;
            const attrEntries = Object.entries(v.attributes || {});
            const hasCustomPrice = v.price !== null && v.price !== undefined && v.price !== '';
            const effectivePrice = hasCustomPrice ? Number(v.price) : Number(basePrice);
            const isValidSku = SKU_REGEX.test(v.sku || '');

            return (
              <div key={v.variantId || index} className="p-4 space-y-3 transition-colors">
                {/* Summary Row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>

                    {/* Attributes summary */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {attrEntries.length > 0 ? (
                        attrEntries.map(([k, val]) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-800"
                          >
                            <span className="text-slate-400 font-normal">{k}:</span>
                            <strong>{String(val)}</strong>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">No attributes defined</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    {/* SKU */}
                    <div className="font-mono text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                      {v.sku || <span className="text-rose-500 font-sans">No SKU</span>}
                    </div>

                    {/* Price */}
                    <div className="text-slate-800 font-semibold">
                      {formatPrice(effectivePrice)}
                      {!hasCustomPrice && <span className="text-[10px] text-slate-400 font-normal ml-1">(base)</span>}
                    </div>

                    {/* Stock */}
                    <div>
                      {v.stock > 0 ? (
                        <span className="font-medium text-emerald-700">{v.stock} in stock</span>
                      ) : (
                        <Badge variant="danger" size="sm">0 Stock</Badge>
                      )}
                    </div>

                    {/* Active */}
                    <div>
                      {v.isActive !== false ? (
                        <Badge variant="success" size="sm">Active</Badge>
                      ) : (
                        <Badge variant="secondary" size="sm">Inactive</Badge>
                      )}
                    </div>

                    {/* Expand/Collapse Edit */}
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingIndex(isEditing ? null : index)}
                        className="min-h-[32px] px-2.5 text-xs"
                      >
                        {isEditing ? 'Done' : 'Edit'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => setDeleteVariantIndex(index)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Delete variant"
                        aria-label={`Delete variant ${v.sku || index + 1}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Inline Editor */}
                {isEditing && (
                  <div className="pt-4 border-t border-slate-100 bg-slate-50/50 -mx-4 -mb-4 p-4 space-y-4 rounded-b-2xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* SKU */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Variant SKU <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={v.sku || ''}
                          onChange={(e) =>
                            handleVariantFieldChange(
                              index,
                              'sku',
                              e.target.value.toUpperCase().replace(/\s+/g, '-')
                            )
                          }
                          placeholder="e.g. TENT-OL-L"
                          className={`w-full px-3 py-2 text-xs font-mono bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 ${
                            !isValidSku && v.sku ? 'border-rose-400 bg-rose-50/30' : 'border-slate-200'
                          }`}
                        />
                        {!isValidSku && v.sku && (
                          <p className="text-[10px] text-rose-600 mt-0.5">
                            SKU may only contain A-Z, 0-9, hyphens, and underscores.
                          </p>
                        )}
                      </div>

                      {/* Price Override */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Price Override (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={v.price === null || v.price === undefined ? '' : v.price}
                          onChange={(e) =>
                            handleVariantFieldChange(
                              index,
                              'price',
                              e.target.value === '' ? null : Number(e.target.value)
                            )
                          }
                          placeholder={`Inherits base (₹${basePrice || 0})`}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                        />
                      </div>

                      {/* Stock */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Stock Quantity <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={v.stock ?? 0}
                          onChange={(e) =>
                            handleVariantFieldChange(index, 'stock', Math.max(0, parseInt(e.target.value, 10) || 0))
                          }
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
                        />
                      </div>

                      {/* Active Status Toggle */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Variant Status
                        </label>
                        <div className="flex items-center h-[34px]">
                          <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={v.isActive !== false}
                              onChange={(e) => handleVariantFieldChange(index, 'isActive', e.target.checked)}
                              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                            />
                            <span>Active in catalog</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Attributes Editor */}
                    <div className="space-y-2 pt-2 border-t border-slate-200/60">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">Variant Attributes</span>
                        <button
                          type="button"
                          onClick={() => handleAttributeAdd(index)}
                          disabled={attrEntries.length >= 5}
                          className="text-xs text-blue-600 font-semibold hover:underline"
                        >
                          + Add Attribute
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {attrEntries.map(([attrKey, attrVal]) => (
                          <div key={attrKey} className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200">
                            <input
                              type="text"
                              value={attrKey}
                              onChange={(e) => handleAttributeKeyChange(index, attrKey, e.target.value)}
                              placeholder="Key (e.g. color)"
                              className="w-24 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-600 focus:outline-none"
                            />
                            <span className="text-slate-400">:</span>
                            <input
                              type="text"
                              value={attrVal}
                              onChange={(e) => handleAttributeValueChange(index, attrKey, e.target.value)}
                              placeholder="Value (e.g. Olive)"
                              className="flex-1 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleAttributeDelete(index, attrKey)}
                              disabled={attrEntries.length <= 1}
                              className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                              title="Delete attribute"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Matrix Generator Modal */}
      {matrixOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="matrix-dialog-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div>
              <h3 id="matrix-dialog-title" className="text-base font-bold text-slate-900">
                Generate Variant Matrix
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Define attribute dimensions and comma-separated values to automatically build all combinations.
              </p>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {matrixAttributes.map((dim, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-1/3">
                    <label className="sr-only">Attribute Key</label>
                    <input
                      type="text"
                      value={dim.key}
                      onChange={(e) => handleMatrixAttributeChange(idx, 'key', e.target.value)}
                      placeholder="e.g. color"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="sr-only">Values</label>
                    <input
                      type="text"
                      value={dim.values}
                      onChange={(e) => handleMatrixAttributeChange(idx, 'values', e.target.value)}
                      placeholder="Olive, Black, Navy"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                    />
                  </div>
                  {matrixAttributes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMatrixAttrRow(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}

              {matrixAttributes.length < 5 && (
                <button
                  type="button"
                  onClick={handleAddMatrixAttrRow}
                  className="text-xs text-blue-600 font-semibold hover:underline"
                >
                  + Add Dimension (e.g. Material)
                </button>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <Button type="button" variant="secondary" size="md" onClick={() => setMatrixOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" size="md" onClick={executeMatrixGeneration}>
                Generate Combinations
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation to overwrite existing variants with matrix */}
      {matrixConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Regenerate Variants from Matrix?
            </h3>
            <p className="text-xs text-slate-600">
              You currently have <strong className="text-slate-900">{variants.length} variants</strong> configured. Generating a new matrix will reconcile combinations while matching existing SKUs and prices where attributes overlap.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="md" onClick={() => setMatrixConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => {
                  setMatrixConfirmOpen(false);
                  setMatrixOpen(true);
                }}
              >
                Proceed to Matrix
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation to delete single variant */}
      {deleteVariantIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Remove Variant?
            </h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to remove variant SKU{' '}
              <strong className="text-slate-900">{variants[deleteVariantIndex]?.sku || `#${deleteVariantIndex + 1}`}</strong>?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" size="md" onClick={() => setDeleteVariantIndex(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
                onClick={() => handleRemoveVariant(deleteVariantIndex)}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
