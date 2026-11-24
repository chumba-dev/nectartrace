export function notificationPath(notification, user) {
  switch (notification.entityType) {
    case 'CooperativeApplication':
      return user?.role === 'ADMIN'
        ? '/admin?section=applications'
        : '/dashboard?section=application';
    case 'Offer':
      return '/dashboard?section=offers';
    case 'Order':
      return user?.role === 'ADMIN' ? '/admin?section=orders' : '/orders';
    default:
      return '/notifications';
  }
}

export function notificationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
