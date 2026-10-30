import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider } from './features/auth/auth.context.jsx';
import { AddressProvider } from './features/address/address.context.jsx';
import { CartProvider } from './features/cart/cart.context.jsx';
import { WishlistProvider } from './features/wishlist/wishlist.context.jsx';
import { RecentlyViewedProvider } from './features/recentlyViewed/RecentlyViewedContext.jsx';
import { OrderProvider } from './features/orders/order.context.jsx';
import { PaymentProvider } from './features/payments/payment.context.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import AdminRoute from './routes/AdminRoute.jsx';
import Skeleton from './components/Skeleton.jsx';

// Customer storefront route-level pages (lazy loaded)
const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const ShopPage = lazy(() => import('./pages/ShopPage.jsx'));
const ProductPage = lazy(() => import('./pages/ProductPage.jsx'));
const CartPage = lazy(() => import('./pages/CartPage.jsx'));
const AddressesPage = lazy(() => import('./pages/AddressesPage.jsx'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage.jsx'));
const OrderConfirmationPage = lazy(() => import('./pages/OrderConfirmationPage.jsx'));
const OrdersPage = lazy(() => import('./pages/OrdersPage.jsx'));
const OrderDetailsPage = lazy(() => import('./pages/OrderDetailsPage.jsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));
const WishlistPage = lazy(() => import('./pages/WishlistPage.jsx'));
const RecentlyViewedPage = lazy(() => import('./pages/RecentlyViewedPage.jsx'));

// Administrative route-level pages (lazy loaded)
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage.jsx'));
const AdminProductsPage = lazy(() => import('./pages/admin/AdminProductsPage.jsx'));
const AdminProductCreatePage = lazy(() => import('./pages/admin/AdminProductCreatePage.jsx'));
const AdminProductEditPage = lazy(() => import('./pages/admin/AdminProductEditPage.jsx'));
const AdminProductDetailPage = lazy(() => import('./pages/admin/AdminProductDetailPage.jsx'));
const AdminOrdersPage = lazy(() => import('./pages/admin/AdminOrdersPage.jsx'));
const AdminOrderDetailsPage = lazy(() => import('./pages/admin/AdminOrderDetailsPage.jsx'));
const AdminCustomersPage = lazy(() => import('./pages/admin/AdminCustomersPage.jsx'));
const AdminCustomerDetailsPage = lazy(() => import('./pages/admin/AdminCustomerDetailsPage.jsx'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage.jsx'));
const AdminInventoryPage = lazy(() => import('./pages/admin/AdminInventoryPage.jsx'));
const AdminReturnsPage = lazy(() => import('./pages/admin/AdminReturnsPage.jsx'));
const AdminRefundsPage = lazy(() => import('./pages/admin/AdminRefundsPage.jsx'));
const AdminPlaceholderPage = lazy(() => import('./pages/admin/AdminPlaceholderPage.jsx'));
const AdminAuditLogsPage = lazy(() => import('./pages/admin/AdminAuditLogsPage.jsx'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage.jsx'));
const AdminSetupPage = lazy(() => import('./pages/admin/AdminSetupPage.jsx'));
const AdminCategoriesPage = lazy(() => import('./pages/admin/AdminCategoriesPage.jsx'));
const AdminVariantsPage = lazy(() => import('./pages/admin/AdminVariantsPage.jsx'));
const AdminBrandsPage = lazy(() => import('./pages/admin/AdminBrandsPage.jsx'));
const AdminVendorsPage = lazy(() => import('./pages/admin/AdminVendorsPage.jsx'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage.jsx'));
const AdminReportsPage = lazy(() => import('./pages/admin/AdminReportsPage.jsx'));
const AdminBannersPage = lazy(() => import('./pages/admin/AdminBannersPage.jsx'));

/**
 * Accessible fallback skeleton displayed while lazy route chunks load.
 */
function RouteLoadingFallback() {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-6"
      role="status"
      aria-live="polite"
      aria-label="Loading page content"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export default function App() {
  const [locationState, setLocationState] = useState(() => ({
    pathname: typeof window !== 'undefined' ? window.location.pathname : '/',
    search: typeof window !== 'undefined' ? window.location.search : '',
  }));

  useEffect(() => {
    const handleLocationChange = () => {
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search,
      });
      if (!window.location.hash) {
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Intercept local relative link clicks for smooth SPA navigation
  useEffect(() => {
    const handleAnchorClick = (e) => {
      const anchor = e.target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      // If internal link starting with /
      if (
        href &&
        href.startsWith('/') &&
        !href.startsWith('//') &&
        !anchor.target &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey
      ) {
        e.preventDefault();
        const currentUrl = window.location.pathname + window.location.search;
        if (currentUrl !== href) {
          window.history.pushState({}, '', href);
          setLocationState({
            pathname: window.location.pathname,
            search: window.location.search,
          });
          if (!href.includes('#')) {
            window.scrollTo(0, 0);
          }
        }
      }
    };

    document.addEventListener('click', handleAnchorClick);
    return () => document.removeEventListener('click', handleAnchorClick);
  }, []);

  const renderCurrentPage = () => {
    const { pathname, search } = locationState;

    if (pathname === '/login') {
      return <LoginPage />;
    }
    if (pathname === '/register') {
      return <RegisterPage />;
    }
    if (pathname === '/shop' || pathname.startsWith('/shop/')) {
      return <ShopPage search={search} />;
    }
    if (pathname === '/cart') {
      return <CartPage />;
    }
    if (pathname === '/wishlist' || pathname === '/account/wishlist') {
      return (
        <ProtectedRoute>
          <WishlistPage />
        </ProtectedRoute>
      );
    }
    if (pathname === '/recently-viewed' || pathname === '/account/recently-viewed') {
      return <RecentlyViewedPage />;
    }
    if (
      pathname === '/account' ||
      pathname === '/account/profile' ||
      pathname === '/account/addresses' ||
      pathname === '/account/orders' ||
      pathname === '/account/security'
    ) {
      return (
        <ProtectedRoute>
          <AccountPage currentPath={pathname} search={search} />
        </ProtectedRoute>
      );
    }

    // Match /account/orders/:orderId
    const orderDetailMatch = pathname.match(/^\/account\/orders\/([^/?#]+)/);
    if (orderDetailMatch) {
      const orderId = orderDetailMatch[1];
      return (
        <ProtectedRoute>
          <OrderDetailsPage key={orderId} orderId={orderId} />
        </ProtectedRoute>
      );
    }
    if (pathname === '/checkout') {
      return (
        <ProtectedRoute>
          <CheckoutPage />
        </ProtectedRoute>
      );
    }
    if (pathname === '/order-confirmation') {
      return (
        <ProtectedRoute>
          <OrderConfirmationPage />
        </ProtectedRoute>
      );
    }

    // Match /products/:id
    const productMatch = pathname.match(/^\/products\/([^/?#]+)/);
    if (productMatch) {
      const productId = productMatch[1];
      return <ProductPage key={productId} productId={productId} />;
    }

    // Admin routes
    if (pathname === '/admin/login') {
      return <AdminLoginPage />;
    }
    if (pathname === '/admin/setup') {
      return <AdminSetupPage />;
    }
    if (pathname === '/admin' || pathname === '/admin/dashboard') {
      return <AdminDashboardPage />;
    }
    if (pathname === '/admin/products') {
      return <AdminProductsPage search={search} />;
    }
    if (pathname === '/admin/products/new') {
      return <AdminProductCreatePage />;
    }
    const adminProductEditMatch = pathname.match(/^\/admin\/products\/([^/?#]+)\/edit$/);
    if (adminProductEditMatch) {
      const productId = adminProductEditMatch[1];
      return <AdminProductEditPage key={productId} productId={productId} />;
    }
    const adminProductDetailMatch = pathname.match(/^\/admin\/products\/([^/?#]+)$/);
    if (adminProductDetailMatch && !pathname.endsWith('/new')) {
      const productId = adminProductDetailMatch[1];
      return <AdminProductDetailPage key={productId} productId={productId} />;
    }
    if (pathname === '/admin/categories') {
      return <AdminCategoriesPage search={search} />;
    }
    if (pathname === '/admin/inventory') {
      return <AdminInventoryPage search={search} />;
    }
    if (pathname === '/admin/variants') {
      return <AdminVariantsPage search={search} />;
    }
    if (pathname === '/admin/brands') {
      return <AdminBrandsPage search={search} />;
    }
    if (pathname === '/admin/orders') {
      return <AdminOrdersPage search={search} />;
    }
    const adminOrderDetailMatch = pathname.match(/^\/admin\/orders\/([^/?#]+)$/);
    if (adminOrderDetailMatch) {
      const orderId = adminOrderDetailMatch[1];
      return <AdminOrderDetailsPage key={orderId} orderId={orderId} />;
    }
    if (pathname === '/admin/returns') {
      return <AdminReturnsPage search={search} />;
    }
    if (pathname === '/admin/refunds') {
      return <AdminRefundsPage search={search} />;
    }
    if (pathname === '/admin/users') {
      return <AdminUsersPage search={search} />;
    }
    if (pathname === '/admin/customers') {
      return <AdminCustomersPage search={search} />;
    }
    const adminCustomerDetailMatch = pathname.match(/^\/admin\/(?:customers|users)\/([^/?#]+)$/);
    if (adminCustomerDetailMatch) {
      const customerId = adminCustomerDetailMatch[1];
      return <AdminCustomerDetailsPage key={customerId} customerId={customerId} />;
    }
    if (pathname === '/admin/vendors') {
      return <AdminVendorsPage />;
    }
    if (pathname === '/admin/settings') {
      return <AdminSettingsPage />;
    }
    if (pathname === '/admin/audit-logs') {
      return <AdminAuditLogsPage search={search} />;
    }
    if (pathname === '/admin/reports') {
        return <AdminReportsPage />;
      }
      if (pathname === '/admin/banners') {
        return <AdminBannersPage />;
      }

    // Admin 404 fallback if nested admin route not matched
    if (pathname.startsWith('/admin')) {
      return (
        <div className="max-w-md mx-auto py-12 text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-900">Admin Page Not Found</h1>
          <p className="text-sm text-slate-500">The requested administrative URL does not exist.</p>
          <a
            href="/admin"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Return to Dashboard
          </a>
        </div>
      );
    }

    return <HomePage />;
  };

  const isAdminRoute =
    locationState.pathname.startsWith('/admin') &&
    locationState.pathname !== '/admin/login' &&
    locationState.pathname !== '/admin/setup';

  const isAnyAdminRoute = locationState.pathname.startsWith('/admin');

  return (
    <AuthProvider>
      {isAdminRoute ? (
        <AdminRoute>
          <AdminLayout currentPath={locationState.pathname}>
            <Suspense fallback={<RouteLoadingFallback />}>
              {renderCurrentPage()}
            </Suspense>
          </AdminLayout>
        </AdminRoute>
      ) : isAnyAdminRoute ? (
        <Suspense fallback={<RouteLoadingFallback />}>
          {renderCurrentPage()}
        </Suspense>
      ) : (
        <StorefrontProviders>
          <MainLayout>
            <Suspense fallback={<RouteLoadingFallback />}>
              {renderCurrentPage()}
            </Suspense>
          </MainLayout>
        </StorefrontProviders>
      )}
    </AuthProvider>
  );
}

/**
 * Scoped provider tree for customer storefront features.
 * Isolates cart, address, wishlist, and customer-order contexts to storefront
 * layouts, preventing administrative pages from unnecessarily initiating
 * customer queries and exhausting local API rate limits.
 */
function StorefrontProviders({ children }) {
  return (
    <AddressProvider>
      <CartProvider>
        <WishlistProvider>
          <RecentlyViewedProvider>
            <OrderProvider>
              <PaymentProvider>
                {children}
              </PaymentProvider>
            </OrderProvider>
          </RecentlyViewedProvider>
        </WishlistProvider>
      </CartProvider>
    </AddressProvider>
  );
}
