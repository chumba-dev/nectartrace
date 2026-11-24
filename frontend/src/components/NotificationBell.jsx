import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { notificationsApi } from '../lib/api';
import {
  notificationDate,
  notificationPath,
} from '../lib/notificationNavigation';
import { useAuth } from '../context/AuthContext';
import Button from './ui/Button';

const POLL_INTERVAL = 45_000;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, isAuthenticated, refreshUser } = useAuth();

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'latest'],
    queryFn: async () => {
      const response = await notificationsApi.list({ page: 1, limit: 5 });
      return response.data.data;
    },
    enabled: isAuthenticated,
    refetchInterval: POLL_INTERVAL,
  });

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () =>
      notificationsApi
        .unreadCount()
        .then((response) => response.data.data.count),
    enabled: isAuthenticated,
    refetchInterval: POLL_INTERVAL,
  });

  const refreshNotifications = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: refreshNotifications,
    onError: (error) => toast.error(error.message),
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: refreshNotifications,
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (!panelRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!isAuthenticated) return null;

  const unreadCount = unreadQuery.data || 0;
  const notifications = notificationsQuery.data || [];

  const openNotification = async (notification) => {
    if (!notification.readAt) {
      try {
        await markReadMutation.mutateAsync(notification.id);
      } catch {
        // Navigation remains available if a read receipt fails.
      }
    }
    if (
      notification.type === 'COOPERATIVE_APPLICATION_APPROVED' &&
      user.role === 'COOPERATIVE_STAFF'
    ) {
      try {
        await refreshUser();
      } catch {
        // The dashboard presents a safe refresh prompt for stale memberships.
      }
    }
    setOpen(false);
    navigate(notificationPath(notification, user));
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-controls="notification-panel"
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-dust transition-colors hover:bg-stone hover:text-ivory"
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full border-2 border-obsidian bg-beeswax px-1 text-center font-mono text-[0.6rem] font-bold leading-4 text-obsidian">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          role="dialog"
          aria-label="Recent notifications"
          className="fixed left-4 right-4 top-[66px] z-[70] overflow-hidden rounded-xl border border-dust/20 bg-stone-deep shadow-2xl shadow-black/50 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[390px]"
        >
          <div className="flex items-center justify-between border-b border-dust/10 px-5 py-4">
            <div>
              <h2 className="font-display text-lg text-ivory">Notifications</h2>
              <p className="mt-0.5 text-xs text-dust">
                {unreadCount
                  ? `${unreadCount} unread`
                  : 'You are all caught up'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
                className="text-xs font-medium text-beeswax hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(60vh,430px)] overflow-y-auto">
            {notificationsQuery.isLoading && (
              <p className="px-5 py-10 text-center text-sm text-dust">
                Loading notifications...
              </p>
            )}
            {notificationsQuery.error && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-red-300">
                  {notificationsQuery.error.message}
                </p>
                <button
                  type="button"
                  onClick={() => notificationsQuery.refetch()}
                  className="mt-3 text-xs font-medium text-beeswax hover:underline"
                >
                  Try again
                </button>
              </div>
            )}
            {!notificationsQuery.isLoading &&
              !notificationsQuery.error &&
              notifications.length === 0 && (
                <p className="px-5 py-10 text-center text-sm text-dust">
                  No notifications yet.
                </p>
              )}
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`border-b border-dust/10 px-5 py-4 last:border-b-0 ${
                  notification.readAt ? '' : 'bg-beeswax/[0.06]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openNotification(notification)}
                  className="w-full text-left"
                >
                  <span className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        notification.readAt ? 'bg-dust/30' : 'bg-beeswax'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ivory">
                        {notification.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-dust">
                        {notification.message}
                      </span>
                      <span className="mt-2 block font-mono text-[0.65rem] uppercase tracking-wider text-dust/80">
                        {notificationDate(notification.createdAt)}
                      </span>
                    </span>
                  </span>
                </button>
                {!notification.readAt && (
                  <button
                    type="button"
                    onClick={() => markReadMutation.mutate(notification.id)}
                    disabled={markReadMutation.isPending}
                    className="ml-5 mt-2 text-xs text-beeswax hover:underline disabled:opacity-50"
                  >
                    Mark read
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-dust/10 p-3">
            <Button
              to="/notifications"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              View all notifications
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
