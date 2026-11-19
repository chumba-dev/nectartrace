const STORAGE_KEY = 'nectartrace_pending_order';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function removeStoredOrder() {
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browsing modes.
  }
}

export function savePendingOrder({ listingId, quantityKg, notes = '' }) {
  const normalizedListingId = String(listingId ?? '').trim();
  const normalizedQuantity = Number(quantityKg);
  if (
    !normalizedListingId ||
    !Number.isFinite(normalizedQuantity) ||
    normalizedQuantity <= 0
  ) {
    return false;
  }

  try {
    getStorage()?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        listingId: normalizedListingId,
        quantityKg: normalizedQuantity,
        notes: typeof notes === 'string' ? notes.slice(0, 1000) : '',
        createdAt: Date.now(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function getPendingOrder(listingId) {
  try {
    const raw = getStorage()?.getItem(STORAGE_KEY);
    if (!raw) return null;

    const order = JSON.parse(raw);
    const valid =
      order &&
      typeof order.listingId === 'string' &&
      Number.isFinite(Number(order.quantityKg)) &&
      Number(order.quantityKg) > 0 &&
      Number.isFinite(Number(order.createdAt)) &&
      Date.now() - Number(order.createdAt) <= MAX_AGE_MS;

    if (!valid) {
      removeStoredOrder();
      return null;
    }
    if (listingId !== undefined && order.listingId !== String(listingId)) {
      return null;
    }

    return {
      listingId: order.listingId,
      quantityKg: Number(order.quantityKg),
      notes: typeof order.notes === 'string' ? order.notes : '',
    };
  } catch {
    removeStoredOrder();
    return null;
  }
}

export function clearPendingOrder(listingId) {
  const order = getPendingOrder();
  if (
    !order ||
    listingId === undefined ||
    order.listingId === String(listingId)
  ) {
    removeStoredOrder();
  }
}

export function getPendingOrderPath() {
  const order = getPendingOrder();
  return order ? `/listings/${encodeURIComponent(order.listingId)}` : null;
}
