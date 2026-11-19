import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { listingsApi, ordersApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import MonoText from '../components/ui/MonoText';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import ListingImage from '../components/ListingImage';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const redirectTimerRef = useRef(null);
  const canOrder = user?.role === 'BUYER';

  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [orderError, setOrderError] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(false);

  useEffect(() => {
    document.title = 'Listing — NectarTrace';

    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const {
    data: listing,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => listingsApi.get(id).then((res) => res.data.data),
  });

  const orderMutation = useMutation({
    mutationFn: (data) => ordersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing', id] });
      setOrderSuccess(true);
      setQuantity('');
      setNotes('');
      toast.success('Order placed');
      redirectTimerRef.current = setTimeout(() => {
        navigate('/orders');
      }, 2000);
    },
    onError: (err) => {
      const message = err.message || 'Failed to place order';
      setOrderError(message);
      toast.error(message);
    },
  });

  const handleOrder = (e) => {
    e.preventDefault();
    setOrderError('');

    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: `/listings/${id}` } } });
      return;
    }

    if (!canOrder) {
      setOrderError('Only buyer accounts can place marketplace orders');
      return;
    }

    const qty = parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0 || qty > listing.quantityKg) {
      setOrderError(`Quantity must be between 0 and ${listing.quantityKg}kg`);
      return;
    }

    orderMutation.mutate({
      listingId: listing.id,
      quantityKg: qty,
      notes,
    });
  };

  if (isLoading) {
    return (
      <div className="container-content py-20">
        <Card className="p-8 space-y-4 max-w-3xl">
          <Skeleton variant="title" className="w-1/3" />
          <Skeleton className="w-full" />
          <Skeleton className="w-5/6" />
        </Card>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="container-content py-20 text-center">
        <h1 className="text-display-md font-display text-ivory mb-4">
          Listing not found
        </h1>
        <Button to="/marketplace">Back to marketplace</Button>
      </div>
    );
  }

  const totalPrice = quantity ? parseFloat(quantity) * listing.pricePerKg : 0;
  const inputClass =
    'w-full px-4 py-3 bg-obsidian border border-dust/20 rounded-md text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors';

  return (
    <div className="container-content py-20">
      <Link
        to="/marketplace"
        className="inline-flex items-center text-sm text-dust hover:text-beeswax transition-colors mb-8"
      >
        ← Back to marketplace
      </Link>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main details — 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          <ListingImage
            src={listing.imageUrl}
            alt={`${listing.cooperative.name} honey from ${listing.batch.village}`}
            loading="eager"
            className="aspect-[4/3] w-full rounded-xl border border-dust/10 bg-ivory/[0.03] p-5 object-contain sm:aspect-[16/9] sm:p-8"
          />

          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <VerifiedBadge />
              <MonoText className="text-xs">{listing.batch.batchId}</MonoText>
            </div>

            <h1 className="text-display-md font-display text-ivory mb-4 text-balance">
              {listing.cooperative.name}
            </h1>
            <p className="text-dust text-lg">
              {listing.batch.village} · Harvested{' '}
              {new Date(listing.batch.harvestDate).toLocaleDateString('en-KE', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>

          {listing.description && (
            <Card className="p-6">
              <p className="text-dust text-pretty">{listing.description}</p>
            </Card>
          )}

          {/* Batch info */}
          <Card className="p-6">
            <h2 className="font-display text-xl text-ivory mb-4">
              Batch details
            </h2>
            <dl className="space-y-3">
              <div className="flex justify-between pb-3 border-b border-dust/10">
                <dt className="text-sm text-dust">Moisture content</dt>
                <dd className="text-ivory">
                  {listing.batch.moistureContent}%
                  {listing.batch.moistureContent < 20 && (
                    <Badge variant="verified" className="ml-2">
                      Pure
                    </Badge>
                  )}
                </dd>
              </div>
              <div className="flex justify-between pb-3 border-b border-dust/10">
                <dt className="text-sm text-dust">Available</dt>
                <dd className="text-ivory">{listing.quantityKg} kg</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-dust">Verified on-chain</dt>
                <dd>
                  {listing.batch.blockchainTxHash ? (
                    <a
                      href={`https://amoy.polygonscan.com/tx/${listing.batch.blockchainTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-beeswax hover:underline text-sm"
                    >
                      View transaction on Polygonscan →
                    </a>
                  ) : (
                    <span className="text-sm text-dust">Unavailable</span>
                  )}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        {/* Order form — 1 col */}
        <div className="lg:col-span-1">
          <Card className="p-6 sticky top-24">
            <div className="mb-6">
              <p className="text-sm text-dust mb-1">Price</p>
              <p className="font-display text-4xl text-beeswax">
                KES {listing.pricePerKg.toLocaleString()}
              </p>
              <p className="text-xs text-dust font-mono mt-1">per kg</p>
            </div>

            {isAuthenticated && !canOrder ? (
              <div className="rounded-md border border-dust/20 bg-obsidian p-4 text-sm text-dust">
                Marketplace orders can only be placed from a buyer account.
              </div>
            ) : orderSuccess ? (
              <div className="bg-sage/10 border border-sage/30 text-sage rounded-md p-4 text-sm text-center">
                ✓ Order placed successfully. Redirecting...
              </div>
            ) : (
              <form onSubmit={handleOrder} className="space-y-4">
                {orderError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-md">
                    {orderError}
                  </div>
                )}

                <div>
                  <label className="block text-sm text-dust mb-2">
                    Quantity (kg)
                  </label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="10"
                    step="0.5"
                    min="0.5"
                    max={listing.quantityKg}
                    className={inputClass}
                    required
                  />
                  <p className="text-xs text-dust mt-1.5">
                    Max: {listing.quantityKg} kg
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-dust mb-2">
                    Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Delivery instructions..."
                    rows="3"
                    className={inputClass}
                  />
                </div>

                {quantity && (
                  <div className="pt-4 border-t border-dust/10">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-dust">Total</span>
                      <span className="font-display text-2xl text-ivory">
                        KES {totalPrice.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={orderMutation.isPending}
                >
                  {orderMutation.isPending ? 'Placing order...' : 'Place order'}
                </Button>

                {!isAuthenticated && (
                  <p className="text-xs text-dust text-center">
                    You'll be asked to sign in
                  </p>
                )}
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
