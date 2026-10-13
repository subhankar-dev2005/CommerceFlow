import { useState, useEffect } from 'react';
import { useAuth } from '../features/auth/useAuth.js';
import AdminSidebar from './admin/AdminSidebar.jsx';
import AdminHeader from './admin/AdminHeader.jsx';
import AdminBreadcrumbs from './admin/AdminBreadcrumbs.jsx';

/**
 * AdminLayout Component
 *
 * Production application shell for the CommerceFlow Admin Control Panel.
 * Aligned with the visual reference:
 * - Persistent/collapsible dark forest-green sidebar (#0B2820)
 * - Clean white sticky header with multi-entity search, notifications, role switcher, and user avatar
 * - Accessible breadcrumb trail
 * - Light neutral application canvas (#F4F6F4)
 * - Fully responsive (desktop persistent, tablet collapsible, mobile drawer)
 */
export default function AdminLayout({ children, currentPath: propPath }) {
  const { user } = useAuth();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Active role representation: uses user's assigned role (avoids defaulting unauthorized users to admin)
  const activeRole = user?.role || '';

  const currentPath = propPath || (typeof window !== 'undefined' ? window.location.pathname : '/admin');

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  const handleToggleSidebar = () => {
    // If on mobile/small screen (<1024px), toggle mobile drawer
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileDrawerOpen(!mobileDrawerOpen);
    } else {
      // On desktop, toggle collapsed state
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0FAF7] flex flex-col font-sans antialiased text-[#102A2A]">
      {/* Skip to Main Content Link for Screen Readers */}
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 bg-[#063B32] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg"
      >
        Skip to administrative content
      </a>

      {/* Main Structural Container: Sidebar + Canvas */}
      <div className="flex-1 flex min-h-screen">
        {/* Desktop / Tablet Persistent Sidebar */}
        <div className="hidden lg:flex shrink-0">
          <AdminSidebar
            currentPath={currentPath}
            userRole={activeRole}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
          />
        </div>

        {/* Mobile Navigation Drawer with Backdrop */}
        {mobileDrawerOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs transition-opacity animate-fadeIn"
              onClick={() => setMobileDrawerOpen(false)}
              aria-hidden="true"
            />

            {/* Sliding Drawer */}
            <div className="relative w-72 max-w-[85vw] h-full shadow-2xl flex flex-col z-50 animate-slideIn">
              <AdminSidebar
                currentPath={currentPath}
                userRole={activeRole}
                isCollapsed={false}
                onCloseMobile={() => setMobileDrawerOpen(false)}
                onNavigate={() => setMobileDrawerOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Content Canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Admin Header */}
          <AdminHeader
            onToggleSidebar={handleToggleSidebar}
            currentRole={activeRole}
          />

          {/* Main Body Area */}
          <main
            id="admin-main-content"
            className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto"
          >
            {/* Accessible Breadcrumbs */}
            <AdminBreadcrumbs currentPath={currentPath} />

            {/* Page Content View */}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
