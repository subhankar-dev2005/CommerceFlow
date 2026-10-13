import { useContext } from 'react';
import authContextModule from './auth.context.jsx';
import cartContextModule from '../cart/cart.context.jsx';

const AuthContext = cartContextModule?.AuthContext || authContextModule?.AuthContext || authContextModule?.default || authContextModule;

/**
 * Custom hook to access authentication context.
 *
 * @returns {import('./auth.context.jsx').AuthContextValue}
 * @throws {Error} If invoked outside of an <AuthProvider>
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }

  return context;
}

export default useAuth;
