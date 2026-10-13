import { useState, useEffect, useCallback } from 'react';
import { adminCategoryService as defaultCategoryService } from '../../features/admin/adminCategory.service.js';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';

/**
 * AdminCategoriesPage Component
 * Route: /admin/categories
 *
 * Full management surface for store catalog categories.
 */
export default function AdminCategoriesPage({
  search: initialSearch = '',
  categoryService: propCategoryService,
}) {
  const service = propCategoryService || defaultCategoryService;

  const [categories, setCategories] = useState([]);
  const [totalCategories, setTotalCategories] = useState(0);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [renameTarget, setRenameTarget] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renameError, setRenameError] = useState(null);
  const [isSubmittingRename, setIsSubmittingRename] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  const [notification, setNotification] = useState(null);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadCategories = useCallback(async (signal) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await service.getAdminCategories(
        {
          search: debouncedSearch,
          sortBy,
          sortOrder,
        },
        { signal }
      );
      setCategories(res.categories || []);
      setTotalCategories(res.totalCategories || 0);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (err?.status === 429) {
        const retrySecs = err?.retryAfter;
        setError(
          retrySecs
            ? `Too many requests. Rate limit cooldown active. Please retry in ${retrySecs} seconds.`
            : 'Too many requests. Please try again shortly.'
        );
      } else {
        setError(err?.message || 'Failed to load category records.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [service, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!ignore) {
        loadCategories(controller.signal);
      }
    });
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [loadCategories]);

  // Handle Rename
  const handleOpenRename = (cat) => {
    setRenameTarget(cat);
    setNewCategoryName(cat.name);
    setRenameError(null);
  };

  const handleCloseRename = () => {
    setRenameTarget(null);
    setNewCategoryName('');
    setRenameError(null);
    setIsSubmittingRename(false);
  };

  const handleSubmitRename = async (e) => {
    e.preventDefault();
    if (!renameTarget) return;

    const trimmed = newCategoryName.trim();
    if (trimmed.length < 2) {
      setRenameError('Category name must contain at least 2 characters');
      return;
    }
    if (trimmed.toLowerCase() === renameTarget.name.toLowerCase()) {
      setRenameError('New category name must be different from current name');
      return;
    }
    if (trimmed.includes('/')) {
      setRenameError("Category name cannot contain '/'");
      return;
    }

    setIsSubmittingRename(true);
    setRenameError(null);
    try {
      await service.renameAdminCategory(renameTarget.name, trimmed);
      setNotification({
        type: 'success',
        message: `Category "${renameTarget.name}" successfully renamed to "${trimmed}".`,
      });
      handleCloseRename();
      loadCategories();
    } catch (err) {
      setRenameError(err?.message || 'Failed to rename category.');
    } finally {
      setIsSubmittingRename(false);
    }
  };

  // Handle Delete
  const handleOpenDelete = (cat) => {
    setDeleteTarget(cat);
    setDeleteError(null);
  };

  const handleCloseDelete = () => {
    setDeleteTarget(null);
    setDeleteError(null);
    setIsSubmittingDelete(false);
  };

  const handleSubmitDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.totalProducts > 0) {
      setDeleteError(
        `Cannot delete "${deleteTarget.name}". ${deleteTarget.totalProducts} products are currently assigned to it. Reassign or delete the products first.`
      );
      return;
    }

    setIsSubmittingDelete(true);
    setDeleteError(null);
    try {
      await service.deleteAdminCategory(deleteTarget.name);
      setNotification({
        type: 'success',
        message: `Category "${deleteTarget.name}" was successfully removed.`,
      });
      handleCloseDelete();
      loadCategories();
    } catch (err) {
      setDeleteError(err?.message || 'Failed to delete category.');
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  // Aggregate metrics
  const totalProductsCount = categories.reduce((acc, c) => acc + (c.totalProducts || 0), 0);
  const activeProductsCount = categories.reduce((acc, c) => acc + (c.activeProducts || 0), 0);
  const totalStockCount = categories.reduce((acc, c) => acc + (c.totalStock || 0), 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Categories Management"
        subtitle="Configure store categories, catalog taxonomy, and stock groupings."
        badge={`${totalCategories} Groups`}
      />

      {/* Notification Toast */}
      {notification && (
        <div
          role="status"
          className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border bg-emerald-50 text-emerald-800 border-emerald-200"
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Categories</div>
          <div className="text-2xl font-black text-[#102A2A] mt-2">{totalCategories}</div>
          <div className="text-xs text-slate-400 mt-1">Catalog groupings</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Products</div>
          <div className="text-2xl font-black text-[#102A2A] mt-2">{totalProductsCount}</div>
          <div className="text-xs text-slate-400 mt-1">Across all categories</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active In Store</div>
          <div className="text-2xl font-black text-emerald-700 mt-2">{activeProductsCount}</div>
          <div className="text-xs text-slate-400 mt-1">Currently live</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Inventory Stock</div>
          <div className="text-2xl font-black text-[#123C32] mt-2">{totalStockCount}</div>
          <div className="text-xs text-slate-400 mt-1">Units available</div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white rounded-2xl border border-[#E4E8E5] p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <svg
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
            aria-label="Search categories"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
            aria-label="Sort categories by"
          >
            <option value="name">Sort by Name</option>
            <option value="totalProducts">Sort by Products Count</option>
            <option value="activeProducts">Sort by Active Products</option>
            <option value="totalStock">Sort by Total Stock</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
            aria-label="Sort order"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <AdminLoadingState title="Loading Categories..." subtitle="Aggregating store catalog taxonomy." />
      ) : error ? (
        <AdminErrorState
          title="Could not load categories"
          message={error}
          onRetry={loadCategories}
        />
      ) : categories.length === 0 ? (
        <AdminEmptyState
          title="No Categories Found"
          message={
            debouncedSearch
              ? `No categories match "${debouncedSearch}". Try clearing your search.`
              : 'There are currently no product categories registered in the catalog.'
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-[#E4E8E5] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-[#EEF5F1] text-[#123C32] font-bold uppercase tracking-wider border-b border-[#D8ECE7]">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Category Name</th>
                  <th scope="col" className="px-5 py-3.5">Products</th>
                  <th scope="col" className="px-5 py-3.5">Active</th>
                  <th scope="col" className="px-5 py-3.5">Stock Status</th>
                  <th scope="col" className="px-5 py-3.5">Total Units</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {categories.map((cat) => (
                  <tr key={cat.name} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-900 text-sm">{cat.name}</div>
                    </td>
                    <td className="px-5 py-4">
                      <a
                        href={`/admin/products?category=${encodeURIComponent(cat.name)}`}
                        className="inline-flex items-center gap-1 font-semibold text-[#123C32] hover:underline"
                        title={`View products in ${cat.name}`}
                      >
                        {cat.totalProducts} items &rarr;
                      </a>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {cat.activeProducts} active
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-0.5">
                        <span className="text-xs text-slate-600 font-medium">
                          {cat.inStockProducts} in stock
                        </span>
                        {cat.outOfStockProducts > 0 && (
                          <span className="block text-xs font-semibold text-rose-600">
                            {cat.outOfStockProducts} out of stock
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono font-bold text-slate-800">{cat.totalStock}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenRename(cat)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDelete(cat)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-category-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <h2 id="rename-category-title" className="text-base font-bold text-slate-900">
              Rename Category
            </h2>
            <p className="text-xs text-slate-500">
              Renaming will safely update all {renameTarget.totalProducts} products currently assigned to &quot;{renameTarget.name}&quot;.
            </p>

            {renameError && (
              <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                {renameError}
              </div>
            )}

            <form onSubmit={handleSubmitRename} className="space-y-4">
              <div>
                <label htmlFor="new-category-name" className="block text-xs font-bold text-slate-700 mb-1">
                  New Category Name
                </label>
                <input
                  id="new-category-name"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                  required
                  disabled={isSubmittingRename}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseRename}
                  disabled={isSubmittingRename}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRename}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#123C32] text-white hover:bg-[#0E332B] transition-colors disabled:opacity-50"
                >
                  {isSubmittingRename ? 'Renaming...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Guarded Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-category-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <h2 id="delete-category-title" className="text-base font-bold text-slate-900">
              Delete Category &quot;{deleteTarget.name}&quot;
            </h2>

            {deleteTarget.totalProducts > 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
                <div className="font-bold">Cannot delete active category</div>
                <p>
                  This category contains <strong>{deleteTarget.totalProducts} products</strong>. To protect store catalog integrity, categories with active products cannot be deleted.
                </p>
                <p className="text-[11px] text-amber-700">
                  Please reassign these products to another category first.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Are you sure you want to delete this category? There are currently no products assigned to it.
              </p>
            )}

            {deleteError && (
              <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCloseDelete}
                disabled={isSubmittingDelete}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
              {deleteTarget.totalProducts === 0 && (
                <button
                  type="button"
                  onClick={handleSubmitDelete}
                  disabled={isSubmittingDelete}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
                >
                  {isSubmittingDelete ? 'Deleting...' : 'Confirm Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
