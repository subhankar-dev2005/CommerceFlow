import { useContext } from 'react';
import { AddressContext } from './address.context.jsx';

/**
 * Custom hook to access central address state and actions.
 *
 * @returns {{
 *   addresses: Array<Object>,
 *   isLoading: boolean,
 *   isMutating: boolean,
 *   error: Error|null,
 *   refreshAddresses: () => Promise<Array<Object>>,
 *   createAddress: (data: Object) => Promise<Object>,
 *   updateAddress: (addressId: string, data: Object) => Promise<Object>,
 *   setDefaultAddress: (addressId: string) => Promise<Object>,
 *   deleteAddress: (addressId: string) => Promise<Object>
 * }}
 * @throws {Error} If invoked outside of an <AddressProvider>
 */
export function useAddress() {
  const context = useContext(AddressContext);

  if (!context) {
    throw new Error('useAddress must be used within an <AddressProvider>');
  }

  return context;
}

export default useAddress;
