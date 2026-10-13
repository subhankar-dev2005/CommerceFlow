import { useState, useEffect, useCallback, useRef } from 'react';
import { adminProductService } from '../../features/admin/adminProduct.service.js';
import { getCategories, invalidateCategoriesCache } from '../../features/products/product.service.js';
import { formatPrice } from '../../lib/utils.js';
import Skeleton from '../../components/Skeleton.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Button from '../../components/Button.jsx';
import Badge from '../../components/Badge.jsx';

/**
 * Format ISO timestamp into human-readable date.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}

/**
 * Product Image with graceful load failure fallback.
 */
function ProductThumbnail({ src, alt, className = 'w-10 h-10' }) {
  const [hasError, setHasError] = useState(!src);

  if (hasError || !src) {
    return (
      <div
        className={`${className} rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400`}
        aria-hidden="true"
      >
        <svg className="w-5 h-5 stroke-[1.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`${className} rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0`}>
      <img
        src={src}
        alt={alt || 'Product'}
        onError={() => setHasError(true)}
        className="w-full h-full object-contain p-0.5"
      />
    </div>
  );
}

/**
 * Production Product Management Catalog Console
 * Route: /admin/products
 */
export default function AdminProductsPage({ search: searchProp = '' }) {
  const queryParams = typeof window !== 'undefined' && window.URLSearchParams
    ? new window.URLSearchParams(searchProp || window.location.search)
    : { get: () => null };

  const initialSearch = queryParams.get('search') || '';
  const initialCategory = queryParams.get('category') || '';
  const initialStatus = queryParams.get('status') || 'all';
  const initialStock = queryParams.get('stock') || (queryParams.get('inStock') === 'true' ? 'inStock' : 'all');
  const initialHasVariants = queryParams.get('hasVariants') || 'all';
  const initialSort = queryParams.get('sort') || 'newest';
  const initialPage = parseInt(queryParams.get('page'), 10) || 1;
  const initialLimit = parseInt(queryParams.get('limit'), 10) || 10;

  // Filter & Pagination States
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [status, setStatus] = useState(initialStatus);
  const [stock, setStock] = useState(initialStock);
  const [hasVariants, setHasVariants] = useState(initialHasVariants);
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  // Data States
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalProducts: 0, totalPages: 1 });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Mutation & Delete Confirmation States
  const [productToDelete, setProductToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusProduct, setStatusProduct] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const deleteDialogRef = useRef(null);
  const deleteCancelBtnRef = useRef(null);

  // Load distinct categories once
  useEffect(() => {
    let isMounted = true;
    getCategories()
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setCategories(data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync browser URL query string with active filters
  useEffect(() => {
    if (typeof window === 'undefined' || !window.URLSearchParams) return;
    const params = new window.URLSearchParams();
    if (appliedSearch) params.set('search', appliedSearch);
    if (category) params.set('category', category);
    if (status !== 'all') params.set('status', status);
    if (stock !== 'all') params.set('stock', stock);
    if (hasVariants !== 'all') params.set('hasVariants', hasVariants);
    if (sort !== 'newest') params.set('sort', sort);
    if (page > 1) params.set('page', String(page));
    if (limit !== 10) params.set('limit', String(limit));

    const qs = params.toString();
    const newUrl = qs ? `/admin/products?${qs}` : '/admin/products';
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.replaceState({}, '', newUrl);
    }
  }, [appliedSearch, category, status, stock, hasVariants, sort, page, limit]);

  // Main products fetch effect
  useEffect(() => {
    let isMounted = true;

    queueMicrotask(() => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);

      adminProductService
        .getProducts({
          page,
          limit,
          search: appliedSearch.trim() || undefined,
          category: category || undefined,
          status: status !== 'all' ? status : undefined,
          stock: stock !== 'all' ? stock : undefined,
          hasVariants: hasVariants !== 'all' ? hasVariants : undefined,
          sort,
        })
        .then((res) => {
          if (!isMounted) return;
          setProducts(res.products || []);
          setPagination(res.pagination || { page: 1, limit, totalProducts: 0, totalPages: 1 });
        })
        .catch((err) => {
          if (!isMounted) return;
          setError(err?.message || 'Failed to load products from catalog.');
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    });

    return () => {
      isMounted = false;
    };
  }, [page, limit, appliedSearch, category, status, stock, hasVariants, sort, reloadTrigger]);

  // Escape key handler for accessible modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (productToDelete && !isDeleting) setProductToDelete(null);
        if (statusProduct && !isUpdatingStatus) setStatusProduct(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [productToDelete, isDeleting, statusProduct, isUpdatingStatus]);

  // Focus cancel button when modal opens
  useEffect(() => {
    if (productToDelete && deleteCancelBtnRef.current) {
      deleteCancelBtnRef.current.focus();
    }
  }, [productToDelete]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(searchInput.trim());
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setCategory('');
    setStatus('all');
    setStock('all');
    setHasVariants('all');
    setSort('newest');
    setPage(1);
  };

  const handleRetry = useCallback(() => {
    setReloadTrigger((prev) => prev + 1);
  }, []);

  const handleToggleStatus = async () => {
    if (!statusProduct?._id || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      const nextActive = !statusProduct.isActive;
      await adminProductService.updateProductStatus(statusProduct._id, nextActive);
      invalidateCategoriesCache();
      setActionMessage({
        type: 'success',
        text: `Product "${statusProduct.name}" was ${nextActive ? 'activated' : 'deactivated'}.`,
      });
      setStatusProduct(null);
      setReloadTrigger((prev) => prev + 1);
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
    if (!productToDelete?._id || isDeleting) return;
    setIsDeleting(true);
    try {
      await adminProductService.deleteProduct(productToDelete._id);
      invalidateCategoriesCache();
      setActionMessage({
        type: 'success',
        text: `Product "${productToDelete.name}" was deactivated (soft-deleted).`,
      });
      setProductToDelete(null);

      if (products.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        setReloadTrigger((prev) => prev + 1);
      }
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to deactivate product. Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const hasActiveFilters = Boolean(
    appliedSearch ||
    category ||
    status !== 'all' ||
    stock !== 'all' ||
    hasVariants !== 'all' ||
    sort !== 'newest'
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <a href="/admin" className="hover:text-blue-600 transition-colors">Admin</a>
            <span>&rsaquo;</span>
            <span className="text-slate-900 font-medium">Products</span>
          </nav>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Product Catalog Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Authoritative catalog: <strong className="text-slate-800">{pagination.totalProducts}</strong> products found.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            as="a"
            href="/admin/products/new"
            variant="primary"
            size="md"
            className="font-semibold shadow-xs min-h-[44px]"
          >
            <svg className="w-4 h-4 stroke-[2.2] mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add New Product
          </Button>
        </div>
      </div>

      {/* 2. Action Notification Alert */}
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
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      )}

      {/* 3. Comprehensive Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          {/* Search Input */}
          <div className="lg:col-span-3 relative">
            <label htmlFor="catalog-search-input" className="sr-only">
              Search products
            </label>
            <input
              id="catalog-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, SKU, or text..."
              className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Category Dropdown */}
          <div className="lg:col-span-2">
            <label htmlFor="catalog-category-filter" className="sr-only">
              Filter by category
            </label>
            <select
              id="catalog-category-filter"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-slate-700"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Status Filter (all | active | inactive) */}
          <div className="lg:col-span-2">
            <label htmlFor="catalog-status-filter" className="sr-only">
              Filter by status
            </label>
            <select
              id="catalog-status-filter"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-slate-700"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Stock Level Filter (all | inStock | lowStock | outOfStock) */}
          <div className="lg:col-span-2">
            <label htmlFor="catalog-stock-filter" className="sr-only">
              Filter by stock
            </label>
            <select
              id="catalog-stock-filter"
              value={stock}
              onChange={(e) => {
                setStock(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-slate-700"
            >
              <option value="all">All Inventory</option>
              <option value="inStock">In Stock</option>
              <option value="lowStock">Low Stock (≤ 5)</option>
              <option value="outOfStock">Out of Stock (0)</option>
            </select>
          </div>

          {/* Product Type Filter (all | true | false) */}
          <div className="lg:col-span-1">
            <label htmlFor="catalog-variant-filter" className="sr-only">
              Filter by variant presence
            </label>
            <select
              id="catalog-variant-filter"
              value={hasVariants}
              onChange={(e) => {
                setHasVariants(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-slate-700"
            >
              <option value="all">All Types</option>
              <option value="true">Variants</option>
              <option value="false">Simple</option>
            </select>
          </div>

          {/* Sort Filter */}
          <div className="lg:col-span-1">
            <label htmlFor="catalog-sort-filter" className="sr-only">
              Sort products
            </label>
            <select
              id="catalog-sort-filter"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none text-slate-700"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="price_asc">Price: Low-High</option>
              <option value="price_desc">Price: High-Low</option>
              <option value="name_asc">Name: A-Z</option>
              <option value="stock_asc">Stock: Low</option>
            </select>
          </div>

          {/* Submit */}
          <div className="lg:col-span-1 flex items-center">
            <Button type="submit" variant="secondary" size="md" className="w-full min-h-[38px] text-xs">
              Search
            </Button>
          </div>
        </form>

        {hasActiveFilters && (
          <div className="pt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100">
            <span>Filters active: displaying refined catalog view</span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-blue-600 font-semibold hover:underline"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* 4. Products Table / View */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs" role="status" aria-label="Loading products">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Unable to load catalog"
          description={error}
          onRetry={handleRetry}
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products found"
          description={
            hasActiveFilters
              ? 'No products matched your specified search or filtering criteria.'
              : 'There are currently no products in the catalog.'
          }
          action={
            hasActiveFilters ? (
              <Button type="button" variant="secondary" size="md" onClick={handleResetFilters}>
                Reset Filters
              </Button>
            ) : (
              <Button as="a" href="/admin/products/new" variant="primary" size="md">
                Create First Product
              </Button>
            )
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider">
                  <th scope="col" className="py-3.5 px-4">Product</th>
                  <th scope="col" className="py-3.5 px-4">Category</th>
                  <th scope="col" className="py-3.5 px-4">SKU</th>
                  <th scope="col" className="py-3.5 px-4">Price</th>
                  <th scope="col" className="py-3.5 px-4">Stock</th>
                  <th scope="col" className="py-3.5 px-4">Variants</th>
                  <th scope="col" className="py-3.5 px-4">Status</th>
                  <th scope="col" className="py-3.5 px-4">Updated</th>
                  <th scope="col" className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {products.map((product) => {
                  const hasProdVariants = Array.isArray(product.variants) && product.variants.length > 0;
                  const variantCount = hasProdVariants ? product.variants.length : 0;
                  const isOutOfStock = (product.stock ?? 0) <= 0;
                  const primarySku = product.sku || (hasProdVariants ? product.variants[0]?.sku : '—');

                  return (
                    <tr key={product._id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Product Thumbnail + Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <ProductThumbnail src={product.image} alt={product.name} />
                          <div className="min-w-0 max-w-xs">
                            <a
                              href={`/admin/products/${product._id}`}
                              className="font-bold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1 text-sm"
                            >
                              {product.name}
                            </a>
                            <span className="font-mono text-[10px] text-slate-400 select-all block">
                              ID: {product._id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 font-medium text-slate-600">
                        {product.category || 'General'}
                      </td>

                      {/* SKU */}
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {primarySku}
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 text-sm whitespace-nowrap">
                        {formatPrice(product.price ?? 0)}
                      </td>

                      {/* Stock */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isOutOfStock ? (
                          <Badge variant="danger" size="sm">0 Stock</Badge>
                        ) : product.stock <= 5 ? (
                          <Badge variant="warning" size="sm">{product.stock} Low</Badge>
                        ) : (
                          <span className="font-semibold text-slate-800">{product.stock} units</span>
                        )}
                      </td>

                      {/* Variants */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {hasProdVariants ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                            {variantCount} variants
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Simple</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {product.isActive ? (
                          <Badge variant="success" size="sm">Active</Badge>
                        ) : (
                          <Badge variant="secondary" size="sm">Inactive</Badge>
                        )}
                      </td>

                      {/* Updated Date */}
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap text-[11px]">
                        {formatDate(product.updatedAt || product.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`/admin/products/${product._id}`}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label={`View ${product.name}`}
                          >
                            View
                          </a>
                          <a
                            href={`/admin/products/${product._id}/edit`}
                            className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            aria-label={`Edit ${product.name}`}
                          >
                            Edit
                          </a>
                          <button
                            type="button"
                            onClick={() => setStatusProduct(product)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label={`${product.isActive ? 'Deactivate' : 'Activate'} ${product.name}`}
                          >
                            {product.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductToDelete(product)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            aria-label={`Delete ${product.name}`}
                            title="Soft delete product"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards (< md viewport) */}
          <div className="md:hidden divide-y divide-slate-100">
            {products.map((product) => {
              const hasProdVariants = Array.isArray(product.variants) && product.variants.length > 0;
              const isOutOfStock = (product.stock ?? 0) <= 0;

              return (
                <div key={product._id} className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <ProductThumbnail src={product.image} alt={product.name} className="w-12 h-12" />
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/admin/products/${product._id}`}
                        className="font-bold text-slate-900 hover:text-blue-600 text-sm line-clamp-2"
                      >
                        {product.name}
                      </a>
                      <p className="font-mono text-[10px] text-slate-400 mt-0.5 select-all">
                        ID: {product._id}
                      </p>
                    </div>
                    {product.isActive ? (
                      <Badge variant="success" size="sm">Active</Badge>
                    ) : (
                      <Badge variant="secondary" size="sm">Inactive</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-50">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Category</span>
                      <span className="font-medium text-slate-700">{product.category || 'General'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Price</span>
                      <span className="font-bold text-slate-900">{formatPrice(product.price ?? 0)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Stock</span>
                      {isOutOfStock ? (
                        <Badge variant="danger" size="sm">0 Stock</Badge>
                      ) : (
                        <span className="font-semibold text-slate-800">{product.stock} units</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Variants</span>
                      <span className="font-medium text-slate-700">
                        {hasProdVariants ? `${product.variants.length} items` : 'Simple'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 flex-wrap">
                    <a
                      href={`/admin/products/${product._id}`}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl"
                    >
                      View
                    </a>
                    <a
                      href={`/admin/products/${product._id}/edit`}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-xl"
                    >
                      Edit
                    </a>
                    <button
                      type="button"
                      onClick={() => setStatusProduct(product)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 rounded-xl"
                    >
                      {product.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductToDelete(product)}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 rounded-xl"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination & Page Size Selector Controls */}
          <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.totalProducts} total products)
              </span>
              <div className="flex items-center gap-1.5">
                <label htmlFor="catalog-page-size-selector" className="text-slate-400">Show:</label>
                <select
                  id="catalog-page-size-selector"
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="min-h-[38px] px-3 font-semibold"
                >
                  &larr; Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="min-h-[38px] px-3 font-semibold"
                >
                  Next &rarr;
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Status Toggle */}
      {statusProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {statusProduct.isActive ? 'Deactivate Product?' : 'Activate Product?'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to {statusProduct.isActive ? 'deactivate' : 'activate'}{' '}
              <strong className="text-slate-900 font-semibold">"{statusProduct.name}"</strong>?{' '}
              {statusProduct.isActive
                ? 'It will be hidden from the public customer storefront.'
                : 'It will become visible on the public customer storefront.'}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setStatusProduct(null)}
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
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Accessible Delete / Deactivate Confirmation Dialog */}
      {productToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-desc"
          ref={deleteDialogRef}
          onClick={(e) => {
            if (e.target === deleteDialogRef.current && !isDeleting) {
              setProductToDelete(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 id="delete-dialog-title" className="text-base font-bold text-slate-900">
                  Deactivate Product from Catalog?
                </h3>
                <p id="delete-dialog-desc" className="text-xs text-slate-600 mt-1">
                  You are deactivating <strong className="text-slate-900 font-semibold">"{productToDelete.name}"</strong> (ID: <code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded text-slate-700">{productToDelete._id}</code>).
                </p>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 leading-relaxed space-y-1">
              <p className="font-semibold">Backend Active-State Transition:</p>
              <p>
                In CommerceFlow API, deletion sets <code className="bg-amber-100/80 px-1 py-0.5 rounded text-amber-950 font-mono text-[11px]">isActive: false</code>. It immediately hides the item from the storefront while safely preserving past orders and SKU history.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                ref={deleteCancelBtnRef}
                onClick={() => setProductToDelete(null)}
                disabled={isDeleting}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="bg-rose-600 hover:bg-rose-700 border-rose-600 text-white min-h-[44px] font-semibold"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                loading={isDeleting}
              >
                {isDeleting ? 'Deactivating...' : 'Confirm Deactivation'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
