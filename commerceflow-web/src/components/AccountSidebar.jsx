import React from 'react';
import { useAuth } from '../features/auth/useAuth.js';

/**
 * AccountSidebar Component
 * Master Reference Style for CommerceFlow Storefront.
 */
export default function AccountSidebar({ activeTab = 'overview', onTabChange }) {
  const { user, logout } = useAuth();

  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      fullLabel: 'Overview',
      href: '/account',
      icon: (
        <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
    },
    {
      id: 'orders',
      label: 'Orders',
      fullLabel: 'Orders',
      href: '/account/orders',
      icon: (
        <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
        </svg>
      ),
    },
    {
      id: 'addresses',
      label: 'Addresses',
      fullLabel: 'Addresses',
      href: '/account/addresses',
      icon: (
        <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      ),
    },
    {
      id: 'wishlist',
      label: 'Wishlist',
      fullLabel: 'Wishlist',
      href: '/wishlist',
      icon: (
        <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      ),
    },
    {
      id: 'recently-viewed',
      label: 'Recently Viewed',
      fullLabel: 'Recently Viewed',
      href: '/recently-viewed',
      icon: (
        <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'security',
      label: 'Security',
      fullLabel: 'Security',
      href: '/account/security',
      icon: (
        <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      ),
    },
  ];

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <aside className="w-full space-y-4">
      {/* Mobile Horizontal Navigation */}
      <nav
        aria-label="Account navigation"
        className="lg:hidden bg-white border border-[#E5E9E6] rounded-2xl p-1.5 shadow-2xs overflow-x-auto scrollbar-hide"
      >
        <ul className="flex items-center gap-1 min-w-max" role="list">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <li key={item.id}>
                {onTabChange ? (
                  <button
                    type="button"
                    onClick={() => onTabChange(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`inline-flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-all whitespace-nowrap focus:outline-none ${
                      isActive
                        ? 'bg-[#123C32] text-white shadow-xs'
                        : 'text-[#66736D] hover:text-[#17201D] hover:bg-[#F7F6F1]'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ) : (
                  <a
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`inline-flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-all whitespace-nowrap focus:outline-none ${
                      isActive
                        ? 'bg-[#123C32] text-white shadow-xs'
                        : 'text-[#66736D] hover:text-[#17201D] hover:bg-[#F7F6F1]'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop Sidebar Card matching reference */}
      <div className="hidden lg:block space-y-4">
        {/* User Card */}
        <div className="p-5 bg-white border border-[#E5E9E6] rounded-3xl shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#EEF5F1] text-[#123C32] font-extrabold text-base flex items-center justify-center border border-[#123C32]/20">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-extrabold text-[#17201D] truncate">
                {user?.name || 'Outdoor Adventurer'}
              </h2>
              <p className="text-xs text-[#66736D] truncate" title={user?.email}>
                {user?.email || ''}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Card */}
        <nav aria-label="Account navigation" className="bg-white border border-[#E5E9E6] rounded-3xl p-3 shadow-xs">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <li key={item.id}>
                  {onTabChange ? (
                    <button
                      type="button"
                      onClick={() => onTabChange(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all focus:outline-none ${
                        isActive
                          ? 'bg-[#EEF5F1] text-[#123C32] shadow-2xs'
                          : 'text-[#66736D] hover:text-[#17201D] hover:bg-[#F7F6F1]'
                      }`}
                    >
                      <span className={isActive ? 'text-[#123C32]' : 'text-[#66736D]'}>
                        {item.icon}
                      </span>
                      <span>{item.fullLabel}</span>
                    </button>
                  ) : (
                    <a
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all focus:outline-none ${
                        isActive
                          ? 'bg-[#EEF5F1] text-[#123C32] shadow-2xs'
                          : 'text-[#66736D] hover:text-[#17201D] hover:bg-[#F7F6F1]'
                      }`}
                    >
                      <span className={isActive ? 'text-[#123C32]' : 'text-[#66736D]'}>
                        {item.icon}
                      </span>
                      <span>{item.fullLabel}</span>
                    </a>
                  )}
                </li>
              );
            })}

            {/* Logout */}
            <li className="pt-2 mt-2 border-t border-[#E5E9E6]">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors focus:outline-none"
              >
                <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                <span>Logout</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </aside>
  );
}
