/* global queueMicrotask, window, FileReader, Image */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  adminBannerService,
  BANNER_PLACEMENTS,
  BANNER_DESTINATION_TYPES,
  getEffectiveBannerStatus,
  resolveBannerImageUrl
} from '../../features/admin/adminBanner.service.js';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState, AdminEmptyState } from '../../layouts/admin/AdminShellStates.jsx';

function PlacementBadge({ placement }) {
  const meta = BANNER_PLACEMENTS.find((p) => p.value === placement) || { label: placement };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#EEF5F1] text-[#123C32] border border-[#123C32]/10">
      {meta.label}
    </span>
  );
}

function DestinationBadge({ type }) {
  const meta = BANNER_DESTINATION_TYPES.find((d) => d.value === type) || { label: type || 'Internal' };
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
      {meta.label}
    </span>
  );
}

function StatusBadge({ banner }) {
  const eff = getEffectiveBannerStatus(banner);
  if (eff === 'published' || eff === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Published
      </span>
    );
  }
  if (eff === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        Scheduled
      </span>
    );
  }
  if (eff === 'expired') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Expired
      </span>
    );
  }
  if (eff === 'archived') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Archived
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Draft
    </span>
  );
}

export default function AdminBannersPage() {
  const [banners, setBanners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [placementFilter, setPlacementFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    heading: '',
    subtitle: '',
    buttonLabel: '',
    placement: 'hero_carousel',
    imageUrl: '',
    desktopImage: '',
    mobileImageUrl: '',
    mobileImage: '',
    altText: '',
    destinationType: 'custom_internal',
    destination: '/shop',
    targetUrl: '/shop',
    position: 1,
    displayOrder: 1,
    status: 'published',
    startsAt: '',
    endsAt: ''
  });

  // Upload helpers
  const [desktopImageMeta, setDesktopImageMeta] = useState(null); // { size, width, height }
  const [mobileImageMeta, setMobileImageMeta] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live Storefront Preview Modal
  const [previewingBanner, setPreviewingBanner] = useState(null);
  const [previewViewport, setPreviewViewport] = useState('desktop'); // 'desktop' | 'mobile'

  const desktopFileInputRef = useRef(null);
  const mobileFileInputRef = useRef(null);

  const fetchBanners = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminBannerService.getAdminBanners({
        placement: placementFilter,
        status: statusFilter,
        search
      });
      setBanners(data.banners || []);
    } catch (err) {
      setError(err?.message || 'Failed to load promotional banners.');
    } finally {
      setIsLoading(false);
    }
  }, [placementFilter, statusFilter, search]);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        fetchBanners();
      }
    });
    return () => {
      ignore = true;
    };
  }, [fetchBanners]);

  const handleOpenCreateModal = () => {
    setEditingBanner(null);
    setDesktopImageMeta(null);
    setMobileImageMeta(null);
    setFormData({
      title: '',
      heading: '',
      subtitle: '',
      buttonLabel: 'Explore Collection',
      placement: 'hero_carousel',
      imageUrl: '',
      desktopImage: '',
      mobileImageUrl: '',
      mobileImage: '',
      altText: '',
      destinationType: 'custom_internal',
      destination: '/shop',
      targetUrl: '/shop',
      position: banners.length + 1,
      displayOrder: banners.length + 1,
      status: 'published',
      startsAt: new Date().toISOString().slice(0, 16),
      endsAt: ''
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (banner) => {
    setEditingBanner(banner);
    setDesktopImageMeta(null);
    setMobileImageMeta(null);
    const dImg = banner.desktopImage || banner.imageUrl || '';
    const mImg = banner.mobileImage || banner.mobileImageUrl || '';
    setFormData({
      title: banner.title || '',
      heading: banner.heading || '',
      subtitle: banner.subtitle || '',
      buttonLabel: banner.buttonLabel || '',
      placement: banner.placement || 'hero_carousel',
      imageUrl: dImg,
      desktopImage: dImg,
      mobileImageUrl: mImg,
      mobileImage: mImg,
      altText: banner.altText || '',
      destinationType: banner.destinationType || 'custom_internal',
      destination: banner.destination || banner.targetUrl || '/shop',
      targetUrl: banner.targetUrl || banner.destination || '/shop',
      position: banner.position !== undefined ? banner.position : banner.displayOrder || 1,
      displayOrder: banner.displayOrder || banner.position || 1,
      status: banner.status || 'published',
      startsAt: banner.startsAt ? new Date(banner.startsAt).toISOString().slice(0, 16) : '',
      endsAt: (banner.endsAt || banner.expiresAt)
        ? new Date(banner.endsAt || banner.expiresAt).toISOString().slice(0, 16)
        : ''
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  // Process image file selection, decoding, validation, and base64 parsing
  const handleProcessImageFile = (file, variant) => {
    if (!file) return;

    // Reject SVG
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    if (isSvg) {
      setModalError('SVG format is not permitted for banner security. Please use JPEG, PNG, or WebP.');
      return;
    }

    // Size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setModalError(`File size exceeds 5MB limit (received ${sizeMb} MB).`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        const meta = {
          size: `${(file.size / 1024).toFixed(1)} KB`,
          width: img.naturalWidth,
          height: img.naturalHeight,
          name: file.name
        };

        if (variant === 'desktop') {
          setDesktopImageMeta(meta);
          setFormData((prev) => ({
            ...prev,
            imageUrl: dataUrl,
            desktopImage: dataUrl
          }));
        } else {
          setMobileImageMeta(meta);
          setFormData((prev) => ({
            ...prev,
            mobileImageUrl: dataUrl,
            mobileImage: dataUrl
          }));
        }
        setModalError(null);
      };
      img.onerror = () => {
        setModalError('Could not decode image file. Please provide a valid JPEG, PNG, or WebP file.');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitModal = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);

    try {
      const effectiveEnd = formData.endsAt ? new Date(formData.endsAt).toISOString() : null;
      const effectiveStart = formData.startsAt ? new Date(formData.startsAt).toISOString() : null;

      if (effectiveStart && effectiveEnd && new Date(effectiveStart) >= new Date(effectiveEnd)) {
        throw new Error('Schedule expiration date must be strictly after the start date.');
      }

      const dImage = formData.desktopImage || formData.imageUrl;
      if (!dImage) {
        throw new Error('A desktop banner image is required before publishing.');
      }

      const isDesktopBase64 = typeof dImage === 'string' && dImage.startsWith('data:');
      const isMobileBase64 = typeof (formData.mobileImage || formData.mobileImageUrl) === 'string' &&
        (formData.mobileImage || formData.mobileImageUrl).startsWith('data:');

      const bannerPayload = {
        title: formData.title,
        heading: formData.heading,
        subtitle: formData.subtitle,
        buttonLabel: formData.buttonLabel,
        placement: formData.placement,
        desktopImage: dImage,
        imageUrl: isDesktopBase64 ? undefined : dImage,
        mobileImage: formData.mobileImage || formData.mobileImageUrl || '',
        mobileImageUrl: isMobileBase64 ? '' : (formData.mobileImage || formData.mobileImageUrl || ''),
        altText: formData.altText,
        destinationType: formData.destinationType,
        destination: formData.destination || formData.targetUrl,
        targetUrl: formData.targetUrl || formData.destination,
        position: Number(formData.position) || 1,
        displayOrder: Number(formData.position) || 1,
        status: formData.status,
        startsAt: effectiveStart,
        endsAt: effectiveEnd,
        expiresAt: effectiveEnd
      };

      if (editingBanner) {
        const id = editingBanner._id || editingBanner.id;
        await adminBannerService.updateAdminBanner(id, bannerPayload);
      } else {
        await adminBannerService.createAdminBanner(bannerPayload);
      }
      setIsModalOpen(false);
      fetchBanners();
    } catch (err) {
      setModalError(err?.message || 'Failed to save banner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (banner) => {
    const nextStatus = banner.status === 'published' ? 'draft' : 'published';
    const id = banner._id || banner.id;
    try {
      await adminBannerService.toggleBannerStatus(id, nextStatus);
      fetchBanners();
    } catch (err) {
      setError(err?.message || 'Failed to update banner status.');
    }
  };

  const handleDeleteBanner = async (bannerId) => {
    if (!window.confirm('Are you sure you want to delete this promotional banner and its uploaded assets?')) return;
    try {
      await adminBannerService.deleteAdminBanner(bannerId);
      fetchBanners();
    } catch (err) {
      setError(err?.message || 'Failed to delete banner.');
    }
  };

  // Quick reorder position
  const handleMoveBanner = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= banners.length) return;

    const reordered = [...banners];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    // Build reorder items
    const reorderPayload = reordered.map((b, idx) => ({
      id: b._id || b.id,
      position: idx + 1
    }));

    try {
      await adminBannerService.reorderBanners(reorderPayload);
      fetchBanners();
    } catch (err) {
      setError(err?.message || 'Failed to update banner positions.');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <AdminPageHeader
        title="Banner Management"
        subtitle="Manage promotional graphics, hero carousels, responsive mobile imagery, and schedule display windows."
        badge="Marketing"
        actions={
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#123C32] text-white text-xs sm:text-sm font-bold hover:bg-[#0E332B] transition-colors shadow-xs"
          >
            <svg className="w-4 h-4 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add New Banner
          </button>
        }
      />

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-[#E4E8E5] p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search banners by title, headline, or destination..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-[#E4E8E5] rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30 focus:border-[#123C32]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={placementFilter}
              onChange={(e) => setPlacementFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-[#F7F6F1] border border-[#E4E8E5] rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#123C32]"
              aria-label="Filter by Placement"
            >
              <option value="all">Placement: All</option>
              {BANNER_PLACEMENTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-[#F7F6F1] border border-[#E4E8E5] rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#123C32]"
              aria-label="Filter by Status"
            >
              <option value="all">Status: All</option>
              <option value="published">Status: Published</option>
              <option value="scheduled">Status: Scheduled</option>
              <option value="draft">Status: Draft</option>
              <option value="expired">Status: Expired</option>
              <option value="archived">Status: Archived</option>
            </select>

            <button
              type="button"
              onClick={fetchBanners}
              className="p-2 text-slate-600 hover:text-slate-900 rounded-xl border border-[#E4E8E5] hover:bg-slate-50 transition-colors"
              title="Refresh"
              aria-label="Refresh banners"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <AdminLoadingState title="Loading marketing banners..." subtitle="Fetching active placements and graphics..." />
      ) : error ? (
        <AdminErrorState title="Unable to load banners" message={error} onRetry={fetchBanners} />
      ) : banners.length === 0 ? (
        <AdminEmptyState
          title="No banners found"
          message="No storefront promotional banners match your active filters. Click Add New Banner to create one."
          actionLabel="Add New Banner"
          onAction={handleOpenCreateModal}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {banners.map((b, idx) => {
            const hasMobile = Boolean(b.mobileImage || b.mobileImageUrl);
            const desktopSrc = resolveBannerImageUrl(b.desktopImage || b.imageUrl);
            return (
              <div
                key={b._id || b.id}
                className="bg-white rounded-2xl border border-[#E4E8E5] overflow-hidden shadow-2xs hover:shadow-sm transition-all flex flex-col"
              >
                {/* Image Preview Container */}
                <div className="relative aspect-video bg-slate-100 border-b border-slate-100 overflow-hidden group">
                  <img
                    src={desktopSrc}
                    alt={b.altText || b.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextElementSibling) {
                        e.currentTarget.nextElementSibling.classList.remove('hidden');
                      }
                    }}
                  />
                  <div className="hidden absolute inset-0 bg-slate-100 flex flex-col items-center justify-center p-4 text-slate-400 text-center">
                    <svg className="w-8 h-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[11px]">Image unavailable</span>
                  </div>

                  {/* Top Left: Status Overlay Badge */}
                  <div className="absolute top-3 left-3">
                    <StatusBadge banner={b} />
                  </div>

                  {/* Top Right: Reorder & Priority */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur-2xs px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-700 shadow-2xs">
                    <span>Pos #{b.position !== undefined ? b.position : b.displayOrder}</span>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveBanner(idx, 'up')}
                      className="text-slate-400 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-400 px-0.5"
                      title="Move Up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === banners.length - 1}
                      onClick={() => handleMoveBanner(idx, 'down')}
                      className="text-slate-400 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-400 px-0.5"
                      title="Move Down"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Bottom Image Availability Pill */}
                  <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white backdrop-blur-2xs">
                      Desktop Ready
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold backdrop-blur-2xs ${
                        hasMobile ? 'bg-emerald-600/80 text-white' : 'bg-slate-700/60 text-slate-200'
                      }`}
                      title={hasMobile ? 'Mobile specific asset' : 'Uses desktop fallback on mobile'}
                    >
                      {hasMobile ? 'Mobile: Custom' : 'Mobile: Fallback'}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <PlacementBadge placement={b.placement} />
                      <DestinationBadge type={b.destinationType} />
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{b.title}</h3>
                      {b.heading && (
                        <p className="text-xs font-semibold text-[#123C32] line-clamp-1">{b.heading}</p>
                      )}
                    </div>

                    {b.subtitle && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{b.subtitle}</p>
                    )}

                    <div className="pt-1 flex items-center gap-1.5 text-xs text-slate-600 font-mono">
                      <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span className="truncate max-w-[240px]">{b.destination || b.targetUrl}</span>
                    </div>

                    {/* Schedule summary */}
                    {(b.startsAt || b.endsAt || b.expiresAt) && (
                      <div className="text-[11px] text-slate-400">
                        {b.startsAt && `Starts: ${new Date(b.startsAt).toLocaleDateString()} `}
                        {(b.endsAt || b.expiresAt) && `• Ends: ${new Date(b.endsAt || b.expiresAt).toLocaleDateString()}`}
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(b)}
                        className="text-xs font-semibold text-slate-700 hover:text-[#123C32] px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        {b.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewingBanner(b);
                          setPreviewViewport('desktop');
                        }}
                        className="text-xs font-semibold text-[#123C32] hover:underline px-1 py-1"
                      >
                        Live Preview
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(b)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Edit Banner"
                        aria-label="Edit banner"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBanner(b._id || b.id)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Delete Banner"
                        aria-label="Delete banner"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Banner Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="banner-modal-title"
        >
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 animate-slideUp space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 id="banner-modal-title" className="text-lg font-bold text-slate-900">
                  {editingBanner ? 'Edit Banner Configuration' : 'Create Promotional Banner'}
                </h2>
                <p className="text-xs text-slate-500">Configure promotional assets, responsive images, and destination routes.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-lg font-bold"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            {modalError && (
              <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmitModal} className="space-y-4">
              {/* Campaign Title & Headline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Internal Campaign Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Summer Essentials 2026"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30 focus:border-[#123C32]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Public Headline (Optional)</label>
                  <input
                    type="text"
                    value={formData.heading}
                    onChange={(e) => setFormData((prev) => ({ ...prev, heading: e.target.value }))}
                    placeholder="e.g. Gear Up for Your Next Adventure"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30 focus:border-[#123C32]"
                  />
                </div>
              </div>

              {/* Subtitle & CTA Label */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Subtitle / Tagline (Optional)</label>
                  <input
                    type="text"
                    value={formData.subtitle}
                    onChange={(e) => setFormData((prev) => ({ ...prev, subtitle: e.target.value }))}
                    placeholder="e.g. Extra 15% off at checkout on all gear"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30 focus:border-[#123C32]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">CTA Button Label</label>
                  <input
                    type="text"
                    value={formData.buttonLabel}
                    onChange={(e) => setFormData((prev) => ({ ...prev, buttonLabel: e.target.value }))}
                    placeholder="e.g. Explore Collection"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30 focus:border-[#123C32]"
                  />
                </div>
              </div>

              {/* Placement & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Placement *</label>
                  <select
                    value={formData.placement}
                    onChange={(e) => setFormData((prev) => ({ ...prev, placement: e.target.value }))}
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30"
                  >
                    {BANNER_PLACEMENTS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Display Position / Priority</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.position}
                    onChange={(e) => {
                      const pos = parseInt(e.target.value, 10) || 1;
                      setFormData((prev) => ({ ...prev, position: pos, displayOrder: pos }));
                    }}
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30"
                  />
                </div>
              </div>

              {/* Desktop Image Upload Area */}
              <div className="space-y-2 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    Desktop Image * (JPEG, PNG, WebP — Max 5MB)
                  </label>
                  {desktopImageMeta && (
                    <span className="text-[10px] text-slate-500 font-medium">
                      {desktopImageMeta.width}x{desktopImageMeta.height} px • {desktopImageMeta.size}
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <input
                    type="file"
                    ref={desktopFileInputRef}
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => handleProcessImageFile(e.target.files[0], 'desktop')}
                  />
                  <button
                    type="button"
                    onClick={() => desktopFileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs shrink-0"
                  >
                    Choose Desktop File
                  </button>
                  <span className="text-xs text-slate-400">or enter image URL below</span>
                </div>

                <input
                  type="text"
                  required
                  value={formData.desktopImage || formData.imageUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({ ...prev, desktopImage: val, imageUrl: val }));
                  }}
                  placeholder="https://... or uploaded /api/v1/banners/images/..."
                  className="w-full px-3.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#123C32]"
                />

                {(formData.desktopImage || formData.imageUrl) && (
                  <div className="relative aspect-video max-h-36 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center">
                    <img
                      src={resolveBannerImageUrl(formData.desktopImage || formData.imageUrl)}
                      alt="Desktop Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>

              {/* Mobile Image Upload Area */}
              <div className="space-y-2 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    Mobile Image (Optional — falls back to desktop image)
                  </label>
                  {mobileImageMeta && (
                    <span className="text-[10px] text-slate-500 font-medium">
                      {mobileImageMeta.width}x{mobileImageMeta.height} px • {mobileImageMeta.size}
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <input
                    type="file"
                    ref={mobileFileInputRef}
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => handleProcessImageFile(e.target.files[0], 'mobile')}
                  />
                  <button
                    type="button"
                    onClick={() => mobileFileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs shrink-0"
                  >
                    Choose Mobile File
                  </button>
                  <span className="text-xs text-slate-400">or enter image URL below</span>
                </div>

                <input
                  type="text"
                  value={formData.mobileImage || formData.mobileImageUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData((prev) => ({ ...prev, mobileImage: val, mobileImageUrl: val }));
                  }}
                  placeholder="https://... or /api/v1/banners/images/... (Leave blank for fallback)"
                  className="w-full px-3.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#123C32]"
                />

                {(formData.mobileImage || formData.mobileImageUrl) && (
                  <div className="relative aspect-4/3 max-h-32 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center">
                    <img
                      src={resolveBannerImageUrl(formData.mobileImage || formData.mobileImageUrl)}
                      alt="Mobile Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>

              {/* Alt Text */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Accessible Alt Text *</label>
                <input
                  type="text"
                  required
                  value={formData.altText}
                  onChange={(e) => setFormData((prev) => ({ ...prev, altText: e.target.value }))}
                  placeholder="Describe image visually for accessibility..."
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30"
                />
              </div>

              {/* Destination Type & URL */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700">Destination Type</label>
                  <select
                    value={formData.destinationType}
                    onChange={(e) => {
                      const type = e.target.value;
                      let defaultDest = formData.destination;
                      if (type === 'category' && !defaultDest.includes('category')) defaultDest = '/shop?category=Camping';
                      if (type === 'sale') defaultDest = '/shop?collection=sale';
                      if (type === 'custom_internal' && !defaultDest.startsWith('/')) defaultDest = '/shop';
                      setFormData((prev) => ({
                        ...prev,
                        destinationType: type,
                        destination: defaultDest,
                        targetUrl: defaultDest
                      }));
                    }}
                    className="w-full px-3.5 py-2 text-xs bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30"
                  >
                    {BANNER_DESTINATION_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700">Destination Route or Safe URL *</label>
                  <input
                    type="text"
                    required
                    value={formData.destination || formData.targetUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData((prev) => ({ ...prev, destination: val, targetUrl: val }));
                    }}
                    placeholder="/shop or /products/123 or https://..."
                    className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#123C32]/30"
                  />
                </div>
              </div>

              {/* Scheduling Start & End */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Schedule Start (Optional)</label>
                  <input
                    type="datetime-local"
                    value={formData.startsAt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, startsAt: e.target.value }))}
                    className="w-full px-3.5 py-2 text-xs bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Schedule Expiration (Optional)</label>
                  <input
                    type="datetime-local"
                    value={formData.endsAt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, endsAt: e.target.value }))}
                    className="w-full px-3.5 py-2 text-xs bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Initial Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3.5 py-2 text-xs bg-[#F7F6F1] border border-slate-200 rounded-xl text-slate-900"
                >
                  <option value="published">Published (Active)</option>
                  <option value="draft">Draft (Hidden from Storefront)</option>
                </select>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-[#123C32] text-white text-xs font-bold hover:bg-[#0E332B] transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingBanner ? 'Update Banner' : 'Create Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Storefront Preview Modal */}
      {previewingBanner && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-2xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
        >
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5 animate-slideUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 id="preview-modal-title" className="text-base font-bold text-slate-900">
                  Storefront Preview: {previewingBanner.title}
                </h2>
                <p className="text-xs text-slate-500">Live approximation of banner typography, responsive photography, and CTA button.</p>
              </div>

              {/* Viewport Switcher */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#F7F6F1] p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('desktop')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      previewViewport === 'desktop'
                        ? 'bg-[#123C32] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('mobile')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      previewViewport === 'mobile'
                        ? 'bg-[#123C32] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Mobile
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewingBanner(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 text-lg font-bold"
                  aria-label="Close preview"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Preview Frame */}
            <div className="flex justify-center p-4 bg-slate-900/5 rounded-2xl overflow-hidden">
              <div
                className={`relative overflow-hidden rounded-2xl bg-[#0E332B] flex items-center transition-all duration-300 shadow-md ${
                  previewViewport === 'desktop'
                    ? 'w-full min-h-[360px] sm:min-h-[400px]'
                    : 'w-[360px] min-h-[460px]'
                }`}
              >
                {/* Background image */}
                <div className="absolute inset-0 z-0">
                  <img
                    src={resolveBannerImageUrl(
                      previewViewport === 'mobile' && previewingBanner.mobileImage
                        ? previewingBanner.mobileImage
                        : previewingBanner.desktopImage || previewingBanner.imageUrl
                    )}
                    alt={previewingBanner.altText || ''}
                    className="w-full h-full object-cover object-center brightness-[0.82]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0E332B]/95 via-[#0E332B]/75 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0E332B]/80 via-transparent to-black/20" />
                </div>

                {/* Content */}
                <div className="relative z-10 p-6 sm:p-8 max-w-lg space-y-3">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F97316]" />
                    <span className="text-[10px] font-bold text-white tracking-widest uppercase">
                      FEATURED SPOTLIGHT
                    </span>
                  </div>

                  <h3 className="text-xl sm:text-2xl font-black text-white leading-tight drop-shadow-sm">
                    {previewingBanner.heading || previewingBanner.title}
                  </h3>

                  {previewingBanner.subtitle && (
                    <p className="text-xs sm:text-sm text-[#d5e8dd] leading-relaxed line-clamp-3">
                      {previewingBanner.subtitle}
                    </p>
                  )}

                  <div className="pt-2">
                    <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F97316] text-white font-bold text-xs rounded-xl shadow-md pointer-events-none">
                      {previewingBanner.buttonLabel || 'Explore Collection'}
                      <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span>Destination:</span>
                <code className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-mono">
                  {previewingBanner.destination || previewingBanner.targetUrl}
                </code>
              </div>
              <button
                type="button"
                onClick={() => setPreviewingBanner(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
