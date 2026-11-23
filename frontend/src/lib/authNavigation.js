import { getPendingOrderPath } from './pendingOrder';

export function getAuthenticatedHome(user) {
  if (user?.role === 'ADMIN') return '/admin';
  if (user?.role === 'COOPERATIVE_STAFF') return '/dashboard';
  if (user?.role === 'BUYER') {
    return getPendingOrderPath() || '/marketplace';
  }
  return '/marketplace';
}

export function getPostAuthDestination(user, requestedPath) {
  if (user?.role === 'BUYER') {
    const pendingOrderPath = getPendingOrderPath();
    if (pendingOrderPath) return pendingOrderPath;
  }

  const isSafeInternalPath =
    typeof requestedPath === 'string' &&
    requestedPath.startsWith('/') &&
    !requestedPath.startsWith('//');
  if (user?.role !== 'BUYER' && requestedPath?.startsWith('/listings/')) {
    return getAuthenticatedHome(user);
  }
  return isSafeInternalPath ? requestedPath : getAuthenticatedHome(user);
}
