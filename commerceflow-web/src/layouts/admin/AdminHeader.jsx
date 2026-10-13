import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../features/auth/useAuth.js';
import { getProducts } from '../../features/admin/adminProduct.service.js';
import { formatPrice, navigate } from '../../lib/utils.js';

export default function AdminHeader({ onToggleSidebar }) {
  const { user, logout } = useAuth();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // Theme state persisted in localStorage
  const [theme, setTheme] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem('cf_theme') || 'light';
      }
    } catch {
      void 0;
    }
    return 'light';
  });

  const notificationsRef = useRef(null);
  const userMenuRef = useRef(null);
  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close popovers on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global '/' keyboard shortcut to focus search input
  useEffect(() => {
    function handleKeyDown(e) {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced live product search when query is 2+ characters
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await getProducts({ search: searchQuery.trim(), limit: 4 });
        if (active) {
          setSearchResults(res.products || []);
        }
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Toggle dark/light theme
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('cf_theme', nextTheme);
        if (nextTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    } catch {
      void 0;
    }
  };

  // Format initials and role from real authenticated user
  const displayName = user?.name || 'Sarah Admin';
  const displayEmail = user?.email || 'admin@commerceflow.com';
  const roleLabel = user?.role === 'admin' ? 'Super Admin' : (user?.role || 'Admin');
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'SA';

  // Real notification data source: empty until backend notification stream is wired
  const notifications = [];
  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/admin/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#063B32]/95 backdrop-blur-md border-b border-[#D8ECE7] dark:border-[#1A4538] px-4 sm:px-6 h-16 sm:h-[70px] flex items-center justify-between gap-3 sm:gap-6 shadow-2xs">
      {/* Left: Sidebar Toggle + Global Search UI */}
      <div className="flex items-center gap-3 sm:gap-4 flex-1 max-w-xl">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-[#D1FAE5]/40 dark:hover:bg-[#10352B] rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#059669]"
          aria-label="Toggle navigation sidebar"
        >
          <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        {/* Global Search Input with debounced quick results */}
        <div className="relative flex-1" ref={searchContainerRef}>
          <label htmlFor="admin-global-search" className="sr-only">
            Search products, orders, users
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            ref={searchInputRef}
            id="admin-global-search"
            type="search"
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              if (!val || val.trim().length < 2) {
                setSearchResults([]);
                setIsSearching(false);
              }
            }}
            onFocus={() => setSearchFocused(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search products, orders, customers..."
            className="w-full bg-[#F0FAF7] dark:bg-[#10352B] hover:bg-[#E6F5F0] focus:bg-white dark:focus:bg-[#063B32] text-[#102A2A] dark:text-slate-100 placeholder-[#648096] text-xs sm:text-sm rounded-xl pl-9 pr-10 py-2 border border-[#D8ECE7] dark:border-[#1A4538] focus:outline-none focus:ring-2 focus:ring-[#059669] transition-all"
          />
          <div className="hidden sm:flex absolute inset-y-0 right-0 pr-2.5 items-center pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-[#648096] bg-white dark:bg-[#063B32] border border-[#D8ECE7] dark:border-[#1A4538] rounded-md shadow-2xs">
              /
            </kbd>
          </div>

          {/* Quick Search Preview Dropdown */}
          {searchFocused && searchQuery.trim().length >= 2 && (
            <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#0B2820] rounded-2xl shadow-xl border border-[#E4E8E5] dark:border-[#1A4538] p-3 space-y-2 z-50 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-[#E4E8E5] dark:border-[#1A4538] pb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <span>Matching Products</span>
                {isSearching && <span className="text-emerald-600 font-normal">Searching...</span>}
              </div>

              {isSearching ? (
                <div className="py-4 text-center text-xs text-slate-400">Searching catalog...</div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.map((product) => (
                    <a
                      key={product._id}
                      href="/admin/products"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('/admin/products');
                        setSearchFocused(false);
                      }}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-[#EEF5F1] dark:hover:bg-[#10352B] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt={product.name} className="w-full h-full object-contain p-0.5" />
                          ) : (
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{product.name}</p>
                          <p className="text-[10px] text-slate-400">{product.category}</p>
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-[#123C32] dark:text-emerald-400 shrink-0">
                        {formatPrice(product.price)}
                      </span>
                    </a>
                  ))}
                  <div className="pt-2 border-t border-[#E4E8E5] dark:border-[#1A4538] text-center">
                    <a
                      href={`/admin/products?search=${encodeURIComponent(searchQuery.trim())}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/admin/products?search=${encodeURIComponent(searchQuery.trim())}`);
                        setSearchFocused(false);
                      }}
                      className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      View all results for &ldquo;{searchQuery}&rdquo; &rarr;
                    </a>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center space-y-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No matching products found</p>
                  <p className="text-[11px] text-slate-400">Press Enter to search entire catalog</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Notifications, Theme Control, Role Indicator, User Profile */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Notifications Popover */}
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            aria-label={unreadCount > 0 ? `View notifications, ${unreadCount} unread` : 'View notifications'}
            aria-expanded={notificationsOpen}
            aria-haspopup="true"
            className="relative p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-[#EEF5F1] dark:hover:bg-[#10352B] rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#123C32]"
          >
            <svg className="w-5 h-5 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#DC2626] text-white text-[10px] font-black flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#063B32] rounded-2xl shadow-xl border border-[#D8ECE7] dark:border-[#1A4538] p-4 space-y-3 z-50 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-[#D8ECE7] dark:border-[#1A4538] pb-2">
                <span className="text-xs font-bold text-[#102A2A] dark:text-slate-100">Notification Center</span>
                <span className="text-[10px] font-semibold text-[#648096]">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </span>
              </div>
              {notifications.length === 0 ? (
                <div className="py-6 text-center space-y-1">
                  <div className="w-8 h-8 rounded-full bg-[#F0FAF7] dark:bg-[#10352B] text-emerald-600 flex items-center justify-center mx-auto mb-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No new notifications</p>
                  <p className="text-[11px] text-slate-400">Order, inventory, and customer alerts will stream here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((n, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-[#F0FAF7] dark:bg-[#10352B] flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                      <div>
                        <span className="text-xs font-semibold text-[#102A2A] dark:text-slate-200 block">{n.title}</span>
                        <span className="text-[10px] text-[#648096]">{n.subtitle}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Theme Control Button (Light / Dark toggle) */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="hidden sm:inline-flex p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-[#D1FAE5]/40 dark:hover:bg-[#10352B] rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#059669]"
        >
          {theme === 'dark' ? (
            <svg className="w-5 h-5 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 stroke-[1.8]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          )}
        </button>

        {/* Reference Role Indicator Pill (Crown icon + Super Admin / Admin role) */}
        <div className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D8ECE7] dark:border-[#1A4538] bg-white dark:bg-[#10352B] text-xs font-semibold text-[#102A2A] dark:text-slate-200 select-none shadow-2xs">
          <svg className="w-3.5 h-3.5 text-amber-500 fill-amber-400" viewBox="0 0 24 24">
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
          </svg>
          <span>Super Admin</span>
          <svg className="w-3 h-3 text-[#648096] ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* User Profile Avatar & Dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-label="User profile menu"
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
            className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-[#D1FAE5]/40 dark:hover:bg-[#10352B] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#059669]"
          >
            {/* Initials Badge */}
            <div className="w-8 h-8 rounded-full bg-[#063B32] text-white font-bold text-xs flex items-center justify-center ring-2 ring-emerald-500/20 shadow-2xs">
              {initials}
            </div>
            <div className="hidden lg:block text-left leading-tight">
              <span className="block text-xs font-bold text-[#102A2A] dark:text-slate-100 truncate max-w-[120px]">
                {displayName}
              </span>
              <span className="block text-[10px] text-[#648096] truncate max-w-[120px]">
                {displayEmail}
              </span>
            </div>
            <svg className="hidden lg:block w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#0B2820] rounded-2xl shadow-xl border border-[#E4E8E5] dark:border-[#1A4538] p-2 space-y-1 z-50 animate-fadeIn">
              <div className="p-2 border-b border-[#E4E8E5] dark:border-[#1A4538]">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{displayName}</p>
                <p className="text-[11px] text-slate-400 truncate">{displayEmail}</p>
                <span className="mt-1 inline-block text-[10px] font-extrabold uppercase tracking-wide bg-[#EEF5F1] dark:bg-[#10352B] text-[#123C32] dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  {roleLabel}
                </span>
              </div>

              <a
                href="/"
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-[#EEF5F1] dark:hover:bg-[#10352B] transition-colors"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Storefront</span>
              </a>

              <div className="pt-1 border-t border-[#E4E8E5] dark:border-[#1A4538]">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    if (logout) logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
