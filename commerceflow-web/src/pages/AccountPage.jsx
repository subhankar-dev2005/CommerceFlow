import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../features/auth/useAuth.js';
import { useAddress } from '../features/address/useAddress.js';
import { useOrder } from '../features/orders/useOrder.js';
import { useWishlist } from '../features/wishlist/useWishlist.js';
import Container from '../components/Container.jsx';
import AccountSidebar from '../components/AccountSidebar.jsx';
import ProfileForm from '../components/ProfileForm.jsx';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';
import AddressCard from '../components/AddressCard.jsx';
import AddressForm from '../components/AddressForm.jsx';
import OrderCard from '../components/OrderCard.jsx';
import Skeleton from '../components/Skeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Button from '../components/Button.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import WidePromoBanner from '../components/WidePromoBanner.jsx';
import { formatPrice, normalizeOrderFinancials } from '../lib/utils.js';

function formatOrderDate(dateString) {
  if (!dateString) return 'Not available';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Not available';
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Not available';
  }
}

function resolveSection(pathname, hash = '') {
  if (pathname === '/account/profile' || hash === '#profile') return 'profile';
  if (pathname === '/account/addresses') return 'addresses';
  if (pathname === '/account/orders') return 'orders';
  if (pathname === '/account/security' || hash === '#security') return 'security';
  return 'overview';
}

const ORDER_STATUS_FILTERS = [
  { label: 'All Orders', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Processing', value: 'processing' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled' },
];

const VALID_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

function parseOrderQuery(searchString) {
  let query = searchString;
  if (typeof query !== 'string') {
    query = typeof window !== 'undefined' ? window.location.search : '';
  }
  if (typeof window === 'undefined' || !window.URLSearchParams) {
    return { status: '', page: 1 };
  }
  const params = new window.URLSearchParams(query || '');
  const rawStatus = (params.get('status') || '').toLowerCase().trim();
  const status = VALID_ORDER_STATUSES.includes(rawStatus) ? rawStatus : '';

  const rawPage = parseInt(params.get('page'), 10);
  const page = !isNaN(rawPage) && rawPage >= 1 ? rawPage : 1;

  return { status, page };
}

function getOrderUrl(status, page) {
  if (typeof window === 'undefined' || !window.URLSearchParams) {
    return '/account/orders';
  }
  const params = new window.URLSearchParams();
  if (status && VALID_ORDER_STATUSES.includes(status)) {
    params.set('status', status);
    params.set('page', String(page || 1));
  } else if (page && page > 1) {
    params.set('page', String(page));
  }
  const queryString = params.toString();
  return queryString ? `/account/orders?${queryString}` : '/account/orders';
}

export default function AccountPage({ currentPath, search }) {
  const { user, isLoading: authLoading, error: authError, refreshUser } = useAuth();
  const {
    addresses,
    isLoading: addressesLoading,
    isMutating: isAddressMutating,
    error: addressError,
    refreshAddresses,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
  } = useAddress();
  const {
    orders,
    pagination: orderPagination,
    isLoading: ordersLoading,
    error: orderError,
    refreshOrders,
  } = useOrder();
  const { wishlist } = useWishlist();

  const [activeTab, setActiveTab] = useState(() => {
    const path = currentPath || (typeof window !== 'undefined' ? window.location.pathname : '/account');
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    return resolveSection(path, hash);
  });

  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [addressNotification, setAddressNotification] = useState(null);

  const initialOrderQuery = parseOrderQuery(
    search || (typeof window !== 'undefined' ? window.location.search : '')
  );
  const [orderStatusFilter, setOrderStatusFilter] = useState(initialOrderQuery.status);
  const [orderPage, setOrderPage] = useState(initialOrderQuery.page);

  const [prevPath, setPrevPath] = useState(currentPath);
  if (currentPath !== prevPath) {
    setPrevPath(currentPath);
    setActiveTab(resolveSection(currentPath, typeof window !== 'undefined' ? window.location.hash : ''));
  }

  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    const { status, page } = parseOrderQuery(search);
    setOrderStatusFilter(status);
    setOrderPage(page);
  }

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        const nextSection = resolveSection(window.location.pathname, window.location.hash);
        setActiveTab(nextSection);
        if (nextSection === 'orders' || window.location.pathname === '/account/orders') {
          const { status, page } = parseOrderQuery(window.location.search);
          setOrderStatusFilter(status);
          setOrderPage(page);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      if (typeof window !== 'undefined') {
        setActiveTab(resolveSection(window.location.pathname, window.location.hash));
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = useCallback((sectionId) => {
    setActiveTab(sectionId);
    setIsAddressFormOpen(false);
    setEditingAddress(null);
    setAddressNotification(null);

    if (typeof window !== 'undefined') {
      let targetUrl = sectionId === 'overview' ? '/account' : `/account/${sectionId}`;
      if (sectionId === 'orders') {
        targetUrl = getOrderUrl(orderStatusFilter, orderPage);
      }
      if (window.location.pathname + window.location.search !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [orderStatusFilter, orderPage]);

  useEffect(() => {
    if (activeTab === 'overview' && orders.length === 0) {
      refreshOrders({ page: 1, limit: 5 }).catch(() => {});
    }
  }, [activeTab, orders.length, refreshOrders]);

  useEffect(() => {
    if (activeTab === 'orders') {
      const params = {
        page: orderPage,
        limit: 10,
        sortOrder: 'desc',
      };
      if (orderStatusFilter) {
        params.status = orderStatusFilter;
      }
      refreshOrders(params).catch(() => {});
    }
  }, [activeTab, orderPage, orderStatusFilter, refreshOrders]);

  const handleOpenAddAddress = () => {
    setEditingAddress(null);
    setIsAddressFormOpen(true);
    setAddressNotification(null);
  };

  const handleOpenEditAddress = (addr) => {
    setEditingAddress(addr);
    setIsAddressFormOpen(true);
    setAddressNotification(null);
  };

  const handleCancelAddressForm = () => {
    setIsAddressFormOpen(false);
    setEditingAddress(null);
  };

  const handleAddressSubmit = async (formData) => {
    try {
      setAddressNotification(null);
      if (editingAddress) {
        await updateAddress(editingAddress._id, formData);
        setAddressNotification({
          type: 'success',
          message: 'Address updated successfully.',
        });
      } else {
        await createAddress(formData);
        setAddressNotification({
          type: 'success',
          message: 'New delivery address added successfully.',
        });
      }
      setIsAddressFormOpen(false);
      setEditingAddress(null);
    } catch (err) {
      let msg = 'Failed to save address. Please check your input and try again.';
      if (err?.code === 'VALIDATION_ERROR') {
        msg = err.message || 'Please check that all address fields are valid.';
      } else if (err?.message) {
        msg = err.message;
      }
      setAddressNotification({
        type: 'error',
        message: msg,
      });
    }
  };

  const handleSetDefaultAddress = async (addressId) => {
    try {
      setAddressNotification(null);
      await setDefaultAddress(addressId);
      setAddressNotification({
        type: 'success',
        message: 'Default delivery address updated.',
      });
    } catch (err) {
      setAddressNotification({
        type: 'error',
        message: err?.message || 'Failed to update default address.',
      });
    }
  };

  const handleDeleteAddress = async (addressId) => {
    try {
      setAddressNotification(null);
      await deleteAddress(addressId);
      setAddressNotification({
        type: 'success',
        message: 'Address removed successfully.',
      });
    } catch (err) {
      setAddressNotification({
        type: 'error',
        message: err?.message || 'Failed to delete address.',
      });
    }
  };

  const handleOrderStatusFilterChange = useCallback((status) => {
    const validStatus = VALID_ORDER_STATUSES.includes(status) ? status : '';
    if (validStatus === orderStatusFilter && orderPage === 1) return;
    setOrderStatusFilter(validStatus);
    setOrderPage(1);

    if (typeof window !== 'undefined') {
      const targetUrl = getOrderUrl(validStatus, 1);
      const currentUrl = window.location.pathname + window.location.search;
      if (currentUrl !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
    }
  }, [orderStatusFilter, orderPage]);

  const handleOrderPageChange = useCallback((newPage) => {
    const maxPages = orderPagination?.totalPages || 1;
    if (newPage < 1 || newPage > maxPages || newPage === orderPage) return;
    setOrderPage(newPage);

    if (typeof window !== 'undefined') {
      const targetUrl = getOrderUrl(orderStatusFilter, newPage);
      const currentUrl = window.location.pathname + window.location.search;
      if (currentUrl !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [orderStatusFilter, orderPage, orderPagination?.totalPages]);

  if (authLoading && !user) {
    return (
      <div className="py-8 sm:py-12 bg-white min-h-[60vh]">
        <Container>
          <div className="max-w-6xl mx-auto space-y-6">
            <Skeleton className="h-8 w-44 rounded-xl" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4 space-y-4">
                <Skeleton className="h-28 rounded-3xl" />
                <Skeleton className="h-48 rounded-3xl" />
              </div>
              <div className="lg:col-span-8 space-y-6">
                <Skeleton className="h-36 rounded-3xl" />
                <Skeleton className="h-64 rounded-3xl" />
              </div>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  if (authError && !user) {
    return (
      <div className="py-16 sm:py-24 bg-[#F7F6F1]">
        <Container>
          <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-[#E5E9E6] text-center shadow-xs">
            <ErrorState
              title="Unable to load account"
              description={authError?.message || 'We encountered an error loading your account information.'}
              onRetry={refreshUser}
            />
          </div>
        </Container>
      </div>
    );
  }

  const totalOrdersCount = orderPagination?.totalOrders ?? orders.length;
  const wishlistCount = wishlist?.totalItems ?? wishlist?.items?.length ?? 0;
  const addressesCount = addresses?.length ?? 0;

  return (
    <div className="py-6 sm:py-10 bg-white min-h-[85vh]">
      <Container>
        <div className="max-w-6xl mx-auto space-y-6">

          <Breadcrumbs
            items={[
              { label: 'My Account', href: activeTab === 'overview' ? undefined : '/account' },
              ...(activeTab !== 'overview' ? [{ label: activeTab.charAt(0).toUpperCase() + activeTab.slice(1) }] : []),
            ]}
          />

          {/* Account Center Layout: Sidebar + Active Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* Sidebar Column */}
            <div className="lg:col-span-4">
              <AccountSidebar activeTab={activeTab} onTabChange={handleTabChange} />
            </div>

            {/* Active Content Area Column */}
            <main className="lg:col-span-8 space-y-6">

              {/* SECTION 1: OVERVIEW (Master Reference Bottom-Middle) */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Header Title */}
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17201D] tracking-tight">
                      Welcome back, {user?.name ? user.name.split(' ')[0] : 'Explorer'}!
                    </h1>
                    <p className="text-xs sm:text-sm text-[#66736D] mt-1">
                      Here's your account overview &amp; recent trail gear orders.
                    </p>
                  </div>

                  {/* 3 Metrics Cards Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white border border-[#E5E9E6] rounded-3xl p-5 shadow-xs flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-[#66736D] uppercase tracking-wider block">Total Orders</span>
                        <span className="text-2xl font-extrabold text-[#17201D] mt-1 block">{totalOrdersCount}</span>
                      </div>
                      <div className="w-10 h-10 rounded-2xl bg-[#EEF5F1] text-[#123C32] flex items-center justify-center font-bold">
                        ↗
                      </div>
                    </div>

                    <div className="bg-white border border-[#E5E9E6] rounded-3xl p-5 shadow-xs flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-[#66736D] uppercase tracking-wider block">Wishlist Items</span>
                        <span className="text-2xl font-extrabold text-[#17201D] mt-1 block">{wishlistCount}</span>
                      </div>
                      <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                        ♥
                      </div>
                    </div>

                    <div className="bg-white border border-[#E5E9E6] rounded-3xl p-5 shadow-xs flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-[#66736D] uppercase tracking-wider block">Addresses</span>
                        <span className="text-2xl font-extrabold text-[#17201D] mt-1 block">{addressesCount}</span>
                      </div>
                      <div className="w-10 h-10 rounded-2xl bg-[#EEF5F1] text-[#123C32] flex items-center justify-center">
                        📍
                      </div>
                    </div>
                  </div>

                  {/* Recent Orders Table matching reference */}
                  <div className="bg-white border border-[#E5E9E6] rounded-3xl p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-[#E5E9E6]">
                      <h2 className="text-base font-extrabold text-[#17201D]">Recent Orders</h2>
                      <button
                        type="button"
                        onClick={() => handleTabChange('orders')}
                        className="text-xs font-bold text-[#123C32] hover:text-[#F97316] transition-colors"
                      >
                        View All &rarr;
                      </button>
                    </div>

                    {ordersLoading && orders.length === 0 ? (
                      <div className="space-y-3 py-2">
                        <Skeleton className="h-10 w-full rounded-xl" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                      </div>
                    ) : orders.length > 0 ? (
                      <div className="divide-y divide-[#E5E9E6]">
                        {orders.slice(0, 3).map((ord) => {
                          const fin = normalizeOrderFinancials(ord);
                          const isDelivered = ord.status === 'delivered';
                          const isShipped = ord.status === 'shipped';
                          const isCancelled = ord.status === 'cancelled';

                          return (
                            <div key={ord._id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <a
                                  href={`/account/orders/${ord._id}`}
                                  className="font-mono text-xs sm:text-sm font-bold text-[#17201D] hover:text-[#123C32]"
                                >
                                  #{ord._id.slice(-9).toUpperCase()}
                                </a>
                                <p className="text-xs text-[#66736D]">{formatOrderDate(ord.createdAt)}</p>
                              </div>

                              <div className="flex items-center gap-4">
                                <span className="text-sm font-extrabold text-[#123C32]">
                                  {formatPrice(fin.total)}
                                </span>
                                <span
                                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                                    isDelivered
                                      ? 'bg-[#EEF5F1] text-[#123C32]'
                                      : isShipped
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : isCancelled
                                      ? 'bg-rose-50 text-rose-700'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {ord.status.charAt(0).toUpperCase() + ord.status.slice(1)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-[#66736D] py-4 text-center">
                        No orders recorded yet. Start gearing up for your next expedition!
                      </p>
                    )}
                  </div>

                  {/* Panoramic Mountain Banner at bottom matching reference collage bottom-middle */}
                  <div className="relative rounded-3xl overflow-hidden min-h-[160px] sm:min-h-[190px] shadow-xs">
                    <img
                      src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80"
                      alt="Scenic mountain peaks"
                      className="w-full h-full object-cover absolute inset-0"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="relative z-10 p-6 flex flex-col justify-end h-full text-white">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#F97316]">
                        COMMERCEFLOW OUTDOORS
                      </span>
                      <h3 className="text-lg sm:text-xl font-extrabold mt-0.5">
                        Gear Up for Better Days
                      </h3>
                      <p className="text-xs text-white/80 max-w-sm mt-1">
                        Find premium camping gear, backpacks, and accessories built for the wilderness.
                      </p>
                    </div>
                  </div>

                </div>
              )}

              {/* SECTION 2: PROFILE */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div className="bg-white border border-[#E5E9E6] rounded-3xl p-6 sm:p-8 shadow-xs">
                    <h2 className="text-lg font-extrabold text-[#17201D] mb-4">Personal Profile</h2>
                    <ProfileForm key={user?.name || 'profile'} />
                  </div>
                </div>
              )}

              {/* SECTION 3: ADDRESSES */}
              {activeTab === 'addresses' && (
                <div className="space-y-6">
                  {addressNotification && (
                    <div
                      role="alert"
                      className={`p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-between border ${
                        addressNotification.type === 'success'
                          ? 'bg-[#EEF5F1] border-[#123C32]/30 text-[#123C32]'
                          : 'bg-rose-50 border-rose-200 text-rose-900'
                      }`}
                    >
                      <span>{addressNotification.message}</span>
                      <button type="button" onClick={() => setAddressNotification(null)} className="font-bold">
                        &times;
                      </button>
                    </div>
                  )}

                  {!isAddressFormOpen && (
                    <div className="flex items-center justify-between bg-white border border-[#E5E9E6] rounded-3xl p-5 shadow-xs">
                      <div>
                        <h2 className="text-sm font-extrabold text-[#17201D]">Delivery Addresses</h2>
                        <p className="text-xs text-[#66736D] mt-0.5">
                          {addresses.length} saved destinations
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleOpenAddAddress}
                        disabled={isAddressMutating}
                        className="rounded-xl text-xs font-bold"
                      >
                        + Add Address
                      </Button>
                    </div>
                  )}

                  {isAddressFormOpen ? (
                    <div className="bg-white border border-[#E5E9E6] rounded-3xl p-6 shadow-xs">
                      <AddressForm
                        initialValues={editingAddress || {}}
                        mode={editingAddress ? 'edit' : 'create'}
                        onSubmit={handleAddressSubmit}
                        onCancel={handleCancelAddressForm}
                        isSubmitting={isAddressMutating}
                      />
                    </div>
                  ) : (
                    <div>
                      {addressesLoading && addresses.length === 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Skeleton className="h-32 rounded-3xl" />
                          <Skeleton className="h-32 rounded-3xl" />
                        </div>
                      ) : addressError && addresses.length === 0 ? (
                        <ErrorState title="Unable to load addresses" onRetry={refreshAddresses} />
                      ) : addresses.length === 0 ? (
                        <EmptyState
                          title="No saved addresses"
                          description="Add a delivery destination to speed up future checkout."
                          action={
                            <Button variant="primary" size="sm" onClick={handleOpenAddAddress} className="rounded-xl mt-3">
                              Add Address
                            </Button>
                          }
                        />
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {addresses.map((address) => (
                            <AddressCard
                              key={address._id}
                              address={address}
                              onEdit={handleOpenEditAddress}
                              onSetDefault={handleSetDefaultAddress}
                              onDelete={handleDeleteAddress}
                              isMutating={isAddressMutating}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 4: ORDERS */}
              {activeTab === 'orders' && (
                <div className="space-y-6">
                  {/* Status Filter Tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                    {ORDER_STATUS_FILTERS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => handleOrderStatusFilterChange(f.value)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                          orderStatusFilter === f.value
                            ? 'bg-[#123C32] text-white shadow-xs'
                            : 'bg-[#F7F6F1] text-[#66736D] hover:bg-[#E5E9E6]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {ordersLoading && orders.length === 0 ? (
                    <div className="space-y-4">
                      <Skeleton className="h-36 rounded-3xl" />
                      <Skeleton className="h-36 rounded-3xl" />
                    </div>
                  ) : orderError && orders.length === 0 ? (
                    <ErrorState title="Unable to load orders" onRetry={() => refreshOrders({ page: orderPage })} />
                  ) : orders.length === 0 ? (
                    <div className="bg-[#F7F6F1] border border-[#E5E9E6] rounded-3xl p-8 text-center">
                      <EmptyState
                        title="No orders found"
                        description="You do not have any orders matching the selected filter."
                        action={
                          <Button as="a" href="/shop" variant="primary" size="sm" className="rounded-xl mt-3">
                            Explore Outdoor Shop
                          </Button>
                        }
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {orders.map((ord) => (
                        <OrderCard key={ord._id} order={ord} />
                      ))}

                      {/* Pagination Controls */}
                      {orderPagination && orderPagination.totalPages > 1 && (
                        <div className="pt-6 flex items-center justify-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={orderPage <= 1}
                            onClick={() => handleOrderPageChange(orderPage - 1)}
                            className="rounded-xl text-xs"
                          >
                            &larr; Previous
                          </Button>
                          <span className="text-xs text-[#66736D] px-2 font-bold">
                            Page {orderPage} of {orderPagination.totalPages}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={orderPage >= orderPagination.totalPages}
                            onClick={() => handleOrderPageChange(orderPage + 1)}
                            className="rounded-xl text-xs"
                          >
                            Next &rarr;
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 5: SECURITY */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <div className="bg-white border border-[#E5E9E6] rounded-3xl p-6 sm:p-8 shadow-xs">
                    <h2 className="text-lg font-extrabold text-[#17201D] mb-4">Security &amp; Password</h2>
                    <ChangePasswordForm />
                  </div>
                </div>
              )}

            </main>

          </div>

          {/* Master Bottom Promotional Banner */}
          <div className="mt-12 sm:mt-16">
            <WidePromoBanner
              eyebrow="GEAR UP FOR BETTER DAYS"
              headline="Ready for Your Next Expedition?"
              subtext="Explore professional tents, sleeping bags, and trail equipment."
              ctaText="Shop Outdoor Gear"
              ctaLink="/shop"
            />
          </div>

        </div>
      </Container>
    </div>
  );
}
