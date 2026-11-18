/* global queueMicrotask, FileReader */
import { useState, useEffect, useCallback, useRef } from 'react';
import { adminSettingsService as defaultSettingsService } from '../../features/admin/adminSettings.service.js';
import { authService as defaultAuthService } from '../../features/auth/auth.service.js';
import { useBranding } from '../../features/branding/useBranding.js';
import { resolveLogoUrl } from '../../features/branding/branding.context.jsx';
import AdminPageHeader from '../../layouts/admin/AdminPageHeader.jsx';
import { AdminLoadingState, AdminErrorState } from '../../layouts/admin/AdminShellStates.jsx';

/**
 * AdminSettingsPage Component
 * Route: /admin/settings
 *
 * Full management surface for global storefront configurations and operational parameters.
 */
export default function AdminSettingsPage({
  settingsService: propSettingsService,
  authService: propAuthService,
  initialTab,
}) {
  const service = propSettingsService || defaultSettingsService;
  const auth = propAuthService || defaultAuthService;
  const { updateBranding } = useBranding();

  const [settings, setSettings] = useState({
    storeName: 'CommerceFlow',
    supportEmail: 'support@commerceflow.com',
    supportPhone: '+91 98765 43210',
    currency: 'INR',
    currencySymbol: '₹',
    freeShippingThreshold: 999,
    standardShippingRate: 99,
    lowStockThreshold: 5,
    returnWindowDays: 14,
    isMaintenanceMode: false,
    codEnabled: true,
    upiEnabled: true,
    announcementText: '🏕️ Free shipping on orders over $50',
    logoUrl: null,
    logoAlt: 'CommerceFlow Logo',
    logoUpdatedAt: null,
  });

  const [systemInfo, setSystemInfo] = useState({
    environment: 'development',
    apiVersion: 'v1',
    databaseStatus: 'connected',
    paymentGateway: 'Razorpay (Configured)',
    rateLimitRequestsPerWindow: 100,
    rateLimitWindowMinutes: 15,
  });

  const getInitialTab = () => {
    if (initialTab) return initialTab;
    if (typeof window !== 'undefined' && window.location?.pathname === '/admin/settings/security') {
      return 'security';
    }
    return 'general';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // Logo management state
  const [stagedFile, setStagedFile] = useState(null);
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState(null);
  const [stagedAltText, setStagedAltText] = useState('CommerceFlow Logo');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isResettingLogo, setIsResettingLogo] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [brandingError, setBrandingError] = useState(null);
  const [brandingSuccess, setBrandingSuccess] = useState(null);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const fileInputRef = useRef(null);

  // Announcement management state
  const [announcementInput, setAnnouncementInput] = useState('🏕️ Free shipping on orders over $50');
  const [announcementError, setAnnouncementError] = useState(null);
  const [announcementSuccess, setAnnouncementSuccess] = useState(null);
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [isResettingAnnouncement, setIsResettingAnnouncement] = useState(false);
  const [showAnnouncementResetModal, setShowAnnouncementResetModal] = useState(false);

  // Security & MFA state
  const [mfaEnabled, setMfaEnabled] = useState(() => {
    if (auth?.user && typeof auth.user.twoFactorEnabled === 'boolean') {
      return auth.user.twoFactorEnabled;
    }
    return true;
  });
  const [adminPassword, setAdminPassword] = useState('');
  const [stepUpMethod, setStepUpMethod] = useState('totp');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isRegeneratingCodes, setIsRegeneratingCodes] = useState(false);
  const [regenError, setRegenError] = useState(null);
  const [regenSuccess, setRegenSuccess] = useState(null);
  const [networkAmbiguityWarning, setNetworkAmbiguityWarning] = useState(false);
  const [transientRecoveryCodes, setTransientRecoveryCodes] = useState(null);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [copyFailedManual, setCopyFailedManual] = useState(false);

  // Enable MFA (Setup) modal state
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [isInitiatingSetup, setIsInitiatingSetup] = useState(false);
  const [setupData, setSetupData] = useState(null);
  const [setupTotpCode, setSetupTotpCode] = useState('');
  const [isActivatingMfa, setIsActivatingMfa] = useState(false);
  const [setupError, setSetupError] = useState(null);

  // Disable MFA modal state
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableStepUpMethod, setDisableStepUpMethod] = useState('totp');
  const [disableTotpCode, setDisableTotpCode] = useState('');
  const [disableRecoveryCode, setDisableRecoveryCode] = useState('');
  const [isDisablingMfa, setIsDisablingMfa] = useState(false);
  const [disableError, setDisableError] = useState(null);
  const [disableSuccess, setDisableSuccess] = useState(null);

  useEffect(() => {
    let isMounted = true;
    if (typeof auth?.getCurrentUser === 'function') {
      auth.getCurrentUser().then((res) => {
        if (isMounted && res?.user) {
          if (typeof res.user.twoFactorEnabled === 'boolean') {
            setMfaEnabled(res.user.twoFactorEnabled);
          }
        }
      }).catch(() => {});
    } else if (auth?.user && typeof auth.user.twoFactorEnabled === 'boolean') {
      setMfaEnabled(auth.user.twoFactorEnabled);
    }
    return () => { isMounted = false; };
  }, [auth]);

  useEffect(() => {
    if (!transientRecoveryCodes || transientRecoveryCodes.length === 0 || codesAcknowledged) {
      return;
    }

    const warningMessage =
      'You have unacknowledged emergency recovery codes. If you leave now, these codes will be discarded and cannot be shown again. Are you sure you want to discard them?';

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    const handlePopState = (e) => {
      const proceed = window.confirm(warningMessage);
      if (!proceed) {
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
      } else {
        setTransientRecoveryCodes(null);
      }
    };

    const handleAnchorClick = (e) => {
      const anchor = e.target?.closest ? e.target.closest('a') : null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      const proceed = window.confirm(warningMessage);
      if (!proceed) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        if (typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
      } else {
        setTransientRecoveryCodes(null);
        if (typeof window !== 'undefined' && window.history?.pushState) {
          window.history.pushState(null, '', href);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState, true);
    document.addEventListener('click', handleAnchorClick, true);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState, true);
      document.removeEventListener('click', handleAnchorClick, true);
    };
  }, [transientRecoveryCodes, codesAcknowledged]);

  const handleCopyRecoveryCodes = async () => {
    if (!transientRecoveryCodes || transientRecoveryCodes.length === 0) return;
    const textToCopy = transientRecoveryCodes.join('\n');
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyFeedback('✓ Copied All Codes!');
      setCopyFailedManual(false);
      setTimeout(() => setCopyFeedback(null), 3000);
    } catch {
      setCopyFailedManual(true);
      setCopyFeedback(null);
    }
  };

  const handleDismissRecoveryCodes = () => {
    if (!codesAcknowledged) return;
    setTransientRecoveryCodes(null);
    setCodesAcknowledged(false);
    setRegenSuccess('New recovery codes successfully generated and saved.');
  };

  const handleRegenerateRecoveryCodes = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setRegenError(null);
    setRegenSuccess(null);
    setNetworkAmbiguityWarning(false);
    setCopyFailedManual(false);

    if (!adminPassword || !adminPassword.trim()) {
      setRegenError('Current administrator password is required.');
      return;
    }

    if (stepUpMethod === 'totp') {
      if (!totpCode || !totpCode.trim()) {
        setRegenError('A 6-digit authenticator code is required.');
        return;
      }
      if (!/^\d{6}$/.test(totpCode.trim())) {
        setRegenError('Please enter a valid 6-digit numeric authenticator code.');
        return;
      }
    } else {
      if (!recoveryCode || !recoveryCode.trim()) {
        setRegenError('Recovery code is required.');
        return;
      }
    }

    setIsRegeneratingCodes(true);

    try {
      const payload = {
        password: adminPassword,
        ...(stepUpMethod === 'totp' ? { totpCode: totpCode.trim() } : { recoveryCode: recoveryCode.trim() }),
      };

      const res = await auth.regenerateAdminMfaRecoveryCodes(payload);
      setTransientRecoveryCodes(res.recoveryCodes || []);
      setCodesAcknowledged(false);
      setAdminPassword('');
      setTotpCode('');
      setRecoveryCode('');
    } catch (err) {
      if (err?.code === 'INVALID_CURRENT_PASSWORD') {
        setRegenError('Incorrect current password. Please verify your credentials and try again.');
      } else if (err?.status === 429 || err?.code === 'AUTH_RATE_LIMIT_EXCEEDED') {
        setRegenError('Too many attempts. Rate limit exceeded. Please wait a few minutes before trying again.');
      } else if (
        err?.status === 401 ||
        err?.code === 'AUTH_TOKEN_EXPIRED' ||
        err?.code === 'INVALID_AUTH_TOKEN' ||
        err?.code === 'AUTH_TOKEN_REVOKED'
      ) {
        setRegenError('Your administrative session has expired or is invalid. Please sign in again.');
      } else if (err?.status === 0 || err?.code === 'NETWORK_ERROR') {
        setNetworkAmbiguityWarning(true);
      } else {
        setRegenError(err?.message || 'Failed to regenerate recovery codes.');
      }
    } finally {
      setIsRegeneratingCodes(false);
    }
  };

  const handleOpenSetupModal = async () => {
    setShowSetupModal(true);
    setSetupError(null);
    setSetupTotpCode('');
    setIsInitiatingSetup(true);
    try {
      const res = await auth.setupAdminMfa();
      setSetupData(res);
    } catch (err) {
      setSetupError(err?.message || 'Failed to initiate MFA setup.');
    } finally {
      setIsInitiatingSetup(false);
    }
  };

  const handleConfirmActivateMfa = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!setupTotpCode.trim() || !/^\d{6}$/.test(setupTotpCode.trim())) {
      setSetupError('Please enter a valid 6-digit numeric authenticator code.');
      return;
    }

    setIsActivatingMfa(true);
    setSetupError(null);

    try {
      const res = await auth.activateAdminMfa({ totpCode: setupTotpCode.trim() });
      setMfaEnabled(true);
      setShowSetupModal(false);
      setSetupData(null);
      setSetupTotpCode('');
      if (res?.recoveryCodes && res.recoveryCodes.length > 0) {
        setTransientRecoveryCodes(res.recoveryCodes);
        setCodesAcknowledged(false);
      } else {
        setRegenSuccess('Two-step verification successfully activated.');
      }
    } catch (err) {
      setSetupError(err?.message || 'Failed to activate two-step verification.');
    } finally {
      setIsActivatingMfa(false);
    }
  };

  const handleOpenDisableModal = () => {
    setShowDisableModal(true);
    setDisableError(null);
    setDisablePassword('');
    setDisableTotpCode('');
    setDisableRecoveryCode('');
    setDisableStepUpMethod('totp');
  };

  const handleConfirmDisableMfa = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setDisableError(null);

    if (!disablePassword.trim()) {
      setDisableError('Current administrator password is required.');
      return;
    }

    if (disableStepUpMethod === 'totp') {
      if (!disableTotpCode.trim() || !/^\d{6}$/.test(disableTotpCode.trim())) {
        setDisableError('Please enter a valid 6-digit numeric authenticator code.');
        return;
      }
    } else {
      if (!disableRecoveryCode.trim()) {
        setDisableError('Recovery code is required.');
        return;
      }
    }

    setIsDisablingMfa(true);

    try {
      const payload = {
        password: disablePassword,
        ...(disableStepUpMethod === 'totp'
          ? { totpCode: disableTotpCode.trim() }
          : { recoveryCode: disableRecoveryCode.trim() }),
      };

      await auth.disableAdminMfa(payload);
      setMfaEnabled(false);
      setShowDisableModal(false);
      setDisableSuccess('Two-step verification has been disabled.');
    } catch (err) {
      if (err?.code === 'INVALID_CURRENT_PASSWORD') {
        setDisableError('Incorrect current password. Please verify your credentials and try again.');
      } else {
        setDisableError(err?.message || 'Failed to disable two-step verification.');
      }
    } finally {
      setIsDisablingMfa(false);
    }
  };

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await service.getStoreSettings();
      if (res.settings && Object.keys(res.settings).length > 0) {
        setSettings((prev) => ({ ...prev, ...res.settings }));
        if (res.settings.announcementText !== undefined) {
          setAnnouncementInput(res.settings.announcementText || '🏕️ Free shipping on orders over $50');
        }
      }
      if (res.systemInfo) {
        setSystemInfo(res.systemInfo);
      }
    } catch (err) {
      if (err?.status === 403) {
        setError('Access denied: You do not have permission to view or manage administrative store settings.');
      } else if (err?.code === 'NETWORK_ERROR' || err?.status === 0) {
        setError('Unable to connect to CommerceFlow API server. Please check your network connection or verify the backend server is running on port 4000.');
      } else {
        setError(err?.message || 'Failed to retrieve store settings.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) {
        loadSettings();
      }
    });
    return () => {
      ignore = true;
    };
  }, [loadSettings]);

  const handleChange = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(null);
    setSaveError(null);

    try {
      const payload = {
        storeName: String(settings.storeName || '').trim(),
        supportEmail: String(settings.supportEmail || '').trim(),
        supportPhone: String(settings.supportPhone || '').trim(),
        currency: String(settings.currency || 'INR').trim().toUpperCase(),
        currencySymbol: String(settings.currencySymbol || '₹').trim(),
        freeShippingThreshold: Number(settings.freeShippingThreshold) || 0,
        standardShippingRate: Number(settings.standardShippingRate) || 0,
        lowStockThreshold: parseInt(settings.lowStockThreshold, 10) || 5,
        returnWindowDays: parseInt(settings.returnWindowDays, 10) || 14,
        isMaintenanceMode: Boolean(settings.isMaintenanceMode),
        codEnabled: Boolean(settings.codEnabled !== false),
        upiEnabled: Boolean(settings.upiEnabled !== false),
        announcementText: String(settings.announcementText || announcementInput || '🏕️ Free shipping on orders over $50').trim(),
      };

      const res = await service.updateStoreSettings(payload);
      if (res.settings) {
        setSettings((prev) => ({ ...prev, ...res.settings }));
        if (res.settings.announcementText !== undefined) {
          setAnnouncementInput(res.settings.announcementText || '🏕️ Free shipping on orders over $50');
          updateBranding({ announcementText: res.settings.announcementText || '🏕️ Free shipping on orders over $50' });
        }
      }
      setSaveSuccess('Store settings successfully updated and persisted.');
    } catch (err) {
      setSaveError(err?.message || 'Failed to save store configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidateAndStageFile = (file) => {
    setBrandingError(null);
    setBrandingSuccess(null);

    if (!file) return;

    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
    const fileName = file.name ? file.name.toLowerCase() : '';
    const hasValidExt = allowedExtensions.some((ext) => fileName.endsWith(ext));
    const hasValidMime = allowedMimeTypes.includes(file.type?.toLowerCase());

    if (!hasValidExt && !hasValidMime) {
      setBrandingError('Unsupported file type. Please upload a PNG, JPEG, WebP, or clean SVG image file.');
      return;
    }

    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setBrandingError(`File size exceeds 2 MB limit (selected file is ${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      return;
    }

    if (typeof FileReader === 'undefined') {
      setBrandingError('File preview is not supported in this environment.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setStagedPreviewUrl(e.target.result);
      setStagedFile(file);
      if (!stagedAltText || stagedAltText === 'CommerceFlow Logo') {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setStagedAltText(`${cleanName} Logo`);
      }
    };
    reader.onerror = () => {
      setBrandingError('Failed to read the selected file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleValidateAndStageFile(files[0]);
    }
  };

  const handleDiscardStagedLogo = () => {
    setStagedFile(null);
    setStagedPreviewUrl(null);
    setBrandingError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveLogo = async () => {
    if (!stagedPreviewUrl) {
      setBrandingError('Please select a logo file before saving.');
      return;
    }

    setIsUploadingLogo(true);
    setBrandingError(null);
    setBrandingSuccess(null);

    try {
      const res = await service.uploadLogo({
        image: stagedPreviewUrl,
        altText: stagedAltText?.trim() || 'CommerceFlow Logo',
      });

      setSettings((prev) => ({
        ...prev,
        logoUrl: res.logoUrl,
        logoAlt: res.logoAlt || stagedAltText,
        logoUpdatedAt: res.updatedAt || new Date().toISOString(),
      }));

      updateBranding({
        logoUrl: res.logoUrl,
        logoAlt: res.logoAlt || stagedAltText,
        hasCustomLogo: true,
        updatedAt: res.updatedAt,
      });

      setBrandingSuccess('Website logo successfully updated and published across all headers and navigation.');
      handleDiscardStagedLogo();
    } catch (err) {
      setBrandingError(err?.message || 'Failed to upload and save website logo.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleConfirmResetLogo = async () => {
    setIsResettingLogo(true);
    setBrandingError(null);
    setBrandingSuccess(null);

    try {
      const res = await service.resetLogo();

      setSettings((prev) => ({
        ...prev,
        logoUrl: null,
        logoAlt: 'CommerceFlow Logo',
        logoUpdatedAt: res.updatedAt || new Date().toISOString(),
      }));

      updateBranding({
        logoUrl: null,
        logoAlt: 'CommerceFlow Logo',
        hasCustomLogo: false,
        updatedAt: res.updatedAt,
      });

      setBrandingSuccess('Website logo reset to original default CommerceFlow logo.');
      setShowResetConfirmModal(false);
      handleDiscardStagedLogo();
    } catch (err) {
      setBrandingError(err?.message || 'Failed to reset website logo.');
    } finally {
      setIsResettingLogo(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleValidateAndStageFile(files[0]);
    }
  };

  const handleSaveAnnouncement = async () => {
    const trimmed = announcementInput.trim();
    if (!trimmed) {
      setAnnouncementError('Announcement message cannot be empty.');
      return;
    }
    if (trimmed.length > 200) {
      setAnnouncementError('Announcement message cannot exceed 200 characters.');
      return;
    }

    setIsSavingAnnouncement(true);
    setAnnouncementError(null);
    setAnnouncementSuccess(null);

    try {
      await service.updateStoreSettings({
        announcementText: trimmed,
      });

      setSettings((prev) => ({
        ...prev,
        announcementText: trimmed,
      }));
      setAnnouncementInput(trimmed);

      updateBranding({
        announcementText: trimmed,
      });

      setAnnouncementSuccess('Storefront announcement successfully updated and published across all pages.');
    } catch (err) {
      setAnnouncementError(err?.message || 'Failed to save announcement.');
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const handleConfirmResetAnnouncement = async () => {
    setIsResettingAnnouncement(true);
    setAnnouncementError(null);
    setAnnouncementSuccess(null);

    try {
      const defaultMsg = '🏕️ Free shipping on orders over $50';
      if (typeof service.resetAnnouncement === 'function') {
        await service.resetAnnouncement();
      } else {
        await service.updateStoreSettings({ announcementText: defaultMsg });
      }

      setSettings((prev) => ({
        ...prev,
        announcementText: defaultMsg,
      }));
      setAnnouncementInput(defaultMsg);

      updateBranding({
        announcementText: defaultMsg,
      });

      setAnnouncementSuccess('Storefront announcement reset to default message.');
      setShowAnnouncementResetModal(false);
    } catch (err) {
      setAnnouncementError(err?.message || 'Failed to reset announcement.');
    } finally {
      setIsResettingAnnouncement(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Store Settings"
        subtitle="Global store profile, fulfillment policies, inventory alerts, and system health."
        badge={settings.isMaintenanceMode ? 'Maintenance Active' : 'Store Online'}
      />

      {/* Success Notification */}
      {saveSuccess && (
        <div
          role="status"
          className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border bg-emerald-50 text-emerald-800 border-emerald-200"
        >
          <span>{saveSuccess}</span>
          <button
            type="button"
            onClick={() => setSaveSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Error Notification */}
      {saveError && (
        <div
          role="alert"
          className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border bg-rose-50 text-rose-800 border-rose-200"
        >
          <span>{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="text-rose-700 hover:text-rose-900 font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {isLoading ? (
        <AdminLoadingState title="Loading Settings..." subtitle="Retrieving configuration records." />
      ) : error ? (
        <AdminErrorState
          title="Could not load settings"
          message={error}
          onRetry={loadSettings}
        />
      ) : (
        <div className="space-y-6">
          {/* Settings Tabs */}
          <div className="border-b border-[#D8ECE7] flex items-center gap-2 overflow-x-auto text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'general'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Store Profile
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('branding')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'branding'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Website Branding
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('announcement')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'announcement'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Announcement Bar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('fulfillment')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'fulfillment'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Fulfillment & Returns
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'inventory'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Inventory Alerts
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'payments'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Payment Methods
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'system'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              System Health & Diagnostics
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'security'
                  ? 'border-[#123C32] text-[#123C32]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Security Settings
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {/* General Settings */}
            {activeTab === 'general' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-5 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                  Store Identification & Contact
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="store-name" className="block text-xs font-bold text-slate-700 mb-1">
                      Store Brand Name
                    </label>
                    <input
                      id="store-name"
                      type="text"
                      value={settings.storeName}
                      onChange={(e) => handleChange('storeName', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="support-email" className="block text-xs font-bold text-slate-700 mb-1">
                      Support Email
                    </label>
                    <input
                      id="support-email"
                      type="email"
                      value={settings.supportEmail}
                      onChange={(e) => handleChange('supportEmail', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="support-phone" className="block text-xs font-bold text-slate-700 mb-1">
                      Support Contact Phone
                    </label>
                    <input
                      id="support-phone"
                      type="text"
                      value={settings.supportPhone}
                      onChange={(e) => handleChange('supportPhone', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="currency-code" className="block text-xs font-bold text-slate-700 mb-1">
                        Currency Code
                      </label>
                      <input
                        id="currency-code"
                        type="text"
                        maxLength={3}
                        value={settings.currency}
                        onChange={(e) => handleChange('currency', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl uppercase font-mono focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="currency-symbol" className="block text-xs font-bold text-slate-700 mb-1">
                        Symbol
                      </label>
                      <input
                        id="currency-symbol"
                        type="text"
                        maxLength={5}
                        value={settings.currencySymbol}
                        onChange={(e) => handleChange('currencySymbol', e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Website Branding Tab */}
            {activeTab === 'branding' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-6 shadow-2xs">
                {/* Section Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Website Branding & Logo Management
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Upload and manage the official brand logo displayed across the storefront header, navigation, footer, and administrative console.
                    </p>
                  </div>
                  <div>
                    {settings.logoUrl ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active Custom Logo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        Default Mountain Logo
                      </span>
                    )}
                  </div>
                </div>

                {/* Dedicated Branding Success Notification */}
                {brandingSuccess && (
                  <div
                    role="status"
                    className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border bg-emerald-50 text-emerald-800 border-emerald-200"
                  >
                    <span>{brandingSuccess}</span>
                    <button
                      type="button"
                      onClick={() => setBrandingSuccess(null)}
                      className="text-emerald-700 hover:text-emerald-900 font-bold ml-4 cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Dedicated Branding Error Notification */}
                {brandingError && (
                  <div
                    role="alert"
                    className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border bg-rose-50 text-rose-800 border-rose-200"
                  >
                    <span>{brandingError}</span>
                    <button
                      type="button"
                      onClick={() => setBrandingError(null)}
                      className="text-rose-700 hover:text-rose-900 font-bold ml-4 cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Current Published Logo + File Upload Dropzone */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Current Active Logo Box */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Current Published Logo
                    </h4>
                    <div className="p-6 rounded-2xl bg-[#F7F9F8] border border-[#E4E8E5] min-h-[160px] flex flex-col justify-center items-center text-center">
                      {settings.logoUrl ? (
                        <div className="space-y-3 flex flex-col items-center">
                          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                            <img
                              src={resolveLogoUrl(settings.logoUrl)}
                              alt={settings.logoAlt || 'Active Website Logo'}
                              className="h-12 w-auto max-w-[200px] object-contain"
                            />
                          </div>
                          <div className="text-[11px] text-slate-500 space-y-0.5">
                            <p className="font-semibold text-slate-700">{settings.logoAlt || 'CommerceFlow Logo'}</p>
                            <p className="font-mono text-[10px] text-slate-400">Custom Uploaded Brand Asset</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 flex flex-col items-center">
                          <div className="h-12 w-12 rounded-xl bg-[#123C32] flex items-center justify-center text-white shadow-xs">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 18l5-9 4 7 2-4 5 6H3z" />
                            </svg>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <p className="font-semibold text-slate-700">CommerceFlow Mountain Logo</p>
                            <p className="text-[10px] text-slate-400">Default brand mark active across all storefront pages</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* File Upload / Drag & Drop Zone */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Upload New Logo
                    </h4>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-6 min-h-[160px] flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                        isDraggingOver
                          ? 'border-[#123C32] bg-[#EEF5F1]'
                          : 'border-slate-300 hover:border-[#123C32]/60 bg-slate-50/50 hover:bg-slate-50'
                      }`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      aria-label="Upload logo file dropzone. Click or drag and drop an image file here."
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="logo-file-input"
                      />
                      <div className="w-10 h-10 rounded-xl bg-[#123C32]/10 text-[#123C32] flex items-center justify-center mb-2">
                        <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                      </div>
                      <p className="text-xs font-bold text-slate-800">
                        Click to browse <span className="font-normal text-slate-500">or drag and drop</span>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        PNG, JPEG, WebP, or clean SVG (up to 2 MB)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Staged Unsaved Preview Banner (Appears when a new file is chosen) */}
                {stagedPreviewUrl && (
                  <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-300/80 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-900">
                          Unsaved Preview
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {stagedFile?.name || 'Selected Logo File'}
                        </span>
                        {stagedFile?.size && (
                          <span className="text-[11px] text-slate-500">
                            ({(stagedFile.size / 1024).toFixed(1)} KB)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-amber-800 font-medium">
                        Changes will not take effect until you click Save Changes.
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                      {/* Unsaved Preview Image */}
                      <div className="p-4 bg-white rounded-xl border border-amber-200/80 flex items-center justify-center">
                        <img
                          src={stagedPreviewUrl}
                          alt={stagedAltText || 'Unsaved Preview Logo'}
                          className="h-12 w-auto max-w-[180px] object-contain"
                        />
                      </div>

                      {/* Alt text configuration */}
                      <div className="md:col-span-2 space-y-1">
                        <label htmlFor="staged-alt-text" className="block text-xs font-bold text-slate-700">
                          Logo Alternative Text (Accessibility)
                        </label>
                        <input
                          id="staged-alt-text"
                          type="text"
                          value={stagedAltText}
                          onChange={(e) => setStagedAltText(e.target.value)}
                          placeholder="e.g. CommerceFlow Mountain Gear"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                          maxLength={100}
                        />
                        <p className="text-[10px] text-slate-500">
                          Descriptive text read by screen readers when viewing the website logo.
                        </p>
                      </div>
                    </div>

                    {/* Staged Action Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleDiscardStagedLogo}
                        disabled={isUploadingLogo}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Replace File
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveLogo}
                        disabled={isUploadingLogo}
                        className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#123C32] text-white hover:bg-[#0E332B] transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        {isUploadingLogo ? 'Saving Logo...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Reset to Default Logo Section */}
                {settings.logoUrl && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Restore Default Logo</span>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Remove the custom uploaded logo and restore the original CommerceFlow mountain brand mark across the storefront and admin.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowResetConfirmModal(true)}
                      disabled={isResettingLogo || isUploadingLogo}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      Reset to Default Logo
                    </button>
                  </div>
                )}

                {/* Explicit Confirmation Modal for Resetting Logo */}
                {showResetConfirmModal && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="reset-modal-title"
                  >
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                        <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                      </div>
                      <div>
                        <h4 id="reset-modal-title" className="text-sm font-bold text-slate-900">
                          Reset Website Logo to Default?
                        </h4>
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                          Are you sure you want to reset the website logo? This will remove the custom branding asset and restore the original CommerceFlow mountain logo across all storefront and administrative headers.
                        </p>
                        <p className="text-[11px] text-slate-400 mt-2">
                          Note: This action does not delete products, campaigns, or customer orders.
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowResetConfirmModal(false)}
                          disabled={isResettingLogo}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmResetLogo}
                          disabled={isResettingLogo}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                          {isResettingLogo ? 'Resetting...' : 'Confirm Reset'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Storefront Announcement Bar Tab */}
            {activeTab === 'announcement' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-6 shadow-2xs">
                {/* Section Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Storefront Announcement Bar
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure the notification banner displayed at the very top of all public storefront pages.
                    </p>
                  </div>
                  <div>
                    {announcementInput.trim() === '🏕️ Free shipping on orders over $50' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        Default Announcement
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Custom Active Announcement
                      </span>
                    )}
                  </div>
                </div>

                {/* Announcement Success Alert */}
                {announcementSuccess && (
                  <div
                    role="status"
                    className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border bg-emerald-50 text-emerald-800 border-emerald-200"
                  >
                    <span>{announcementSuccess}</span>
                    <button
                      type="button"
                      onClick={() => setAnnouncementSuccess(null)}
                      className="text-emerald-700 hover:text-emerald-900 font-bold ml-4 cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Announcement Error Alert */}
                {announcementError && (
                  <div
                    role="alert"
                    className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between border bg-rose-50 text-rose-800 border-rose-200"
                  >
                    <span>{announcementError}</span>
                    <button
                      type="button"
                      onClick={() => setAnnouncementError(null)}
                      className="text-rose-700 hover:text-rose-900 font-bold ml-4 cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Live Storefront Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Live Storefront Preview
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Matches public header utility bar
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-900/5 border border-slate-200/80">
                    <div className="bg-[#0E332B] text-[#EEF5F1] text-xs py-2.5 px-4 rounded-xl border border-[#123C32] shadow-sm">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-[11px] sm:text-xs tracking-wide truncate">
                            {announcementInput.trim() || '🏕️ Free shipping on orders over $50'}
                          </span>
                        </div>
                        <div className="hidden sm:flex items-center gap-4 text-[11px] text-[#d5e8dd] shrink-0 opacity-75">
                          <span>Track Order</span>
                          <span>|</span>
                          <span>Help</span>
                          <span>|</span>
                          <span>Contact</span>
                          <span className="hidden md:inline">|</span>
                          <span className="hidden md:inline font-semibold text-white">USD / EN</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Editable Announcement Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="announcement-input" className="block text-xs font-bold text-slate-700">
                      Announcement Message
                    </label>
                    <span
                      className={`text-[11px] font-mono ${
                        announcementInput.length > 200 ? 'text-rose-600 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {announcementInput.length} / 200 characters
                    </span>
                  </div>
                  <textarea
                    id="announcement-input"
                    rows={3}
                    maxLength={200}
                    value={announcementInput}
                    onChange={(e) => {
                      setAnnouncementInput(e.target.value);
                      if (announcementError) setAnnouncementError(null);
                    }}
                    placeholder="e.g. 🏕️ Free shipping on orders over $50"
                    className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32] leading-relaxed resize-none"
                  />
                  <p className="text-[11px] text-slate-500">
                    Emojis are fully supported (e.g. 🏕️, 🎉, ⚡, 🚚, 📦). Use this bar for promotional campaigns, store notices, or delivery deadlines.
                  </p>
                </div>

                {/* Action Controls */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveAnnouncement}
                      disabled={
                        isSavingAnnouncement ||
                        isResettingAnnouncement ||
                        !announcementInput.trim() ||
                        announcementInput.length > 200
                      }
                      className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#123C32] text-white hover:bg-[#0E332B] transition-colors shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                      {isSavingAnnouncement ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>Saving Announcement...</span>
                        </>
                      ) : (
                        <span>Save Announcement</span>
                      )}
                    </button>
                    {announcementInput !== (settings.announcementText || '🏕️ Free shipping on orders over $50') && (
                      <button
                        type="button"
                        onClick={() => {
                          setAnnouncementInput(settings.announcementText || '🏕️ Free shipping on orders over $50');
                          setAnnouncementError(null);
                        }}
                        disabled={isSavingAnnouncement || isResettingAnnouncement}
                        className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        Discard Changes
                      </button>
                    )}
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAnnouncementResetModal(true)}
                      disabled={isSavingAnnouncement || isResettingAnnouncement}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Reset to Default Message
                    </button>
                  </div>
                </div>

                {/* Reset Confirmation Modal */}
                {showAnnouncementResetModal && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="reset-announcement-modal-title"
                  >
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                        <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                      </div>
                      <div>
                        <h4 id="reset-announcement-modal-title" className="text-sm font-bold text-slate-900">
                          Reset Announcement to Default?
                        </h4>
                        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                          Are you sure you want to restore the default announcement? This will replace your custom message with the default: <span className="font-semibold text-slate-800">"🏕️ Free shipping on orders over $50"</span>.
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAnnouncementResetModal(false)}
                          disabled={isResettingAnnouncement}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmResetAnnouncement}
                          disabled={isResettingAnnouncement}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                          {isResettingAnnouncement ? 'Resetting...' : 'Confirm Reset'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fulfillment Settings */}
            {activeTab === 'fulfillment' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-5 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                  Shipping Rates & Customer Return Window
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="free-shipping-threshold" className="block text-xs font-bold text-slate-700 mb-1">
                      Free Shipping Threshold ({settings.currencySymbol})
                    </label>
                    <input
                      id="free-shipping-threshold"
                      type="number"
                      min="0"
                      value={settings.freeShippingThreshold}
                      onChange={(e) => handleChange('freeShippingThreshold', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                    <div className="text-[11px] text-slate-400 mt-1">Orders above this qualify for free delivery</div>
                  </div>

                  <div>
                    <label htmlFor="standard-shipping-rate" className="block text-xs font-bold text-slate-700 mb-1">
                      Standard Shipping Fee ({settings.currencySymbol})
                    </label>
                    <input
                      id="standard-shipping-rate"
                      type="number"
                      min="0"
                      value={settings.standardShippingRate}
                      onChange={(e) => handleChange('standardShippingRate', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                    <div className="text-[11px] text-slate-400 mt-1">Base rate for regular orders</div>
                  </div>

                  <div>
                    <label htmlFor="return-window" className="block text-xs font-bold text-slate-700 mb-1">
                      Return Window (Days)
                    </label>
                    <input
                      id="return-window"
                      type="number"
                      min="1"
                      max="90"
                      value={settings.returnWindowDays}
                      onChange={(e) => handleChange('returnWindowDays', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                    <div className="text-[11px] text-slate-400 mt-1">Eligible period for RMA returns</div>
                  </div>
                </div>
              </div>
            )}

            {/* Inventory Settings */}
            {activeTab === 'inventory' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-5 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
                  Inventory Alerts & Low Stock Threshold
                </h3>

                <div className="max-w-md space-y-4">
                  <div>
                    <label htmlFor="low-stock-threshold" className="block text-xs font-bold text-slate-700 mb-1">
                      Low Stock Threshold (Units)
                    </label>
                    <input
                      id="low-stock-threshold"
                      type="number"
                      min="1"
                      max="100"
                      value={settings.lowStockThreshold}
                      onChange={(e) => handleChange('lowStockThreshold', e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                      required
                    />
                    <div className="text-[11px] text-slate-400 mt-1">
                      Items with stock at or below this count will trigger &quot;Low Stock&quot; dashboard badges and warnings.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* System Health & Diagnostics */}
            {activeTab === 'system' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-6 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    System Health & Operational Status
                  </h3>
                  <a
                    href="/admin/setup"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EEF5F1] text-[#123C32] text-xs font-semibold hover:bg-[#d5e8dd] transition-colors"
                  >
                    Manage Administrators &rarr;
                  </a>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">Storefront Maintenance Mode</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                        Configuration Flag
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Persisted configuration setting. Intended for reverse-proxy, CDN, or maintenance splash gating; does not block customer API endpoints directly.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.isMaintenanceMode}
                      onChange={(e) => handleChange('isMaintenanceMode', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#123C32]" />
                  </label>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Read-Only Infrastructure Status
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <span className="text-slate-400 block text-[11px]">Runtime Environment</span>
                      <span className="font-bold font-mono text-slate-800 capitalize">{systemInfo.environment}</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <span className="text-slate-400 block text-[11px]">Database Connection</span>
                      <span className="font-bold text-emerald-700 capitalize">● {systemInfo.databaseStatus}</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <span className="text-slate-400 block text-[11px]">Payment Gateway</span>
                      <span className="font-bold text-slate-800">{systemInfo.paymentGateway}</span>
                    </div>
                    <div className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <span className="text-slate-400 block text-[11px]">API Version</span>
                      <span className="font-bold font-mono text-slate-800">{systemInfo.apiVersion}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Methods Configuration */}
            {activeTab === 'payments' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-6 shadow-2xs">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    Storefront Payment Methods
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Enable or disable customer payment options at checkout. Controls are enforced authoritatively by backend order creation and payment gateways.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Cash on Delivery (COD) Control */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-900">Cash on Delivery (COD)</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            settings.codEnabled !== false
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {settings.codEnabled !== false ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
                        Allow customers to pay in cash upon receiving their order. When disabled, COD is hidden from customer checkout and backend orders submitted with COD are rejected.
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={settings.codEnabled !== false}
                        onChange={(e) => handleChange('codEnabled', e.target.checked)}
                        className="sr-only peer"
                        aria-label="Toggle Cash on Delivery"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#123C32]" />
                    </label>
                  </div>

                  {/* UPI Payments Control */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-900">UPI Payments (via Razorpay)</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            settings.upiEnabled !== false
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {settings.upiEnabled !== false ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
                        Allow customers to pay instantly using any UPI application (GPay, PhonePe, Paytm, BHIM). When disabled, the direct UPI option is hidden and direct UPI order initiation is blocked.
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={settings.upiEnabled !== false}
                        onChange={(e) => handleChange('upiEnabled', e.target.checked)}
                        className="sr-only peer"
                        aria-label="Toggle UPI Payments"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#123C32]" />
                    </label>
                  </div>

                  {/* Cards, NetBanking & Wallets (Core Gateway) */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-900">Credit / Debit Cards, NetBanking, Wallets</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-blue-50 text-blue-800 border-blue-200">
                          Always Active
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                        Core online gateway capabilities provided by Razorpay. Always enabled to ensure reliable credit/debit card processing.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Security & MFA Settings */}
            {activeTab === 'security' && (
              <div className="bg-white rounded-2xl border border-[#E4E8E5] p-6 sm:p-8 space-y-6 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Administrator Security & MFA Recovery
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Manage two-step verification and emergency backup credentials for administrative accounts.
                    </p>
                  </div>
                  <div>
                    {mfaEnabled ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        ● MFA Active & Enforced
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        ● Two-Factor Authentication Disabled
                      </span>
                    )}
                  </div>
                </div>

                {/* Notifications */}
                {regenSuccess && (
                  <div role="status" className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <span>{regenSuccess}</span>
                    <button type="button" onClick={() => setRegenSuccess(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-4">&times;</button>
                  </div>
                )}
                {disableSuccess && (
                  <div role="status" className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <span>{disableSuccess}</span>
                    <button type="button" onClick={() => setDisableSuccess(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-4">&times;</button>
                  </div>
                )}
                {regenError && (
                  <div role="alert" className="p-4 rounded-xl text-xs font-semibold flex items-center justify-between bg-rose-50 text-rose-800 border border-rose-200">
                    <span>{regenError}</span>
                    <button type="button" onClick={() => setRegenError(null)} className="text-rose-700 hover:text-rose-900 font-bold ml-4">&times;</button>
                  </div>
                )}

                {/* Network Ambiguity Warning Banner */}
                {networkAmbiguityWarning && (
                  <div role="alert" className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-900 text-xs space-y-2">
                    <div className="font-bold text-sm flex items-center gap-2">
                      ⚠️ Network Ambiguity Warning — Do Not Retry
                    </div>
                    <p>
                      The server did not respond before connection timeout. Old recovery codes may no longer be valid. Do NOT retry automatically. Please refresh the page and verify your account status.
                    </p>
                  </div>
                )}

                {/* Transient Recovery Codes One-Time View */}
                {transientRecoveryCodes && transientRecoveryCodes.length > 0 && (
                  <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-emerald-400">
                          New Emergency Recovery Codes Generated
                        </h4>
                        <p className="text-xs text-slate-300 mt-0.5">
                          All previous recovery codes are now permanently invalidated.
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-800 text-slate-200 border border-slate-700">
                        One-Time Emergency Backup Codes (8)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs text-center py-2">
                      {transientRecoveryCodes.map((code, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-slate-800 text-emerald-300 border border-slate-700 select-all font-bold">
                          {code}
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between pt-3 border-t border-slate-700 gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          id="btn-copy-recovery-codes"
                          onClick={handleCopyRecoveryCodes}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors cursor-pointer"
                        >
                          {copyFeedback || (copyFailedManual ? 'Copy Failed — Copy Manually' : 'Copy All Codes')}
                        </button>
                        {copyFailedManual && (
                          <span className="text-[11px] text-amber-300">
                            Automatic clipboard copy failed. Please select and copy the codes manually.
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            id="ack-recovery-codes"
                            checked={codesAcknowledged}
                            onChange={(e) => setCodesAcknowledged(e.target.checked)}
                            className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-400"
                          />
                          <span>I have safely saved these recovery codes</span>
                        </label>
                        <button
                          type="button"
                          id="btn-dismiss-recovery-codes"
                          disabled={!codesAcknowledged}
                          onClick={handleDismissRecoveryCodes}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* If MFA is Enabled: Regenerate Section & Disable Action */}
                {mfaEnabled ? (
                  <div className="space-y-6">
                    <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-4">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          Regenerate Emergency Recovery Codes
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Generate 8 fresh emergency backup codes. Regenerating codes will immediately invalidate all previously issued backup codes.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label htmlFor="current-password" className="block text-xs font-bold text-slate-700 mb-1">
                            Current Administrator Password
                          </label>
                          <input
                            id="current-password"
                            type="password"
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            placeholder="Enter current password"
                            className="w-full sm:max-w-md px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                          />
                        </div>

                        <div>
                          <span className="block text-xs font-bold text-slate-700 mb-2">Step-Up Verification Method</span>
                          <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                id="step-up-totp"
                                name="stepUpMethod"
                                value="totp"
                                checked={stepUpMethod === 'totp'}
                                onChange={() => setStepUpMethod('totp')}
                              />
                              <span>Authenticator App (TOTP)</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                id="step-up-recovery"
                                name="stepUpMethod"
                                value="recovery"
                                checked={stepUpMethod === 'recovery'}
                                onChange={() => setStepUpMethod('recovery')}
                              />
                              <span>Existing Recovery Code</span>
                            </label>
                          </div>
                        </div>

                        {stepUpMethod === 'totp' ? (
                          <div>
                            <label htmlFor="totp-code" className="block text-xs font-bold text-slate-700 mb-1">
                              6-Digit Authenticator Code
                            </label>
                            <input
                              id="totp-code"
                              name="totpCode"
                              type="text"
                              maxLength={6}
                              value={totpCode}
                              onChange={(e) => setTotpCode(e.target.value)}
                              placeholder="123456"
                              className="w-full sm:max-w-xs px-3 py-2 text-xs font-mono tracking-widest bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                            />
                          </div>
                        ) : (
                          <div>
                            <label htmlFor="recovery-code" className="block text-xs font-bold text-slate-700 mb-1">
                              Existing Unused Recovery Code
                            </label>
                            <input
                              id="recovery-code"
                              name="recoveryCode"
                              type="text"
                              value={recoveryCode}
                              onChange={(e) => setRecoveryCode(e.target.value)}
                              placeholder="2345-6789-ABCD-EFGH"
                              className="w-full sm:max-w-md px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                            />
                          </div>
                        )}

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={handleRegenerateRecoveryCodes}
                            disabled={isRegeneratingCodes}
                            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#123C32] text-white hover:bg-[#0E332B] disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                          >
                            {isRegeneratingCodes ? 'Verifying & Regenerating...' : 'Regenerate Recovery Codes'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Disable MFA Danger Section */}
                    <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                          Disable Two-Step Verification
                        </h4>
                        <p className="text-xs text-rose-700 mt-0.5">
                          Disabling two-step verification reduces account protection. You will be able to sign in using only your password.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenDisableModal}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 transition-colors shrink-0 cursor-pointer"
                      >
                        Disable Two-Step Verification
                      </button>
                    </div>
                  </div>
                ) : (
                  /* If MFA is Disabled: Enable MFA Section */
                  <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Protect Your Administrative Account
                      </h4>
                      <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
                        Two-step verification adds an extra layer of security. In addition to your password, you will be required to provide a 6-digit verification code from your authenticator app (such as Google Authenticator) every time you sign in.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenSetupModal}
                      className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#123C32] text-white hover:bg-[#0E332B] transition-colors shadow-xs cursor-pointer"
                    >
                      Enable Two-Step Verification
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Save Buttons Bar */}
            {activeTab !== 'branding' && activeTab !== 'security' && (
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={loadSettings}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#123C32] text-white hover:bg-[#0E332B] transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Saving Settings...' : 'Save Settings'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Enable MFA Setup Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Setup Two-Step Verification
              </h3>
              <button
                type="button"
                onClick={() => { setShowSetupModal(false); setSetupData(null); }}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                &times;
              </button>
            </div>

            {setupError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-800 text-xs font-semibold">
                {setupError}
              </div>
            )}

            {isInitiatingSetup ? (
              <div className="py-8 text-center text-xs text-slate-500 font-medium">
                Generating authenticator key...
              </div>
            ) : setupData ? (
              <div className="space-y-4 text-xs">
                <div>
                  <span className="font-bold text-slate-700 block mb-1">1. Add to Authenticator App</span>
                  <p className="text-slate-500 mb-2">
                    Enter the secret key below into your authenticator app (Google Authenticator, Authy, 1Password):
                  </p>
                  <div className="p-3 rounded-xl bg-slate-100 font-mono text-center font-bold tracking-widest text-slate-800 select-all border border-slate-200">
                    {setupData.secret}
                  </div>
                </div>

                <div>
                  <label htmlFor="setup-totp-code" className="font-bold text-slate-700 block mb-1">
                    2. Enter 6-Digit Verification Code
                  </label>
                  <input
                    id="setup-totp-code"
                    name="setupTotpCode"
                    type="text"
                    maxLength={6}
                    value={setupTotpCode}
                    onChange={(e) => setSetupTotpCode(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3 py-2 text-xs font-mono tracking-widest text-center bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123C32]/20 focus:border-[#123C32]"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => { setShowSetupModal(false); setSetupData(null); }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmActivateMfa}
                    disabled={isActivatingMfa}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#123C32] text-white hover:bg-[#0E332B] disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                  >
                    {isActivatingMfa ? 'Verifying...' : 'Verify & Activate'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Disable MFA Confirmation Modal */}
      {showDisableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-rose-900">
                Disable Two-Step Verification
              </h3>
              <button
                type="button"
                onClick={() => setShowDisableModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Please enter your current administrator password and your second factor to confirm disabling two-step verification.
            </p>

            {disableError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-800 text-xs font-semibold">
                {disableError}
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div>
                <label htmlFor="disable-password" className="block font-bold text-slate-700 mb-1">
                  Current Administrator Password
                </label>
                <input
                  id="disable-password"
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                />
              </div>

              <div>
                <span className="block font-bold text-slate-700 mb-1">Second Factor Verification</span>
                <div className="flex items-center gap-4 text-xs font-semibold text-slate-700 mb-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="disableStepUp"
                      value="totp"
                      checked={disableStepUpMethod === 'totp'}
                      onChange={() => setDisableStepUpMethod('totp')}
                    />
                    <span>Authenticator (TOTP)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="disableStepUp"
                      value="recovery"
                      checked={disableStepUpMethod === 'recovery'}
                      onChange={() => setDisableStepUpMethod('recovery')}
                    />
                    <span>Recovery Code</span>
                  </label>
                </div>

                {disableStepUpMethod === 'totp' ? (
                  <input
                    type="text"
                    maxLength={6}
                    value={disableTotpCode}
                    onChange={(e) => setDisableTotpCode(e.target.value)}
                    placeholder="6-digit authenticator code"
                    className="w-full px-3 py-2 text-xs font-mono tracking-widest bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                  />
                ) : (
                  <input
                    type="text"
                    value={disableRecoveryCode}
                    onChange={(e) => setDisableRecoveryCode(e.target.value)}
                    placeholder="Emergency recovery code"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDisableModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDisableMfa}
                  disabled={isDisablingMfa}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                >
                  {isDisablingMfa ? 'Disabling...' : 'Confirm & Disable MFA'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
