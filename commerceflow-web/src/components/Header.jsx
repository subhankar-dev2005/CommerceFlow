import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../features/auth/useAuth.js';
import { useCart } from '../features/cart/useCart.js';
import { useWishlist } from '../features/wishlist/useWishlist.js';
import { useCategories } from '../features/products/useCategories.js';
import SearchInput from './SearchInput.jsx';

/* ─── Logo Mark ─────────────────────────────────────────────────────────── */
function BrandLogo() {
  return (
    <a
      href="/"
      className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32] rounded-lg shrink-0 group"
      aria-label="CommerceFlow — Gear Up for Better Days"
    >
      {/* Mountain Icon Mark */}
      <div className="h-10 w-10 rounded-xl bg-[#123C32] flex items-center justify-center shadow-xs group-hover:bg-[#0E332B] transition-colors shrink-0">
        <svg
          className="w-5 h-5 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.2}
            d="M3 18l5-9 4 7 2-4 5 6H3z"
          />
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-xl font-black tracking-tight text-[#17201D] group-hover:text-[#123C32] transition-colors">
          CommerceFlow
        </span>
        <span className="text-[10px] font-semibold text-[#66736D] tracking-wide mt-0.5">
          Gear Up for Better Days
        </span>
      </div>
    </a>
  );
}

/* ─── Cart Icon ──────────────────────────────────────────────────────────── */
function CartIcon({ count = 0 }) {
  return (
    <a
      href="/cart"
      className="relative flex flex-col items-center gap-0.5 text-[#17201D] hover:text-[#123C32] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32] rounded-lg p-1.5 group"
      aria-label={`Shopping cart — ${count} item${count !== 1 ? 's' : ''}`}
    >
      <div className="relative">
        <svg
          className="w-6 h-6 stroke-[1.8] text-[#17201D] group-hover:text-[#123C32] transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
          />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] rounded-full bg-[#F97316] text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none shadow-xs">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      <span className="text-[11px] font-semibold text-[#17201D] group-hover:text-[#123C32] hidden sm:block">
        Cart
      </span>
    </a>
  );
}

/* ─── Wishlist Icon ──────────────────────────────────────────────────────── */
function WishlistIcon({ count = 0 }) {
  return (
    <a
      href="/wishlist"
      className="relative flex flex-col items-center gap-0.5 text-[#17201D] hover:text-[#123C32] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32] rounded-lg p-1.5 group"
      aria-label={`Wishlist — ${count} item${count !== 1 ? 's' : ''}`}
    >
      <div className="relative">
        <svg
          className="w-6 h-6 stroke-[1.8] text-[#17201D] group-hover:text-[#123C32] transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
          />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] rounded-full bg-[#F97316] text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none shadow-xs">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      <span className="text-[11px] font-semibold text-[#17201D] group-hover:text-[#123C32] hidden sm:block">
        Wishlist
      </span>
    </a>
  );
}

/* ─── Account Icon ───────────────────────────────────────────────────────── */
function AccountIcon({ isAuthenticated, user }) {
  return (
    <a
      href={isAuthenticated ? '/account' : '/login'}
      className="flex flex-col items-center gap-0.5 text-[#17201D] hover:text-[#123C32] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32] rounded-lg p-1.5 group"
      aria-label={isAuthenticated ? `My Account — ${user?.name || ''}` : 'Sign in'}
    >
      <svg
        className="w-6 h-6 stroke-[1.8] text-[#17201D] group-hover:text-[#123C32] transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        />
      </svg>
      <span className="text-[11px] font-semibold text-[#17201D] group-hover:text-[#123C32] hidden sm:block">
        {isAuthenticated ? 'Account' : 'Sign In'}
      </span>
    </a>
  );
}

/* ─── Category Nav Item ──────────────────────────────────────────────────── */
function NavItem({ label, href, isActive }) {
  return (
    <a
      href={href}
      className={[
        'px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]',
        isActive
          ? 'text-[#123C32] bg-[#EEF5F1] font-bold'
          : 'text-[#17201D] hover:text-[#123C32] hover:bg-[#F7F6F1]',
      ].join(' ')}
    >
      {label}
    </a>
  );
}

/* ─── Main Header Component ──────────────────────────────────────────────── */
export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerSearchTerm, setHeaderSearchTerm] = useState(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/shop')) {
      return (new window.URLSearchParams(window.location.search).get('search') || '').trim();
    }
    return '';
  });
  const [currentPath, setCurrentPath] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  const { user, isAuthenticated, logout } = useAuth();
  const { totals } = useCart();
  const { wishlist } = useWishlist();
  const { categories } = useCategories();

  const cartCount = totals?.totalQuantity || 0;
  const wishlistCount = wishlist?.totalItems || 0;

  /* Sync active path on SPA navigation */
  useEffect(() => {
    const sync = () => {
      setCurrentPath(window.location.pathname);
      if (window.location.pathname.startsWith('/shop')) {
        const sp = new window.URLSearchParams(window.location.search);
        setHeaderSearchTerm((sp.get('search') || '').trim());
      } else {
        setHeaderSearchTerm('');
      }
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  /* Close mobile menu on Escape */
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mobileMenuOpen]);

  /* Prevent body scroll when mobile menu open */
  useEffect(() => {
    if (typeof document !== 'undefined' && document.body?.style) {
      document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    }
    return () => {
      if (typeof document !== 'undefined' && document.body?.style) {
        document.body.style.overflow = '';
      }
    };
  }, [mobileMenuOpen]);

  const handleSearchSubmit = useCallback((query) => {
    setMobileMenuOpen(false);
    const trimmed = (query || headerSearchTerm || '').trim();
    setHeaderSearchTerm(trimmed);
    const target = trimmed ? `/shop?search=${encodeURIComponent(trimmed)}` : '/shop';
    window.history.pushState({}, '', target);
    window.dispatchEvent(new window.Event('popstate'));
  }, [headerSearchTerm]);

  const navCategories = useMemo(() => {
    const standardCategories = ['Camping', 'Hiking', 'Outdoors'];
    const list = [];
    if (Array.isArray(categories) && categories.length > 0) {
      categories.slice(0, 6).forEach((cat) => {
        if (cat && typeof cat === 'string') {
          list.push({ label: cat, href: `/shop?category=${encodeURIComponent(cat.trim())}` });
        }
      });
    }
    // If fewer than standard categories returned, supplement with standard
    standardCategories.forEach((sc) => {
      if (!list.some((item) => item.label.toLowerCase() === sc.toLowerCase())) {
        list.push({ label: sc, href: `/shop?category=${encodeURIComponent(sc)}` });
      }
    });
    return list;
  }, [categories]);

  const handleLogout = useCallback((e) => {
    e.preventDefault();
    logout();
    setMobileMenuOpen(false);
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new window.Event('popstate'));
  }, [logout]);

  return (
    <>
      {/* ── STICKY MASTER HEADER ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full shadow-xs bg-white">

        {/* ── 1. UTILITY BAR ─────────────────────────────────────────── */}
        <div className="bg-[#0E332B] text-[#EEF5F1] text-xs py-2 border-b border-[#123C32]">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[#aed1bc] text-sm">🏕️</span>
              <span className="font-medium text-[11px] sm:text-xs tracking-wide">
                Free shipping on orders over $50
              </span>
            </div>
            <div className="flex items-center gap-4 sm:gap-6 shrink-0 text-[11px] sm:text-xs text-[#d5e8dd]">
              <a
                href="/account/orders"
                className="hover:text-white transition-colors focus:outline-none focus-visible:underline"
              >
                Track Order
              </a>
              <span className="text-[#17483B]" aria-hidden="true">|</span>
              <a
                href="/#faq"
                className="hover:text-white transition-colors focus:outline-none focus-visible:underline"
              >
                Help
              </a>
              <span className="text-[#17483B]" aria-hidden="true">|</span>
              <a
                href="/#contact"
                className="hover:text-white transition-colors focus:outline-none focus-visible:underline"
              >
                Contact
              </a>
              <span className="text-[#17483B] hidden md:inline" aria-hidden="true">|</span>
              <span className="hidden md:inline font-semibold text-white">
                USD / EN
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. MAIN HEADER ROW ─────────────────────────────────────── */}
        <div className="border-b border-[#E5E9E6]">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4 h-18 sm:h-20">

              {/* Mobile hamburger menu button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 text-[#17201D] hover:bg-[#F7F6F1] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]"
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav-drawer"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                )}
              </button>

              {/* Brand Logo */}
              <BrandLogo />

              {/* Desktop Centered Search Bar */}
              <div className="hidden lg:flex flex-1 max-w-xl mx-8">
                <SearchInput
                  value={headerSearchTerm}
                  onChange={setHeaderSearchTerm}
                  placeholder="Search for products, brands and more..."
                  onSubmit={handleSearchSubmit}
                  size="md"
                  ariaLabel="Search catalog"
                  variant="light"
                />
              </div>

              {/* Right Utility Icons (Account, Wishlist, Cart) */}
              <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                {isAuthenticated && user?.role === 'admin' && (
                  <a
                    href="/admin"
                    className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#123C32] hover:bg-[#0E332B] transition-colors shadow-xs"
                    title="Admin Console"
                  >
                    Admin
                  </a>
                )}
                <AccountIcon isAuthenticated={isAuthenticated} user={user} />
                <WishlistIcon count={wishlistCount} />
                <CartIcon count={cartCount} />
              </div>

            </div>
          </div>
        </div>

        {/* ── 3. CATEGORY NAVIGATION BAR (Desktop) ───────────────────── */}
        <nav
          aria-label="Category navigation"
          className="hidden lg:block bg-white border-b border-[#E5E9E6]"
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 py-2 overflow-x-auto scrollbar-hide">

              {/* All Categories trigger button */}
              <a
                href="/shop"
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-bold text-[#123C32] bg-[#EEF5F1] hover:bg-[#d5e8dd] rounded-lg transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]"
              >
                <svg className="w-4 h-4 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
                All Categories
              </a>

              <span className="text-[#E5E9E6] px-1 font-light" aria-hidden="true">|</span>

              <NavItem label="Home" href="/" isActive={currentPath === '/'} />
              <NavItem label="Shop" href="/shop" isActive={currentPath === '/shop' && !window.location.search} />

              {navCategories.map((item) => (
                <NavItem
                  key={item.href + item.label}
                  label={item.label}
                  href={item.href}
                  isActive={
                    currentPath.startsWith('/shop') &&
                    window.location.search.toLowerCase().includes(encodeURIComponent(item.label.toLowerCase()))
                  }
                />
              ))}

              <NavItem
                label="Brands"
                href="/shop"
                isActive={false}
              />
              <NavItem
                label="Deals"
                href="/shop?sortBy=price&sortOrder=asc"
                isActive={currentPath.startsWith('/shop') && window.location.search.includes('sortOrder=asc')}
              />
            </div>
          </div>
        </nav>

      </header>

      {/* ── MOBILE SEARCH ROW ─────────────────────────────────────────────── */}
      <div className="lg:hidden sticky top-[72px] z-40 bg-[#F7F6F1] px-4 py-2.5 border-b border-[#E5E9E6] shadow-2xs">
        <SearchInput
          value={headerSearchTerm}
          onChange={setHeaderSearchTerm}
          placeholder="Search products, brands and more..."
          onSubmit={handleSearchSubmit}
          size="sm"
          ariaLabel="Search products"
          variant="light"
        />
      </div>

      {/* ── MOBILE SLIDE-OVER DRAWER ───────────────────────────────────────── */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-[#0E332B]/60 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="fixed top-0 left-0 bottom-0 z-50 w-80 bg-white flex flex-col shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E9E6] bg-[#F7F6F1]">
              <BrandLogo />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-[#66736D] hover:text-[#17201D] hover:bg-[#E5E9E6] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]"
                aria-label="Close navigation menu"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-4 py-4 space-y-1" aria-label="Mobile navigation">
              <div className="px-3 py-1.5 text-[11px] font-bold text-[#66736D] uppercase tracking-wider">
                Store Navigation
              </div>

              {[
                { label: 'Home', href: '/' },
                { label: 'Shop All Products', href: '/shop' },
                ...navCategories.map((c) => ({ label: c.label, href: c.href })),
                { label: 'Brands', href: '/shop' },
                { label: 'Deals & Discounts', href: '/shop?sortBy=price&sortOrder=asc' },
              ].map((item) => (
                <a
                  key={item.href + item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-[#17201D] hover:bg-[#EEF5F1] hover:text-[#123C32] rounded-xl transition-colors"
                >
                  {item.label}
                </a>
              ))}

              <div className="pt-4 border-t border-[#E5E9E6] mt-4 space-y-1">
                <div className="px-3 py-1.5 text-[11px] font-bold text-[#66736D] uppercase tracking-wider">
                  Account & Services
                </div>
                <a
                  href="/account"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-[#17201D] hover:bg-[#EEF5F1] hover:text-[#123C32] rounded-xl transition-colors"
                >
                  My Account
                </a>
                <a
                  href="/account/orders"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-[#17201D] hover:bg-[#EEF5F1] hover:text-[#123C32] rounded-xl transition-colors"
                >
                  Track Order
                </a>
                <a
                  href="/wishlist"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-[#17201D] hover:bg-[#EEF5F1] hover:text-[#123C32] rounded-xl transition-colors"
                >
                  <span>My Wishlist</span>
                  {wishlistCount > 0 && (
                    <span className="bg-[#F97316] text-white text-xs font-bold rounded-full px-2 py-0.5">
                      {wishlistCount}
                    </span>
                  )}
                </a>
                <a
                  href="/recently-viewed"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-[#17201D] hover:bg-[#EEF5F1] hover:text-[#123C32] rounded-xl transition-colors"
                >
                  Recently Viewed
                </a>

                {isAuthenticated && user?.role === 'admin' && (
                  <a
                    href="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm font-bold text-[#123C32] bg-[#EEF5F1] rounded-xl transition-colors"
                  >
                    Admin Console
                  </a>
                )}

                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  >
                    Sign Out
                  </button>
                ) : (
                  <a
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm font-bold text-[#123C32] hover:bg-[#EEF5F1] rounded-xl transition-colors"
                  >
                    Sign In / Register
                  </a>
                )}
              </div>
            </nav>

            {/* Bottom info in drawer */}
            <div className="p-4 bg-[#F7F6F1] border-t border-[#E5E9E6] text-xs text-[#66736D]">
              <p className="font-semibold text-[#17201D]">CommerceFlow</p>
              <p className="mt-0.5">Gear Up for Better Days</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
