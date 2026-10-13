import { useState, useEffect, useCallback, useRef } from 'react';
import { adminProductService } from '../../features/admin/adminProduct.service.js';
import { formatPrice } from '../../lib/utils.js';
import Button from '../../components/Button.jsx';
import Badge from '../../components/Badge.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

export default function AdminProductDetailPage({ productId }) {
  const cleanId = (productId || '').trim();
  const isValidId = Boolean(cleanId && /^[0-9a-fA-F]{24}$/.test(cleanId));

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(isValidId);
  const [error, setError] = useState(!isValidId ? 'Invalid Product ID format' : null);
  const [actionMessage, setActionMessage] = useState(null);

  // Status toggle & Delete Modal states
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteCancelBtnRef = useRef(null);

  const fetchProduct = useCallback(() => {
    if (!isValidId) return;
    setLoading(true);
    setError(null);
    adminProductService
      .getProductById(cleanId)
      .then((data) => {
        setProduct(data);
      })
      .catch((err) => {
        setError(err?.message || 'Failed to retrieve product details.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [cleanId, isValidId]);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        fetchProduct();
      }
    });
    return () => {
      ignore = true;
    };
  }, [fetchProduct]);

  const handleToggleStatus = async () => {
    if (!product || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      const nextStatus = !product.isActive;
      const updated = await adminProductService.updateProductStatus(product._id, nextStatus);
      setProduct((prev) => ({ ...prev, isActive: updated.isActive }));
      setActionMessage({
        type: 'success',
        text: `Product was successfully ${updated.isActive ? 'activated' : 'deactivated'}.`,
      });
      setStatusConfirmOpen(false);
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to update product status.',
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!product || isDeleting) return;
    setIsDeleting(true);
    try {
      await adminProductService.deleteProduct(product._id);
      setActionMessage({
        type: 'success',
        text: `Product "${product.name}" was deactivated (soft-deleted) from the public catalog.`,
      });
      setProduct((prev) => ({ ...prev, isActive: false }));
      setDeleteConfirmOpen(false);
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to deactivate product.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6" role="status" aria-label="Loading product details">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-80 lg:col-span-2 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <ErrorState
          title="Product Not Found"
          description={error || 'The requested product could not be found or has invalid identifiers.'}
          onRetry={fetchProduct}
          action={
            <Button as="a" href="/admin/products" variant="secondary" size="md">
              &larr; Back to Products
            </Button>
          }
        />
      </div>
    );
  }

  const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
  const activeVariants = hasVariants ? product.variants.filter((v) => v.isActive !== false) : [];
  const variantPrices = hasVariants
    ? product.variants
        .map((v) => (v.price !== null && v.price !== undefined ? Number(v.price) : Number(product.price)))
        .filter((p) => !isNaN(p))
    : [Number(product.price)];
  const minPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : product.price;
  const maxPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : product.price;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <a href="/admin" className="hover:text-blue-600 transition-colors">Admin</a>
            <span>&rsaquo;</span>
            <a href="/admin/products" className="hover:text-blue-600 transition-colors">Products</a>
            <span>&rsaquo;</span>
            <span className="text-slate-900 font-medium">Product Details</span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {product.name}
            </h1>
            {product.isActive ? (
              <Badge variant="success" size="md">Active</Badge>
            ) : (
              <Badge variant="secondary" size="md">Inactive</Badge>
            )}
            {hasVariants && (
              <Badge variant="info" size="md">{product.variants.length} Variants</Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 font-mono mt-1 select-all">
            ID: {product._id}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setStatusConfirmOpen(true)}
            className="min-h-[44px]"
          >
            {product.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            as="a"
            href={`/admin/products/${product._id}/edit`}
            variant="primary"
            size="md"
            className="min-h-[44px] font-semibold"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Product
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setDeleteConfirmOpen(true)}
            className="text-rose-600 hover:bg-rose-50 border-rose-200 min-h-[44px]"
          >
            Soft Delete
          </Button>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          role="alert"
          aria-live="polite"
          className={`p-4 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-3 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span className="font-medium">{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-slate-500 hover:text-slate-800 font-bold p-1 rounded-md"
          >
            &times;
          </button>
        </div>
      )}

      {/* 2. Key Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs uppercase text-slate-400 font-bold block mb-1">Base Price</span>
          <p className="text-2xl font-black text-slate-900">
            {formatPrice(product.price)}
          </p>
          {hasVariants && minPrice !== maxPrice && (
            <p className="text-xs text-slate-500 mt-1">
              Variant range: {formatPrice(minPrice)} - {formatPrice(maxPrice)}
            </p>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs uppercase text-slate-400 font-bold block mb-1">Catalog Stock</span>
          <p className="text-2xl font-black text-slate-900">
            {product.stock ?? 0} <span className="text-sm font-normal text-slate-500">units</span>
          </p>
          <div className="mt-1">
            {product.stock <= 0 ? (
              <Badge variant="danger" size="sm">Out of Stock</Badge>
            ) : product.stock <= 5 ? (
              <Badge variant="warning" size="sm">Low Stock (≤ 5)</Badge>
            ) : (
              <Badge variant="success" size="sm">In Stock</Badge>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs uppercase text-slate-400 font-bold block mb-1">Category</span>
          <p className="text-lg font-bold text-slate-900 mt-1">
            {product.category || 'Uncategorized'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {hasVariants ? 'Multi-Variant Product' : 'Simple Product'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs uppercase text-slate-400 font-bold block mb-1">SKU Authority</span>
          <p className="text-sm font-mono font-bold text-slate-800 mt-1 select-all truncate">
            {product.sku || (hasVariants ? `${product.variants.length} Variant SKUs` : 'N/A')}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Cross-catalog SKU Registry validated
          </p>
        </div>
      </div>

      {/* 3. Main Content: Overview & Media */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Details & Description */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description Section */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Product Overview & Description
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {product.description || 'No description provided.'}
            </p>
          </div>

          {/* Variants Table (if variant product) */}
          {hasVariants && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-3 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    Configured Variants ({product.variants.length})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeVariants.length} active variants contributing to catalog stock.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto -mx-6 -mb-6">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-t border-b border-slate-100 bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider">
                      <th scope="col" className="py-3 px-4">Variant Attributes</th>
                      <th scope="col" className="py-3 px-4">SKU</th>
                      <th scope="col" className="py-3 px-4">Price</th>
                      <th scope="col" className="py-3 px-4">Stock</th>
                      <th scope="col" className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {product.variants.map((v, idx) => {
                      const attrEntries = Object.entries(v.attributes || {});
                      const hasOverride = v.price !== null && v.price !== undefined;
                      const effPrice = hasOverride ? Number(v.price) : Number(product.price);

                      return (
                        <tr key={v.variantId || idx} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {attrEntries.map(([k, val]) => (
                                <span
                                  key={k}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-800"
                                >
                                  <span className="text-slate-400 font-normal">{k}:</span>
                                  <strong>{String(val)}</strong>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 select-all">
                            {v.sku}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-semibold text-slate-900">
                            {formatPrice(effPrice)}
                            {!hasOverride && (
                              <span className="text-[10px] text-slate-400 font-normal ml-1">(base)</span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {v.stock > 0 ? (
                              <span className="font-semibold text-slate-800">{v.stock} units</span>
                            ) : (
                              <Badge variant="danger" size="sm">0 Stock</Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {v.isActive !== false ? (
                              <Badge variant="success" size="sm">Active</Badge>
                            ) : (
                              <Badge variant="secondary" size="sm">Inactive</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Technical Specifications */}
          {Array.isArray(product.specifications) && product.specifications.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Technical Specifications ({product.specifications.length})
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                {product.specifications.map((spec, idx) => (
                  <div key={idx} className="grid grid-cols-3 p-3 text-xs bg-slate-50/40 odd:bg-white">
                    <span className="font-bold text-slate-700">{spec.label}</span>
                    <span className="col-span-2 text-slate-600 font-medium">{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right 1 Col: Media & Audit Metadata */}
        <div className="space-y-6">
          {/* Media / Images */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Product Media
            </h3>

            {/* Primary Image */}
            <div>
              <span className="text-xs text-slate-400 block mb-1">Primary Image</span>
              {product.image ? (
                <div className="w-full h-48 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden p-2">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-full h-32 rounded-xl bg-slate-100 border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">
                  No primary image set
                </div>
              )}
            </div>

            {/* Gallery Images */}
            {Array.isArray(product.images) && product.images.length > 0 && (
              <div>
                <span className="text-xs text-slate-400 block mb-1">
                  Gallery ({product.images.length})
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {product.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="h-20 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden p-1"
                    >
                      <img src={img} alt={`Gallery ${idx + 1}`} className="w-full h-full object-contain" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Audit Trail & Metadata */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Audit & Metadata
            </h3>
            <div className="space-y-2 text-slate-600">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Created At</span>
                <span className="font-medium text-slate-800">{formatDate(product.createdAt)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Last Updated</span>
                <span className="font-medium text-slate-800">{formatDate(product.updatedAt)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Catalog Visibility</span>
                <span className="font-semibold text-slate-800">{product.isActive ? 'Public Storefront' : 'Hidden / Inactive'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Schema Type</span>
                <span className="font-semibold text-slate-800">{hasVariants ? 'Variant Matrix' : 'Standard'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog: Toggle Status */}
      {statusConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {product.isActive ? 'Deactivate Product?' : 'Activate Product?'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {product.isActive
                ? 'Deactivating will hide this product from the customer storefront and search immediately.'
                : 'Activating will publish this product to the customer storefront and search.'}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setStatusConfirmOpen(false)}
                disabled={isUpdatingStatus}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleToggleStatus}
                loading={isUpdatingStatus}
                disabled={isUpdatingStatus}
              >
                {product.isActive ? 'Confirm Deactivate' : 'Confirm Activate'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Soft Delete */}
      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 text-rose-700">
              Soft Delete Product from Catalog?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will set <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">isActive: false</code> in the database. Product orders, variant references, and inventory history remain preserved safely.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                ref={deleteCancelBtnRef}
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
                onClick={handleConfirmDelete}
                loading={isDeleting}
                disabled={isDeleting}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
