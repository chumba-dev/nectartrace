import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { harvestOffersApi } from '../lib/api';
import Badge from './ui/Badge';
import Button from './ui/Button';
import Card from './ui/Card';
import EmptyState from './ui/EmptyState';
import MonoText from './ui/MonoText';
import Skeleton from './ui/Skeleton';
import {
  AcceptOfferModal,
  RejectOfferModal,
  SettlementModal,
  VerifyOfferModal,
} from './HarvestOfferModals';

const STATUS_VARIANTS = {
  SUBMITTED: 'pending',
  ACCEPTED: 'pending',
  REJECTED: 'sold',
  RECEIVED: 'default',
  VERIFIED: 'verified',
};

function humanize(value) {
  if (!value) return 'Not set';
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === '') return 'Not set';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not set';
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits }).format(
    number
  );
}

function formatKes(value) {
  if (value === null || value === undefined || value === '') return 'Not set';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not set';
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(number);
}

function formatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function offerId(offer) {
  return offer.id ?? offer._id;
}

function Detail({ label, children, secondary }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-xs uppercase tracking-widest text-dust">
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-medium text-ivory">
        {children}
      </dd>
      {secondary && (
        <p className="mt-1 break-words text-xs text-dust">{secondary}</p>
      )}
    </div>
  );
}

function BatchSummary({ batch }) {
  if (!batch) return null;

  const moisture = batch.moisturePercent ?? batch.moistureContent;

  return (
    <div className="rounded-md border border-sage/25 bg-sage/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-sage">
          Verified batch
        </p>
        <MonoText className="text-xs text-ivory">
          {batch.batchId || batch.id}
        </MonoText>
      </div>
      <p className="mt-3 text-sm text-ivory">
        {batch.village || 'Village not set'} | {formatNumber(batch.weightKg)} kg
        {moisture != null ? ` | ${formatNumber(moisture, 1)}% moisture` : ''}
      </p>
      {batch.harvestDate && (
        <p className="mt-1 text-xs text-dust">
          Harvested {formatDate(batch.harvestDate)}
        </p>
      )}
    </div>
  );
}

function SettlementSummary({ settlement }) {
  if (!settlement) return null;

  const calculatedNet =
    Number(settlement.grossAmount) - Number(settlement.commissionAmount);
  const netAmount = settlement.netAmount ?? calculatedNet;
  const paymentStatus = settlement.paymentStatus || settlement.status;

  return (
    <div className="rounded-md border border-beeswax/25 bg-beeswax/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-beeswax">
          Settlement
        </p>
        {paymentStatus && (
          <Badge variant={paymentStatus === 'PAID' ? 'verified' : 'pending'}>
            {humanize(paymentStatus)}
          </Badge>
        )}
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p>
          <span className="block text-xs text-dust">Gross</span>
          <span className="text-ivory">
            {formatKes(settlement.grossAmount)}
          </span>
        </p>
        <p>
          <span className="block text-xs text-dust">Commission</span>
          <span className="text-ivory">
            {formatKes(settlement.commissionAmount)}
          </span>
        </p>
        <p>
          <span className="block text-xs text-dust">Net</span>
          <span className="text-ivory">{formatKes(netAmount)}</span>
        </p>
        <p>
          <span className="block text-xs text-dust">Paid</span>
          <span className="text-ivory">{formatKes(settlement.amountPaid)}</span>
        </p>
      </div>
      {settlement.paymentReference && (
        <MonoText className="mt-3 block break-all text-xs">
          Ref: {settlement.paymentReference}
        </MonoText>
      )}
    </div>
  );
}

function OfferCard({ offer, pending, onAction, onMarkReceived }) {
  const id = offerId(offer);
  const status = offer.status;
  const directSettlementEligible =
    offer.settlementType === 'DIRECT_PURCHASE' &&
    ['ACCEPTED', 'RECEIVED', 'VERIFIED'].includes(status);
  const consignmentSettlementEligible =
    offer.settlementType === 'CONSIGNMENT' &&
    status === 'VERIFIED' &&
    Number(offer.deliveredSalesAmount) > 0;
  const canSettle = directSettlementEligible || consignmentSettlementEligible;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <MonoText className="block break-all text-beeswax">
            {offer.reference || id}
          </MonoText>
          {offer.cooperative?.name && (
            <p className="mt-1 text-xs text-dust">{offer.cooperative.name}</p>
          )}
        </div>
        <Badge variant={STATUS_VARIANTS[status] || 'default'}>
          {humanize(status)}
        </Badge>
      </div>

      <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Detail
          label="Farmer"
          secondary={[
            offer.farmer?.phone || 'Phone not available',
            offer.pickupVillage ? `Pickup: ${offer.pickupVillage}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          {offer.farmer?.name || 'Farmer not available'}
        </Detail>
        <Detail
          label="Offer"
          secondary={`${formatKes(offer.expectedPricePerKg)} expected / kg`}
        >
          {formatNumber(offer.offeredWeightKg)} kg
        </Detail>
        <Detail label="Settlement preference">
          {humanize(offer.settlementType)}
        </Detail>
        <Detail
          label="Agreed terms"
          secondary={
            offer.agreedPricePerKg != null
              ? `${formatKes(offer.agreedPricePerKg)} / kg`
              : 'Price not agreed'
          }
        >
          {offer.acceptedWeightKg != null
            ? `${formatNumber(offer.acceptedWeightKg)} kg accepted`
            : 'Awaiting review'}
        </Detail>
      </dl>

      {offer.rejectionReason && (
        <div className="mt-5 rounded-md border border-red-500/20 bg-red-500/5 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-red-300">
            Rejection reason
          </p>
          <p className="mt-2 text-sm leading-6 text-dust">
            {offer.rejectionReason}
          </p>
        </div>
      )}

      {(offer.batch || offer.settlement) && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <BatchSummary batch={offer.batch} />
          <SettlementSummary settlement={offer.settlement} />
        </div>
      )}

      {offer.settlementType === 'CONSIGNMENT' && status === 'VERIFIED' && (
        <div className="mt-5 rounded-md border border-dust/15 bg-obsidian/40 p-4 text-sm text-dust">
          Delivered marketplace sales:{' '}
          <span className="font-medium text-ivory">
            {formatKes(offer.deliveredSalesAmount || 0)}
          </span>{' '}
          across {formatNumber(offer.deliveredSalesQuantityKg || 0)} kg.
          {!consignmentSettlementEligible && (
            <span className="mt-1 block text-xs">
              Settlement becomes available after at least one order is
              delivered.
            </span>
          )}
        </div>
      )}

      {(status === 'SUBMITTED' ||
        status === 'ACCEPTED' ||
        status === 'RECEIVED' ||
        canSettle) && (
        <div className="mt-6 flex flex-wrap gap-3 border-t border-dust/10 pt-5">
          {status === 'SUBMITTED' && (
            <>
              <Button
                size="sm"
                onClick={() => onAction('accept', offer)}
                disabled={pending}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onAction('reject', offer)}
                disabled={pending}
              >
                Reject
              </Button>
            </>
          )}
          {status === 'ACCEPTED' && (
            <Button
              size="sm"
              onClick={() => onMarkReceived(offer)}
              disabled={pending || !id}
            >
              {pending ? 'Updating...' : 'Mark received'}
            </Button>
          )}
          {status === 'RECEIVED' && (
            <Button
              size="sm"
              onClick={() => onAction('verify', offer)}
              disabled={pending}
            >
              Verify harvest
            </Button>
          )}
          {canSettle && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction('settlement', offer)}
              disabled={pending}
            >
              {offer.settlement ? 'Update settlement' : 'Record settlement'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export default function HarvestOffersSection() {
  const queryClient = useQueryClient();
  const [action, setAction] = useState(null);

  const offersQuery = useQuery({
    queryKey: ['harvest-offers'],
    queryFn: async () => {
      const response = await harvestOffersApi.list();
      const data = response.data.data;
      if (Array.isArray(data)) return data;
      return data?.offers || [];
    },
  });

  const refreshOffers = () => {
    queryClient.invalidateQueries({ queryKey: ['harvest-offers'] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, payload }) => harvestOffersApi.updateStatus(id, payload),
    onSuccess: (_response, variables) => {
      refreshOffers();
      setAction(null);
      toast.success(variables.successMessage);
    },
    onError: (error) => {
      toast.error(error.message || 'Unable to update the offer');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, payload }) => harvestOffersApi.verify(id, payload),
    onSuccess: () => {
      refreshOffers();
      queryClient.invalidateQueries({ queryKey: ['my-batches'] });
      queryClient.invalidateQueries({ queryKey: ['coop-stats'] });
      setAction(null);
      toast.success('Harvest verified and batch created');
    },
    onError: (error) => {
      toast.error(error.message || 'Unable to verify the harvest');
    },
  });

  const settlementMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      harvestOffersApi.updateSettlement(id, payload),
    onSuccess: (response) => {
      refreshOffers();
      setAction(null);
      const data = response.data.data;
      const settlement = data?.settlement || data;
      const paymentStatus = settlement?.paymentStatus || settlement?.status;
      toast.success(
        paymentStatus
          ? `Settlement saved: ${humanize(paymentStatus)}`
          : 'Settlement saved'
      );
    },
    onError: (error) => {
      toast.error(error.message || 'Unable to save the settlement');
    },
  });

  const pending =
    statusMutation.isPending ||
    verifyMutation.isPending ||
    settlementMutation.isPending;

  const openAction = (type, offer) => setAction({ type, offer });

  const markReceived = (offer) => {
    statusMutation.mutate({
      id: offerId(offer),
      payload: { status: 'RECEIVED' },
      successMessage: 'Offer marked as received',
    });
  };

  return (
    <section className="mb-16" aria-labelledby="harvest-offers-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-beeswax">
            Intake queue
          </p>
          <h2
            id="harvest-offers-heading"
            className="font-display text-2xl text-ivory"
          >
            Farmer harvest offers
          </h2>
        </div>
        {offersQuery.isFetching && !offersQuery.isLoading && (
          <p className="font-mono text-xs uppercase tracking-widest text-dust">
            Refreshing
          </p>
        )}
      </div>

      {offersQuery.isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="space-y-5 p-6">
              <div className="flex justify-between gap-4">
                <Skeleton variant="title" className="w-40" />
                <Skeleton className="w-24" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((detail) => (
                  <Skeleton key={detail} className="w-full" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {offersQuery.error && (
        <Card className="border-red-500/30 bg-red-500/5 p-6">
          <p className="text-sm text-red-300">
            Failed to load harvest offers: {offersQuery.error.message}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => offersQuery.refetch()}
          >
            Try again
          </Button>
        </Card>
      )}

      {!offersQuery.isLoading &&
        !offersQuery.error &&
        offersQuery.data.length === 0 && (
          <Card>
            <EmptyState
              title="No harvest offers"
              description="Farmer offers assigned to this cooperative will appear here for intake review."
            />
          </Card>
        )}

      {offersQuery.data?.length > 0 && (
        <div className="space-y-4">
          {offersQuery.data.map((offer, index) => (
            <OfferCard
              key={offerId(offer) || offer.reference || index}
              offer={offer}
              pending={pending}
              onAction={openAction}
              onMarkReceived={markReceived}
            />
          ))}
        </div>
      )}

      {action?.type === 'accept' && (
        <AcceptOfferModal
          offer={action.offer}
          pending={statusMutation.isPending}
          onClose={() => setAction(null)}
          onSubmit={(payload) =>
            statusMutation.mutate({
              id: offerId(action.offer),
              payload,
              successMessage: 'Harvest offer accepted',
            })
          }
        />
      )}
      {action?.type === 'reject' && (
        <RejectOfferModal
          offer={action.offer}
          pending={statusMutation.isPending}
          onClose={() => setAction(null)}
          onSubmit={(payload) =>
            statusMutation.mutate({
              id: offerId(action.offer),
              payload,
              successMessage: 'Harvest offer rejected',
            })
          }
        />
      )}
      {action?.type === 'verify' && (
        <VerifyOfferModal
          offer={action.offer}
          pending={verifyMutation.isPending}
          onClose={() => setAction(null)}
          onSubmit={(payload) =>
            verifyMutation.mutate({
              id: offerId(action.offer),
              payload,
            })
          }
        />
      )}
      {action?.type === 'settlement' && (
        <SettlementModal
          offer={action.offer}
          pending={settlementMutation.isPending}
          onClose={() => setAction(null)}
          onSubmit={(payload) =>
            settlementMutation.mutate({
              id: offerId(action.offer),
              payload,
            })
          }
        />
      )}
    </section>
  );
}
