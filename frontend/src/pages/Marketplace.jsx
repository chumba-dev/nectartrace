import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listingsApi } from '../lib/api';
import Card from '../components/ui/Card';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import MonoText from '../components/ui/MonoText';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

export default function Marketplace() {
  useEffect(() => {
    document.title = 'Marketplace — NectarTrace';
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['listings'],
    queryFn: () => listingsApi.list().then((res) => res.data.data),
  });

  return (
    <div className="container-content py-20 md:py-28">
      <div className="mb-16">
        <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4">
          Marketplace
        </p>
        <h1 className="text-display-lg font-display text-ivory mb-6 text-balance">
          Verified honey from Baringo
        </h1>
        <p className="text-dust text-lg max-w-2xl text-pretty">
          Every listing is traceable to a verified batch. Prices set by the
          cooperatives, not middlemen.
        </p>
      </div>

      {isLoading && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 space-y-4">
              <Skeleton variant="title" className="w-2/3" />
              <Skeleton className="w-full" />
              <Skeleton className="w-5/6" />
              <Skeleton variant="title" className="w-1/3" />
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="p-6 border-red-500/30 bg-red-500/5">
          <p className="text-red-300">
            Failed to load listings: {error.message}
          </p>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card className="p-6">
          <EmptyState
            title="No listings yet"
            description="Be the first to browse honey from Baringo cooperatives. Check back soon."
            action={<Button to="/">Back to home</Button>}
          />
        </Card>
      )}

      {data && data.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.map((listing) => (
            <Link key={listing.id} to={`/listings/${listing.id}`}>
              <Card hover className="p-6 h-full flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <VerifiedBadge />
                  <MonoText className="text-xs">
                    {listing.batch.batchId}
                  </MonoText>
                </div>

                <h3 className="font-display text-xl text-ivory mb-2">
                  {listing.cooperative.name}
                </h3>
                <p className="text-dust text-sm mb-4">
                  {listing.batch.village} · Harvested{' '}
                  {new Date(listing.batch.harvestDate).toLocaleDateString(
                    'en-KE',
                    { month: 'short', year: 'numeric' }
                  )}
                </p>

                <div className="mt-auto pt-4 border-t border-dust/10 flex items-end justify-between">
                  <div>
                    <p className="font-display text-2xl text-beeswax">
                      KES {listing.pricePerKg.toLocaleString()}
                    </p>
                    <p className="text-xs text-dust font-mono">per kg</p>
                  </div>
                  <p className="text-sm text-dust">
                    {listing.quantityKg}kg available
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
