import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi } from '../lib/api';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import MonoText from '../components/ui/MonoText';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

const statusVariant = {
  PENDING: 'pending',
  CONFIRMED: 'verified',
  DELIVERED: 'verified',
  CANCELLED: 'sold',
};

export default function Orders() {
  useEffect(() => {
    document.title = 'Orders — NectarTrace';
  }, []);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list().then((res) => res.data.data),
  });

  return (
    <div className="container-content py-20">
      <div className="mb-12">
        <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4">
          Orders
        </p>
        <h1 className="text-display-lg font-display text-ivory mb-4">
          Your orders
        </h1>
        <p className="text-dust">
          Track purchases and their delivery status.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 space-y-3">
              <Skeleton variant="title" className="w-1/3" />
              <Skeleton className="w-full" />
            </Card>
          ))}
        </div>
      )}

      {orders && orders.length === 0 && (
        <Card className="p-6">
          <EmptyState
            title="No orders yet"
            description="Browse the marketplace to find verified Baringo honey."
            action={<Button to="/marketplace">Browse marketplace</Button>}
          />
        </Card>
      )}

      {orders && orders.length > 0 && (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <MonoText className="text-beeswax">
                      {order.listing.batch.batchId}
                    </MonoText>
                    <Badge variant={statusVariant[order.status]}>
                      {order.status}
                    </Badge>
                  </div>
                  <h3 className="font-display text-lg text-ivory mb-1">
                    {order.listing.cooperative.name}
                  </h3>
                  <p className="text-dust text-sm">
                    {order.quantityKg}kg · Placed{' '}
                    {new Date(order.createdAt).toLocaleDateString('en-KE', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl text-ivory">
                    KES {order.totalPrice.toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
