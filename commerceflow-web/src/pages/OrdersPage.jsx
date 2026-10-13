import AccountPage from './AccountPage.jsx';

/**
 * OrdersPage Component
 * Route: /account/orders
 * Seamlessly integrates into the unified Customer Account Center.
 */
export default function OrdersPage({ search }) {
  return <AccountPage currentPath="/account/orders" search={search} />;
}
