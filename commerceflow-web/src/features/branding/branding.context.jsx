import { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getPublicBranding } from '../admin/adminSettings.service.js';
import { API_BASE_URL } from '../../lib/config.js';

export const BrandingContext = createContext(null);

const DEFAULT_BRANDING = Object.freeze({
  storeName: 'CommerceFlow',
  logoUrl: null,
  logoAlt: 'CommerceFlow Logo',
  hasCustomLogo: false,
  announcementText: '🏕️ Free shipping on orders over $50',
  updatedAt: null,
});

/**
 * Resolves a public logo asset URL.
 * Converts backend relative API endpoints (e.g. /api/v1/settings/logo) into absolute URLs
 * using the configured API origin, while preserving absolute or data URLs.
 *
 * @param {string|null} url
 * @returns {string|null}
 */
export function resolveLogoUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const origin = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  if (trimmed.startsWith('/')) {
    return `${origin}${trimmed}`;
  }
  return `${API_BASE_URL}/${trimmed.replace(/^\/+/, '')}`;
}

export function BrandingProvider({ children, initialBranding = null }) {
  const [branding, setBranding] = useState(() => ({
    ...DEFAULT_BRANDING,
    ...(initialBranding || {}),
  }));
  const [isLoading, setIsLoading] = useState(!initialBranding);
  const [error, setError] = useState(null);

  const refreshBranding = useCallback(async () => {
    try {
      setError(null);
      const data = await getPublicBranding();
      if (data && typeof data === 'object') {
        setBranding({
          storeName: data.storeName || 'CommerceFlow',
          logoUrl: data.logoUrl || null,
          logoAlt: data.logoAlt || 'CommerceFlow Logo',
          hasCustomLogo: Boolean(data.logoUrl),
          announcementText: data.announcementText || '🏕️ Free shipping on orders over $50',
          updatedAt: data.updatedAt || null,
        });
      }
    } catch (err) {
      setError(err?.message || 'Could not load site branding.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateBranding = useCallback((newBranding) => {
    if (!newBranding || typeof newBranding !== 'object') return;
    setBranding((prev) => ({
      ...prev,
      ...newBranding,
      hasCustomLogo: Boolean(newBranding.logoUrl !== undefined ? newBranding.logoUrl : prev.logoUrl),
      announcementText:
        newBranding.announcementText !== undefined
          ? newBranding.announcementText
          : prev.announcementText,
    }));
  }, []);

  useEffect(() => {
    if (!initialBranding) {
      refreshBranding();
    }
  }, [refreshBranding, initialBranding]);

  const value = useMemo(
    () => ({
      branding,
      resolvedLogoUrl: resolveLogoUrl(branding.logoUrl),
      isLoading,
      error,
      refreshBranding,
      updateBranding,
      resolveLogoUrl,
    }),
    [branding, isLoading, error, refreshBranding, updateBranding]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export default BrandingProvider;
