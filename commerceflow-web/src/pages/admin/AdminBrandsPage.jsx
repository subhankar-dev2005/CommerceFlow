/* global queueMicrotask */
import { useState, useEffect, useCallback } from 'react';
import { adminBrandService as defaultBrandService } from '../../features/admin/adminBrand.service.js';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';

/**
 * AdminBrandsPage Component
 * Route: /admin/brands
 *
 * Full administrative CRUD interface for manufacturer and brand records.
 */
export default function AdminBrandsPage({
  search: initialSearch = '',
  brandService: propBrandService,
}) {
  const service = propBrandService || defaultBrandService;

  const [brands, setBrands] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalBrands: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    website: '',
    logo: '',
    isActive: true,
  });
  const [formError, setFormError] = useState(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  const [notification, setNotification] = useState(null);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadBrands = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await service.getAdminBrands({
        page,
        limit: 10,
        search: debouncedSearch,
        status: statusFilter,
        sortBy: 'name',
        sortOrder: 'asc',
      });
      setBrands(res.brands || []);
      setPagination(res.pagination || { page: 1, limit: 10, totalBrands: 0, totalPages: 1 });
    } catch (err) {
      setError(err?.message || 'Failed to load brand records.');
    } finally {
      setIsLoading(false);
    }
  }, [service, page, debouncedSearch, statusFilter]);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        loadBrands();
      }
    });
    return () => {
      ignore = true;
    };
  }, [loadBrands]);

  // Open Create
  const handleOpenCreate = () => {
    setEditingBrand(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      website: '',
      logo: '',
      isActive: true,
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  // Open Edit
  const handleOpenEdit = (brand) => {
    setEditingBrand(brand);
    setFormData({
      name: brand.name || '',
      slug: brand.slug || '',
      description: brand.description || '',
      website: brand.website || '',
      logo: brand.logo || '',
      isActive: brand.isActive !== false,
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleCloseFormModal = () => {
    setIsFormModalOpen(false);
    setEditingBrand(null);
    setFormError(null);
    setIsSubmittingForm(false);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Brand name is required');
      return;
    }

    setIsSubmittingForm(true);
    setFormError(null);

    try {
      if (editingBrand) {
        await service.updateAdminBrand(editingBrand._id, {
          name: formData.name.trim(),
          slug: formData.slug.trim() || undefined,
          description: formData.description.trim(),
          website: formData.website.trim() || null,
          logo: formData.logo.trim() || null,
          isActive: formData.isActive,
        });
        setNotification({
          type: 'success',
          message: `Brand "${formData.name.trim()}" was successfully updated.`,
        });
      } else {
        await service.createAdminBrand({
          name: formData.name.trim(),
          slug: formData.slug.trim() || undefined,
          description: formData.description.trim(),
          website: formData.website.trim() || null,
          logo: formData.logo.trim() || null,
          isActive: formData.isActive,
        });
        setNotification({
          type: 'success',
          message: `Brand "${formData.name.trim()}" was successfully created.`,
        });
      }
      handleCloseFormModal();
      loadBrands();
    } catch (err) {
      setFormError(err?.message || 'Failed to save brand.');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Open Delete
  const handleOpenDelete = (brand) => {
    setDeleteTarget(brand);
    setDeleteError(null);
  };

  const handleCloseDelete = () => {
    setDeleteTarget(null);
    setDeleteError(null);
    setIsSubmittingDelete(false);
  };

  const handleSubmitDelete = async () => {
    if (!deleteTarget) return;

    setIsSubmittingDelete(true);
    setDeleteError(null);

    try {
      await service.deleteAdminBrand(deleteTarget._id);
      setNotification({
        type: 'success',
        message: `Brand "${deleteTarget.name}" was successfully removed.`,
      });
      handleCloseDelete();
      loadBrands();
    } catch (err) {
      setDeleteError(err?.message || 'Failed to delete brand.');
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  const activeBrandsCount = brands.filter((b) => b.isActive).length;
  const inactiveBrandsCount = brands.filter((b) => !b.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <AdminPageHeader
          title="Brands Management"
          subtitle="Manage manufacturer records and brand directory."
          badge={`${pagination.totalBrands} Brands`}
        />
        <div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#123C32] text-white text-xs font-semibold hover:bg-[#0E332B] transition-colors shadow-xs"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New Brand
          </button>
        </div>
      </div>

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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Brands</div>
          <div className="text-2xl font-black text-[#102A2A] mt-2">{pagination.totalBrands}</div>
          <div className="text-xs text-slate-400 mt-1">Registered manufacturers</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active In Store</div>
          <div className="text-2xl font-black text-emerald-700 mt-2">{activeBrandsCount}</div>
          <div className="text-xs text-slate-400 mt-1">Live in catalog</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E4E8E5] p-5 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inactive Brands</div>
          <div className="text-2xl font-black text-slate-600 mt-2">{inactiveBrandsCount}</div>
          <div className="text-xs text-slate-400 mt-1">Hidden from storefront</div>
        </div>
      </div>

      {/* Search and Filters */}
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
            placeholder="Search brands by name, slug, or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
            aria-label="Search brands"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
            aria-label="Filter by brand status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Main Table Area */}
      {isLoading ? (
        <AdminLoadingState title="Loading Brands..." subtitle="Retrieving manufacturer records." />
      ) : error ? (
        <AdminErrorState
          title="Could not load brands"
          message={error}
          onRetry={loadBrands}
        />
      ) : brands.length === 0 ? (
        <AdminEmptyState
          title="No Brands Found"
          message={
            debouncedSearch || statusFilter !== 'all'
              ? 'No brands match your current search criteria.'
              : 'There are currently no brand records in the catalog.'
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#E4E8E5] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-[#EEF5F1] text-[#123C32] font-bold uppercase tracking-wider border-b border-[#D8ECE7]">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Brand</th>
                    <th scope="col" className="px-5 py-3.5">Slug</th>
                    <th scope="col" className="px-5 py-3.5">Description</th>
                    <th scope="col" className="px-5 py-3.5">Website</th>
                    <th scope="col" className="px-5 py-3.5">Status</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {brands.map((brand) => (
                    <tr key={brand._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900 text-sm">{brand.name}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {brand.slug}
                        </span>
                      </td>
                      <td className="px-5 py-4 max-w-xs truncate text-slate-500">
                        {brand.description || '—'}
                      </td>
                      <td className="px-5 py-4">
                        {brand.website ? (
                          <a
                            href={brand.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#123C32] font-semibold hover:underline"
                          >
                            Visit &rarr;
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            brand.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {brand.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(brand)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(brand)}
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

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
              <div>
                Page {pagination.page} of {pagination.totalPages} ({pagination.totalBrands} brands)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="brand-modal-title"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <h2 id="brand-modal-title" className="text-base font-bold text-slate-900">
              {editingBrand ? 'Edit Brand Record' : 'Create New Brand'}
            </h2>

            {formError && (
              <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-3">
              <div>
                <label htmlFor="brand-name-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Brand Name *
                </label>
                <input
                  id="brand-name-input"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Patagonia, Arc'teryx"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                  required
                  disabled={isSubmittingForm}
                />
              </div>

              <div>
                <label htmlFor="brand-slug-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Custom Slug (optional)
                </label>
                <input
                  id="brand-slug-input"
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="Leave blank to auto-generate from name"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                  disabled={isSubmittingForm}
                />
              </div>

              <div>
                <label htmlFor="brand-desc-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  id="brand-desc-input"
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brand story or heritage..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                  disabled={isSubmittingForm}
                />
              </div>

              <div>
                <label htmlFor="brand-website-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Official Website URL
                </label>
                <input
                  id="brand-website-input"
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                  disabled={isSubmittingForm}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="brand-active-toggle"
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-[#123C32] rounded focus:ring-[#123C32]"
                  disabled={isSubmittingForm}
                />
                <label htmlFor="brand-active-toggle" className="text-xs font-semibold text-slate-700">
                  Active (visible across product catalog)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={handleCloseFormModal}
                  disabled={isSubmittingForm}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingForm}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#123C32] text-white hover:bg-[#0E332B] transition-colors disabled:opacity-50"
                >
                  {isSubmittingForm ? 'Saving...' : editingBrand ? 'Save Changes' : 'Create Brand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-brand-title"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <h2 id="delete-brand-title" className="text-base font-bold text-slate-900">
              Delete Brand &quot;{deleteTarget.name}&quot;
            </h2>
            <p className="text-xs text-slate-500">
              Are you sure you want to delete this brand record? This action cannot be undone.
            </p>

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
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitDelete}
                disabled={isSubmittingDelete}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50"
              >
                {isSubmittingDelete ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
