import { useContext } from 'react';
import { BrandingContext, resolveLogoUrl } from './branding.context.jsx';

const DEFAULT_BRANDING_FALLBACK = Object.freeze({
  branding: Object.freeze({
    storeName: 'CommerceFlow',
    logoUrl: null,
    logoAlt: 'CommerceFlow Logo',
    hasCustomLogo: false,
    announcementText: '🏕️ Free shipping on orders over $50',
    updatedAt: null,
  }),
  resolvedLogoUrl: null,
  isLoading: false,
  error: null,
  refreshBranding: async () => {},
  updateBranding: () => {},
  resolveLogoUrl,
});

/**
 * Accesses the global branding context.
 * Provides defensive fallback if invoked outside BrandingProvider.
 *
 * @returns {{
 *   branding: { storeName: string, logoUrl: string|null, logoAlt: string, hasCustomLogo: boolean, updatedAt: string|null },
 *   resolvedLogoUrl: string|null,
 *   isLoading: boolean,
 *   error: string|null,
 *   refreshBranding: () => Promise<void>,
 *   updateBranding: (patch: Object) => void,
 *   resolveLogoUrl: (url: string|null) => string|null
 * }}
 */
export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    return DEFAULT_BRANDING_FALLBACK;
  }
  return context;
}

export default useBranding;
