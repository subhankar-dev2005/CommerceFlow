/* global window, queueMicrotask */
import { useState, useEffect, useCallback } from 'react';
import {
  adminCampaignService,
  CAMPAIGN_BANNER_PLACEMENTS,
} from '../../features/admin/adminCampaign.service.js';
import { adminCouponService } from '../../features/admin/adminCoupon.service.js';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import {
  AdminLoadingState,
  AdminEmptyState,
  AdminErrorState,
} from '../../layouts/admin/AdminShellStates.jsx';

export const STORAGE_KEY = 'commerceflow_admin_campaigns_v1';
export const BACKUP_STORAGE_KEY = 'commerceflow_admin_campaigns_v1_backup';
export const IMPORTED_TRACKING_KEY = 'commerceflow_admin_campaigns_v1_imported';
export const LEGACY_IMPORTED_TRACKING_KEY = 'commerceflow_admin_campaigns_imported_v1';

const DEFAULT_EXAMPLE_IDS = new Set(['camp_1', 'camp_2']);
const DEFAULT_EXAMPLE_NAMES = new Set([
  'Diwali Festive Super Saver',
  'Winter Warmth Apparel Showcase',
]);

/**
 * 64-bit deterministic hash producing a 16-hex-digit collision-resistant digest.
 */
function hash64(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code;
    h2 = Math.imul(h2, 0x020001ab);
  }
  const s1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const s2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${s1}${s2}`;
}

/**
 * Extract an unambiguous content signature from all distinctive business attributes of a campaign draft.
 * Encodes values as a canonical JSON array to prevent delimiter-based string concatenation collisions.
 */
export function getDraftContentSignature(draft) {
  if (!draft || typeof draft !== 'object') return '';
  const trimmedName = draft.name ? String(draft.name).trim().toLowerCase() : '';
  if (!trimmedName) return '';

  const start = draft.startDate ? String(draft.startDate).slice(0, 10) : '';
  const end = draft.endDate ? String(draft.endDate).slice(0, 10) : '';
  const status = draft.status ? String(draft.status).trim().toLowerCase() : 'active';
  const placement = draft.bannerPlacement ? String(draft.bannerPlacement).trim().toLowerCase() : 'hero_carousel';
  const coupon = draft.couponCode ? String(draft.couponCode).trim().toUpperCase() : '';
  const objective = draft.objective ? String(draft.objective).trim() : '';

  const canonicalJson = JSON.stringify([trimmedName, start, end, status, placement, coupon, objective]);
  const slug = trimmedName.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  return `${slug || 'draft'}_${hash64(canonicalJson)}`;
}

/**
 * Assign and persist stable migration identifiers to any draft in a collection lacking an explicit ID.
 * For multiple identical objects lacking an ID, occurrences are tracked deterministically.
 */
export function ensureDraftIdentifiers(drafts) {
  if (!Array.isArray(drafts)) return drafts;
  const sigOccurrences = new Map();

  for (const draft of drafts) {
    if (!draft || typeof draft !== 'object') continue;
    if (draft.id || draft._id || draft._migrationId) continue;

    const sig = getDraftContentSignature(draft);
    if (!sig) continue;

    const count = (sigOccurrences.get(sig) || 0) + 1;
    sigOccurrences.set(sig, count);

    const occSuffix = count > 1 ? `_occ${count}` : '';
    draft._migrationId = `draft_${sig}${occSuffix}`;
  }
  return drafts;
}

/**
 * Extract a reliable identifier for a local draft.
 * Prefers explicit id, _id, or stamped _migrationId, falling back to deterministic content signature.
 */
export function getDraftIdentifier(draft) {
  if (!draft || typeof draft !== 'object') return null;
  const directId = draft.id || draft._id || draft._migrationId;
  if (directId != null && String(directId).trim()) {
    return String(directId).trim();
  }
  const sig = getDraftContentSignature(draft);
  if (!sig) return null;
  return `draft_${sig}`;
}

/**
 * Retrieve the set of already imported draft IDs across current and legacy localStorage keys.
 * Preserves backward compatibility without losing existing migration metadata.
 */
export function getImportedDraftIds() {
  if (typeof window === 'undefined' || !window.localStorage) return new Set();
  const importedSet = new Set();
  for (const key of [IMPORTED_TRACKING_KEY, LEGACY_IMPORTED_TRACKING_KEY]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.trim()) {
              importedSet.add(item.trim());
            } else if (item && typeof item === 'object') {
              const id = item.id || item.draftId || item._id;
              if (id != null && String(id).trim()) {
                importedSet.add(String(id).trim());
              }
            }
          }
        }
      }
    } catch {
      // Safe fallback on JSON parse errors or restricted localStorage
    }
  }
  return importedSet;
}

/**
 * Save updated imported draft IDs to current and legacy tracking keys.
 */
export function saveImportedDraftIds(importedSet) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const serialized = JSON.stringify([...importedSet]);
  try {
    window.localStorage.setItem(IMPORTED_TRACKING_KEY, serialized);
  } catch {
    // Ignore storage quota errors
  }
  try {
    window.localStorage.setItem(LEGACY_IMPORTED_TRACKING_KEY, serialized);
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Inspect local storage for user-created draft campaigns while preserving all original data.
 * Default mock examples (camp_1, camp_2) and already imported items are filtered out.
 * Assigns persistent migration identifiers to ID-less drafts and preserves them safely.
 */
export function getLocalDraftCampaigns() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    let hasNewStamps = false;
    const sigOccurrences = new Map();
    for (const c of parsed) {
      if (!c || typeof c !== 'object') continue;
      if (c.id || c._id || c._migrationId) continue;

      const sig = getDraftContentSignature(c);
      if (!sig) continue;

      const count = (sigOccurrences.get(sig) || 0) + 1;
      sigOccurrences.set(sig, count);

      const occSuffix = count > 1 ? `_occ${count}` : '';
      c._migrationId = `draft_${sig}${occSuffix}`;
      hasNewStamps = true;
    }

    if (hasNewStamps) {
      try {
        if (!window.localStorage.getItem(BACKUP_STORAGE_KEY)) {
          window.localStorage.setItem(BACKUP_STORAGE_KEY, raw);
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch {
        // Safe fallback on quota or restricted storage
      }
    }

    const importedSet = getImportedDraftIds();

    return parsed.filter((c) => {
      if (!c || typeof c !== 'object') return false;
      const draftId = getDraftIdentifier(c);
      if (draftId && importedSet.has(draftId)) return false;
      const directId = c.id || c._id;
      if (DEFAULT_EXAMPLE_IDS.has(directId) && DEFAULT_EXAMPLE_NAMES.has(c.name)) {
        return false;
      }
      return Boolean(c.name && String(c.name).trim());
    });
  } catch {
    return [];
  }
}

/**
 * Non-destructive migration of local draft campaigns to backend API.
 * Never modifies or deletes the original STORAGE_KEY contents.
 * Creates a backup snapshot and records imported draft IDs upon successful creation.
 * Retries failed drafts and does NOT treat same-name campaigns as identical.
 */
export async function importLocalDraftsToBackend(drafts, existingCampaigns = []) {
  if (!drafts || drafts.length === 0) return { importedCount: 0, failedCount: 0 };
  if (typeof window === 'undefined' || !window.localStorage) return { importedCount: 0, failedCount: 0 };

  // 1. Take recoverable snapshot before performing migration
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && !window.localStorage.getItem(BACKUP_STORAGE_KEY)) {
      window.localStorage.setItem(BACKUP_STORAGE_KEY, raw);
    }
  } catch {
    // Ignore storage quota errors
  }

  // Ensure every draft in the batch has a distinct stable identifier assigned
  ensureDraftIdentifiers(drafts);

  const importedSet = getImportedDraftIds();

  let importedCount = 0;
  let failedCount = 0;

  for (const draft of drafts) {
    const draftId = getDraftIdentifier(draft);
    const trimmedName = draft.name ? String(draft.name).trim() : '';

    if (!trimmedName) {
      continue;
    }

    if (draftId && importedSet.has(draftId)) {
      continue;
    }

    try {
      const start = draft.startDate
        ? new Date(draft.startDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      let end = draft.endDate
        ? new Date(draft.endDate).toISOString().slice(0, 10)
        : new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10);

      if (new Date(end).getTime() < new Date(start).getTime()) {
        end = start;
      }

      const payload = {
        name: trimmedName,
        startDate: start,
        endDate: end,
        status: ['active', 'upcoming', 'ended'].includes(draft.status) ? draft.status : 'active',
        bannerPlacement: CAMPAIGN_BANNER_PLACEMENTS.includes(draft.bannerPlacement)
          ? draft.bannerPlacement
          : 'hero_carousel',
      };

      if (draft.objective && String(draft.objective).trim()) {
        payload.objective = String(draft.objective).trim();
      }
      if (draft.couponCode && String(draft.couponCode).trim()) {
        payload.couponCode = String(draft.couponCode).trim().toUpperCase();
      }

      await adminCampaignService.createAdminCampaign(payload);
      importedCount++;
      if (draftId) {
        importedSet.add(draftId);
        saveImportedDraftIds(importedSet);
      }
    } catch {
      failedCount++;
    }
  }

  return { importedCount, failedCount };
}

function formatDisplayDate(val) {
  if (!val) return '';
  if (typeof val === 'string' && val.length >= 10) return val.slice(0, 10);
  try {
    return new Date(val).toISOString().slice(0, 10);
  } catch {
    return String(val);
  }
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState(null);
  const [feedbackError, setFeedbackError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionPendingId, setActionPendingId] = useState(null);

  const [localDrafts, setLocalDrafts] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [dismissMigrationBanner, setDismissMigrationBanner] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    objective: '',
    couponCode: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
    status: 'active',
    bannerPlacement: 'hero_carousel',
  });
  const [modalError, setModalError] = useState(null);

  const loadData = useCallback(async (signal) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // 1. Fetch campaigns from the backend API
      const res = await adminCampaignService.getAdminCampaigns({ limit: 50 }, { signal });
      const fetchedCampaigns = res?.campaigns || [];
      setCampaigns(fetchedCampaigns);

      // 2. Fetch available coupons for association dropdown
      try {
        const couponRes = await adminCouponService.getAdminCoupons({ limit: 50 }, { signal });
        setAvailableCoupons(couponRes?.coupons || []);
      } catch {
        // Backend coupon query error is non-fatal for campaigns view
      }

      // 3. Check for any unimported local user drafts
      const drafts = getLocalDraftCampaigns();
      setLocalDrafts(drafts);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setLoadError(err?.message || 'Failed to retrieve campaigns from the server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    queueMicrotask(() => {
      if (!ignore) {
        loadData(controller.signal);
      }
    });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [loadData]);

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setModalError('Campaign name is required.');
      return;
    }

    if (trimmedName.length < 2) {
      setModalError('Campaign name must contain at least 2 characters.');
      return;
    }

    if (!formData.startDate) {
      setModalError('Start date is required.');
      return;
    }

    if (!formData.endDate) {
      setModalError('End date is required.');
      return;
    }

    if (new Date(formData.endDate).getTime() < new Date(formData.startDate).getTime()) {
      setModalError('End date must be at or after start date.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    setFeedbackError(null);

    try {
      const payload = {
        name: trimmedName,
        startDate: formData.startDate,
        endDate: formData.endDate,
        status: formData.status || 'active',
        bannerPlacement: formData.bannerPlacement || 'hero_carousel',
      };

      if (formData.objective?.trim()) {
        payload.objective = formData.objective.trim();
      }

      if (formData.couponCode?.trim()) {
        payload.couponCode = formData.couponCode.trim().toUpperCase();
      }

      const created = await adminCampaignService.createAdminCampaign(payload);
      setCampaigns((prev) => [created, ...prev]);
      setIsModalOpen(false);
      setFeedbackMessage(`Campaign '${created.name}' scheduled successfully.`);
    } catch (err) {
      setModalError(err?.message || 'Failed to schedule campaign on the server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (camp) => {
    const targetId = camp._id || camp.id;
    if (!targetId || actionPendingId === targetId) return;

    const nextStatus = camp.status === 'active' ? 'ended' : 'active';
    setActionPendingId(targetId);
    setFeedbackError(null);

    try {
      const updated = await adminCampaignService.updateAdminCampaignStatus(targetId, nextStatus);
      setCampaigns((prev) =>
        prev.map((c) => ((c._id || c.id) === targetId ? { ...c, status: updated?.status || nextStatus } : c))
      );
      setFeedbackMessage(
        `Campaign '${camp.name}' status set to ${nextStatus.toUpperCase()}.`
      );
    } catch (err) {
      setFeedbackError(err?.message || `Failed to update status for '${camp.name}'.`);
    } finally {
      setActionPendingId(null);
    }
  };

  const handleDeleteCampaign = async (camp) => {
    const targetId = camp._id || camp.id;
    if (!targetId || actionPendingId === targetId) return;

    if (!window.confirm(`Delete promotional campaign '${camp.name}'?`)) return;

    setActionPendingId(targetId);
    setFeedbackError(null);

    try {
      await adminCampaignService.deleteAdminCampaign(targetId);
      setCampaigns((prev) => prev.filter((c) => (c._id || c.id) !== targetId));
      setFeedbackMessage(`Campaign '${camp.name}' deleted successfully.`);
    } catch (err) {
      setFeedbackError(err?.message || `Failed to delete campaign '${camp.name}'.`);
    } finally {
      setActionPendingId(null);
    }
  };

  const handleImportDrafts = async () => {
    if (isImporting || localDrafts.length === 0) return;
    setIsImporting(true);
    setFeedbackError(null);
    setFeedbackMessage(null);

    try {
      const { importedCount, failedCount } = await importLocalDraftsToBackend(localDrafts, campaigns);
      if (importedCount > 0) {
        setFeedbackMessage(
          `Successfully imported ${importedCount} local draft campaign(s) to the central database.`
        );
        // Refresh campaign list
        const res = await adminCampaignService.getAdminCampaigns({ limit: 50 });
        setCampaigns(res?.campaigns || []);
      }
      if (failedCount > 0) {
        setFeedbackError(
          `${failedCount} local draft(s) could not be imported due to validation or server errors.`
        );
      }
      setLocalDrafts(getLocalDraftCampaigns());
    } catch (err) {
      setFeedbackError(err?.message || 'Failed to import local drafts.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <AdminPageHeader
        title="Campaigns & Promotions"
        subtitle="Schedule promotional events, tie discounts to active coupon codes, and coordinate storefront marketing initiatives."
        badge="Marketing"
        actions={
          <button
            type="button"
            onClick={() => {
              setFormData({
                name: '',
                objective: '',
                couponCode: availableCoupons[0]?.code || '',
                startDate: new Date().toISOString().slice(0, 10),
                endDate: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
                status: 'active',
                bannerPlacement: 'hero_carousel',
              });
              setModalError(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#123C32] text-white text-xs sm:text-sm font-bold hover:bg-[#0E332B] transition-colors shadow-xs"
          >
            <svg className="w-4 h-4 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Schedule Campaign
          </button>
        }
      />

      {/* Operation Feedback Notifications */}
      {feedbackMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <span>{feedbackMessage}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 font-bold ml-3"
            aria-label="Dismiss message"
          >
            &times;
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <span>{feedbackError}</span>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="text-rose-600 hover:text-rose-800 font-bold ml-3"
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {/* Non-destructive Local Storage User Draft Migration Banner */}
      {!dismissMigrationBanner && localDrafts.length > 0 && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-0.5">
              <span className="font-bold block">Local Campaign Drafts Detected</span>
              <span>
                Found {localDrafts.length} preview campaign draft(s) saved in this browser. You can import them to the central database to synchronize across administrators.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isImporting}
              onClick={handleImportDrafts}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-2xs"
            >
              {isImporting ? 'Importing...' : 'Import to Central Database'}
            </button>
            <button
              type="button"
              onClick={() => setDismissMigrationBanner(true)}
              className="px-2.5 py-1.5 text-blue-700 hover:text-blue-900 font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Loading, Error, Empty, or Campaign Grid */}
      {isLoading ? (
        <AdminLoadingState
          title="Loading scheduled campaigns..."
          subtitle="Fetching marketing timeline from central API..."
        />
      ) : loadError ? (
        <AdminErrorState
          title="Failed to load campaigns"
          message={loadError}
          onRetry={() => loadData()}
        />
      ) : campaigns.length === 0 ? (
        <AdminEmptyState
          title="No campaigns scheduled"
          description="No active or upcoming marketing campaigns are recorded."
          actionLabel="Schedule Campaign"
          onAction={() => setIsModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {campaigns.map((camp) => {
            const campKey = camp._id || camp.id;
            const isPending = actionPendingId === campKey;

            return (
              <div
                key={campKey}
                className="bg-white rounded-2xl border border-[#E4E8E5] p-5 sm:p-6 shadow-2xs space-y-4 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          camp.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : camp.status === 'upcoming'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {String(camp.status || 'draft').toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {formatDisplayDate(camp.startDate)} &rarr; {formatDisplayDate(camp.endDate)}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">{camp.name}</h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleToggleStatus(camp)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-50 rounded-lg hover:bg-slate-100 transition-colors text-xs font-semibold"
                      title="Toggle active status"
                    >
                      {camp.status === 'active' ? 'End' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDeleteCampaign(camp)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 disabled:opacity-50 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Delete campaign"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {camp.objective && (
                  <p className="text-xs text-slate-500 leading-relaxed bg-[#F7F6F1] p-3 rounded-xl border border-[#E4E8E5]">
                    {camp.objective}
                  </p>
                )}

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Coupon:</span>
                    {camp.couponCode ? (
                      <span className="font-mono font-bold text-[#123C32] bg-[#EEF5F1] px-2 py-0.5 rounded-md border border-[#123C32]/10">
                        {camp.couponCode}
                      </span>
                    ) : (
                      <span className="italic text-slate-400">None linked</span>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-400">
                    Placement: {camp.bannerPlacement || 'hero_carousel'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Schedule Campaign Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 animate-slideUp space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Schedule Promotional Campaign</h2>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-lg font-bold"
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold">{modalError}</div>
            )}

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Campaign Name *</label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. End of Season Clearance"
                  className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[#F7F6F1] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Strategic Objective</label>
                <textarea
                  rows={2}
                  disabled={isSubmitting}
                  value={formData.objective}
                  onChange={(e) => setFormData((p) => ({ ...p, objective: e.target.value }))}
                  placeholder="Describe target customer segment and promotions..."
                  className="w-full px-3.5 py-2 text-xs bg-[#F7F6F1] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Associated Coupon Code</label>
                <select
                  disabled={isSubmitting}
                  value={formData.couponCode}
                  onChange={(e) => setFormData((p) => ({ ...p, couponCode: e.target.value }))}
                  className="w-full px-3.5 py-2 text-xs bg-[#F7F6F1] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20"
                >
                  <option value="">No coupon associated</option>
                  {availableCoupons.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.type === 'percentage' ? `${c.value}% OFF` : `₹${c.value} OFF`})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Start Date *</label>
                  <input
                    type="date"
                    required
                    disabled={isSubmitting}
                    value={formData.startDate}
                    onChange={(e) => setFormData((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full px-3.5 py-2 text-xs bg-[#F7F6F1] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">End Date *</label>
                  <input
                    type="date"
                    required
                    disabled={isSubmitting}
                    value={formData.endDate}
                    onChange={(e) => setFormData((p) => ({ ...p, endDate: e.target.value }))}
                    className="w-full px-3.5 py-2 text-xs bg-[#F7F6F1] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Banner Placement</label>
                  <select
                    disabled={isSubmitting}
                    value={formData.bannerPlacement}
                    onChange={(e) => setFormData((p) => ({ ...p, bannerPlacement: e.target.value }))}
                    className="w-full px-3.5 py-2 text-xs bg-[#F7F6F1] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20"
                  >
                    <option value="hero_carousel">Hero Carousel</option>
                    <option value="category_top">Category Top</option>
                    <option value="promotional_strip">Promotional Strip</option>
                    <option value="storefront_footer">Storefront Footer</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Initial Status</label>
                  <select
                    disabled={isSubmitting}
                    value={formData.status}
                    onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value }))}
                    className="w-full px-3.5 py-2 text-xs bg-[#F7F6F1] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20"
                  >
                    <option value="active">Active</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="ended">Ended</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#123C32] text-white text-xs font-bold hover:bg-[#0E332B] disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Scheduling...' : 'Confirm Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
