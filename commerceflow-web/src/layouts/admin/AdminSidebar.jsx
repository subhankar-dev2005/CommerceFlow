import { useState } from 'react';
import { getFilteredNavigation, isNavActive, isGroupActive } from './adminNavConfig.js';
import { useAuth } from '../../features/auth/useAuth.js';
import { navigate } from '../../lib/utils.js';

/**
 * Render clean line icon matching the reference image.
 * @param {string} iconKey
 * @param {string} className
 */
function renderNavIcon(iconKey, className = 'w-5 h-5 shrink-0 stroke-[1.8]') {
  switch (iconKey) {
    case 'dashboard':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      );
    case 'products':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      );
    case 'categories':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
        </svg>
      );
    case 'inventory':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      );
    case 'variants':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
      );
    case 'brands':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871a2.986 2.986 0 00-2.12-.879 2.986 2.986 0 00-2.12.879h-.872c-.621 0-1.124.504-1.124 1.125V18.75m9 0H7.5m3.75-10.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      );
    case 'orders':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25c-.67 0-1.189-.578-1.119-1.243l1.263-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      );
    case 'returns':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
      );
    case 'refunds':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'users':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      );
    case 'vendors':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009 9.35c.694 0 1.34-.236 1.859-.636a3.001 3.001 0 004.282 0c.52.4 1.165.636 1.859.636a2.993 2.993 0 002.25-.615 3.001 3.001 0 003.75.615m-16.5 0l1.5-6.75h13.5l1.5 6.75" />
        </svg>
      );
    case 'settings':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'auditLogs':
    case 'administrators':
    case 'shield':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      );
    case 'reports':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      );
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      );
  }
}

/**
 * AdminSidebar Component
 *
 * Implements the polished, light-mint sidebar specification matching the reference image.
 * Features:
 * - Mountain emblem logo and "CommerceFlow" brand typography with "Gear Up · Explore More" tagline
 * - Dedicated primary "Dashboard" item with soft mint-green active pill highlight
 * - Grouped uppercase section labels (Product Management, Order Management, User Management, System)
 * - Interactive nested expand/collapse with automatic active-route expansion and chevron indicators
 * - Client-side SPA navigation avoiding page reloads
 * - Desktop collapsible state (icons only with accessible tooltips)
 * - Responsive mobile drawer with close control and auto-close on navigation
 * - Bottom user/profile card with online status pill
 */
export default function AdminSidebar({
  currentPath = '/admin',
  userRole,
  isCollapsed = false,
  onToggleCollapse,
  onNavigate,
  onCloseMobile,
}) {
  const { user } = useAuth();
  const effectiveRole = typeof userRole === 'string' ? userRole : (user?.role || '');
  const sections = getFilteredNavigation(effectiveRole);

  // Track manual open/close overrides for nested submenu groups
  const [toggledOverrides, setToggledOverrides] = useState({});

  const toggleGroup = (groupId, currentlyExpanded) => {
    setToggledOverrides((prev) => ({
      ...prev,
      [groupId]: !currentlyExpanded,
    }));
  };

  const handleLinkClick = (e, href, groupId = null) => {
    e.preventDefault();
    if (groupId) {
      setToggledOverrides((prev) => ({
        ...prev,
        [groupId]: true,
      }));
    }
    navigate(href);
    if (onNavigate) {
      onNavigate();
    }
  };

  const displayName = user?.name || 'Sarah Admin';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'SA';

  return (
    <aside
      className={`bg-[#06251E] text-white flex flex-col h-full border-r border-[#0D382E] select-none transition-all duration-200 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
      role="navigation"
      aria-label="Administrative navigation"
    >
      {/* Brand Header */}
      <div className="p-4 sm:p-5 border-b border-[#0D382E] flex items-center justify-between shrink-0">
        <a
          href="/admin"
          onClick={(e) => handleLinkClick(e, '/admin')}
          className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-xl"
          aria-label="CommerceFlow Admin Dashboard Home"
        >
          {/* Outdoor Mountain Peak Logo in crisp White matching reference */}
          <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white font-black text-sm shadow-2xs group-hover:scale-105 transition-transform shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.75 3.25a.75.75 0 00-1.3 0L3.1 17.5a.75.75 0 00.65 1.13h16.5a.75.75 0 00.65-1.13l-8.15-14.25zm-.1 3.5l5.24 9.15H6.11l6.54-9.15z" />
            </svg>
          </div>
          {!isCollapsed && (
            <div className="leading-tight overflow-hidden">
              <span className="block font-black text-white tracking-tight text-base">
                Commerce<span className="text-emerald-400">Flow</span>
              </span>
              <span className="text-[10px] font-semibold text-[#6E9E8F] tracking-wide block truncate">
                Gear Up · Explore More
              </span>
            </div>
          )}
        </a>

        {/* Mobile close button in drawer */}
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-[#6E9E8F] hover:text-white hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label="Close navigation drawer"
          >
            <svg className="w-5 h-5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Desktop collapse toggle button if onToggleCollapse is provided */}
        {!onCloseMobile && onToggleCollapse && !isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1 text-[#6E9E8F] hover:text-white hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* Main Nav Items Scroll Area */}
      <nav
        aria-label="Admin sidebar navigation"
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-hide"
      >
        {sections.map((section) => {
          // If section is 'main', render Dashboard item cleanly as top primary element
          const isMainSection = section.id === 'main';

          return (
            <div key={section.id} className="space-y-0.5">
              {/* Section Header (Screen-reader accessible for 'main', visual for other categories) */}
              {!isCollapsed ? (
                <h2
                  className={
                    isMainSection
                      ? 'sr-only'
                      : 'text-[11px] font-extrabold tracking-wider text-[#4E8273] uppercase px-3 pt-3 pb-1'
                  }
                >
                  {section.title}
                </h2>
              ) : (
                <div className="h-px bg-[#0D382E] my-2 mx-2" aria-hidden="true" />
              )}

              {/* Navigation Items in Section */}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isNavActive(currentPath, item.href);
                  const isExpanded =
                    toggledOverrides[item.id] !== undefined
                      ? toggledOverrides[item.id]
                      : isGroupActive(currentPath, item);
                  const hasSub = item.hasSubmenu && Array.isArray(item.children) && item.children.length > 0;

                  return (
                    <div key={item.id} className="space-y-1">
                      <div
                        className={`group relative flex items-center justify-between rounded-2xl transition-all ${
                          active
                            ? 'bg-[#0D5C46] text-white font-bold shadow-2xs'
                            : 'text-[#8EADA2] hover:text-white hover:bg-[#0B3329]'
                        }`}
                      >
                        {/* Main Link */}
                        <a
                          href={item.href}
                          onClick={(e) => handleLinkClick(e, item.href, hasSub ? item.id : null)}
                          title={isCollapsed ? item.label : undefined}
                          aria-label={isCollapsed ? item.label : undefined}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-3 flex-1 min-w-0 px-3.5 py-2.5 text-xs sm:text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-2xl ${
                            isCollapsed ? 'justify-center px-0' : ''
                          }`}
                        >
                          <span
                            className={
                              active
                                ? 'text-white'
                                : 'text-[#8EADA2] group-hover:text-white'
                            }
                          >
                            {renderNavIcon(item.icon)}
                          </span>

                          {!isCollapsed && (
                            <span className="truncate">{item.label}</span>
                          )}
                        </a>

                        {/* Expand/Collapse Chevron Button */}
                        {!isCollapsed && hasSub && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroup(item.id, isExpanded);
                            }}
                            aria-expanded={isExpanded}
                            aria-label={`Toggle ${item.label} submenu`}
                            className="p-2 text-[#5C8578] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-xl mr-1 transition-transform"
                          >
                            <svg
                              className={`w-3.5 h-3.5 transition-transform duration-200 stroke-[2.2] ${
                                isExpanded ? 'rotate-90' : ''
                              }`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Nested Submenu Children */}
                      {!isCollapsed && hasSub && isExpanded && (
                        <div
                          className="pl-8 pr-1 py-1 space-y-1 border-l-2 border-[#124236] ml-5 transition-all"
                          role="group"
                          aria-label={`${item.label} sub-navigation`}
                        >
                          {item.children.map((child) => {
                            const childActive = currentPath === child.href;
                            return (
                              <a
                                key={child.id}
                                href={child.href}
                                onClick={(e) => handleLinkClick(e, child.href, item.id)}
                                aria-current={childActive ? 'page' : undefined}
                                className={`block px-3 py-1.5 rounded-xl text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                                  childActive
                                    ? 'bg-[#0E4939] text-white font-bold shadow-2xs'
                                    : 'text-[#8EADA2] hover:text-white hover:bg-[#0B3329] font-medium'
                                }`}
                              >
                                {child.label}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom Profile / Account Card Matching Reference */}
      <div className="p-3 border-t border-[#0D382E] shrink-0">
        {!isCollapsed ? (
          <div className="p-2.5 bg-[#082C23] border border-[#0F3D32] rounded-2xl flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-[#0E3E32] border border-white/10 text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                  {/* User icon silhouette matching reference */}
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#082C23]"
                  title="Online"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-bold text-white truncate max-w-[105px]">
                  CommerceFlow Admin
                </span>
                <span className="block text-[10px] text-[#5F887C] font-medium truncate max-w-[105px]">
                  v1.0.0
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold shrink-0 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
              <span>Online</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="relative" title={`${displayName} (Online)`} aria-label={`${displayName} (Online)`}>
              <div className="w-9 h-9 rounded-full bg-[#0E3E32] border border-white/10 text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                {initials}
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#06251E]"
                title="Online"
                aria-hidden="true"
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
