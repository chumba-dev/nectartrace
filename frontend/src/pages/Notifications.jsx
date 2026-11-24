import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { notificationsApi } from '../lib/api';
import {
  notificationDate,
  notificationPath,
} from '../lib/notificationNavigation';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

export default function Notifications() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  useEffect(() => {
    document.title = 'Notifications - NectarTrace';
  }, []);

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'page', page],
    queryFn: async () => {
      const response = await notificationsApi.list({ page, limit: 20 });
      return {
        notifications: response.data.data,
        pagination: response.data.pagination,
      };
    },
  });

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () =>
      notificationsApi
        .unreadCount()
        .then((response) => response.data.data.count),
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
    onSuccess: () => {
      refreshNotifications();
      toast.success('All notifications marked read');
    },
    onError: (error) => toast.error(error.message),
  });

  const openNotification = async (notification) => {
    if (!notification.readAt) {
      try {
        await markReadMutation.mutateAsync(notification.id);
      } catch {
        // Entity navigation should not depend on a read receipt.
      }
    }
    if (
      notification.type === 'COOPERATIVE_APPLICATION_APPROVED' &&
      user.role === 'COOPERATIVE_STAFF'
    ) {
      try {
        await refreshUser();
      } catch {
        // The dashboard can retry the auth refresh.
      }
    }
    navigate(notificationPath(notification, user));
  };

  const notifications = notificationsQuery.data?.notifications || [];
  const pagination = notificationsQuery.data?.pagination;
  const unreadCount = unreadQuery.data || 0;

  return (
    <div className="container-content py-16 md:py-20">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-beeswax">
            Activity centre
          </p>
          <h1 className="font-display text-4xl text-ivory">Notifications</h1>
          <p className="mt-3 text-sm text-dust">
            Application decisions, offers, and marketplace order activity.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => markAllMutation.mutate()}
          disabled={markAllMutation.isPending || unreadCount === 0}
        >
          Mark all read
        </Button>
      </div>

      {notificationsQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="space-y-3 p-6">
              <Skeleton variant="title" className="w-1/3" />
              <Skeleton className="w-full" />
            </Card>
          ))}
        </div>
      )}

      {notificationsQuery.error && (
        <Card className="border-red-500/30 bg-red-500/5 p-6">
          <p className="text-sm text-red-300">
            Failed to load notifications: {notificationsQuery.error.message}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => notificationsQuery.refetch()}
          >
            Try again
          </Button>
        </Card>
      )}

      {!notificationsQuery.isLoading &&
        !notificationsQuery.error &&
        notifications.length === 0 && (
          <Card>
            <EmptyState
              title="No notifications"
              description="New application, offer, and order activity will appear here."
            />
          </Card>
        )}

      {notifications.length > 0 && (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`p-5 sm:p-6 ${
                notification.readAt ? '' : 'border-beeswax/25 bg-beeswax/[0.04]'
              }`}
            >
              <div className="flex items-start gap-4">
                <span
                  className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
                    notification.readAt ? 'bg-dust/30' : 'bg-beeswax'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg text-ivory">
                        {notification.title}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-dust">
                        {notification.message}
                      </p>
                    </div>
                    <p className="font-mono text-[0.68rem] uppercase tracking-wider text-dust">
                      {notificationDate(notification.createdAt)}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => openNotification(notification)}
                    >
                      View details
                    </Button>
                    {!notification.readAt && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => markReadMutation.mutate(notification.id)}
                        disabled={markReadMutation.isPending}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {pagination?.totalPages > 1 && (
        <nav
          className="mt-8 flex items-center justify-between gap-4"
          aria-label="Notification pages"
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || notificationsQuery.isFetching}
          >
            Previous
          </Button>
          <p className="text-xs text-dust">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setPage((current) => current + 1)}
            disabled={
              page >= pagination.totalPages || notificationsQuery.isFetching
            }
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
