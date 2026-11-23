import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { harvestOffersApi, paymentsApi } from '../lib/api';
import Badge from './ui/Badge';
import Button from './ui/Button';
import Card from './ui/Card';
import EmptyState from './ui/EmptyState';
import MonoText from './ui/MonoText';
import Skeleton from './ui/Skeleton';
import {
  AcceptOfferModal,
  DeliveryOfferModal,
  MarkSoldModal,
  PayoutOfferModal,
  RejectOfferModal,
  VerifyOfferModal,
} from './HarvestOfferModals';

const STATUS_VARIANTS = {
  offered: 'pending',
  accepted: 'pending',
  rejected: 'sold',
  expired: 'sold',
  delivered: 'default',
  verified: 'verified',
  paid: 'verified',
};

const TERMINAL_STATUSES = new Set(['paid', 'rejected', 'expired']);

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

function formatDate(value, includeTime = false) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(includeTime && { hour: 'numeric', minute: '2-digit' }),
  }).format(date);
}

function offerId(offer) {
  return offer.id ?? offer._id;
}

function paymentFromResponse(response) {
  const data = response?.data?.data;
  return data?.payment ?? data ?? null;
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

function PaymentSummary({ payment }) {
  if (!payment) return null;
  const failed = ['failed', 'timeout'].includes(payment.status);

  return (
    <div
      className={`mt-5 rounded-md border p-4 ${
        failed
          ? 'border-red-500/25 bg-red-500/5'
          : 'border-beeswax/25 bg-beeswax/5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-beeswax">
          Payout
        </p>
        <Badge
          variant={
            payment.status === 'succeeded'
              ? 'verified'
              : failed
                ? 'sold'
                : 'pending'
          }
        >
          {humanize(payment.status)}
        </Badge>
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <p>
          <span className="block text-xs text-dust">Amount</span>
          <span className="text-ivory">{formatKes(payment.amount)}</span>
        </p>
        <p>
          <span className="block text-xs text-dust">Reference</span>
          <span className="break-all font-mono text-xs text-ivory">
            {payment.reference || 'Not set'}
          </span>
        </p>
        <p>
          <span className="block text-xs text-dust">Requested</span>
          <span className="text-ivory">{formatDate(payment.requestedAt)}</span>
        </p>
      </div>
      {payment.resultDescription && (
        <p className={`mt-3 text-xs ${failed ? 'text-red-300' : 'text-dust'}`}>
          {payment.resultDescription}
        </p>
      )}
    </div>
  );
}

function OfferCard({ offer, pending, onAction }) {
  const id = offerId(offer);
  const status = offer.status;
  const isPaymentStage = status === 'verified' || status === 'paid';
  const paymentQuery = useQuery({
    queryKey: ['offer-payment', String(id)],
    queryFn: () =>
      paymentsApi
        .getForOffer(id)
        .then((response) => paymentFromResponse(response)),
    enabled: Boolean(id) && isPaymentStage,
    retry: (failureCount, error) => error.status !== 404 && failureCount < 1,
  });
  const payment = paymentQuery.data;
  const paymentMissing = paymentQuery.error?.status === 404;
  const canStartPayment =
    status === 'verified' &&
    !payment &&
    !paymentQuery.isPending &&
    (paymentMissing || !paymentQuery.error);
  const payoutDetailsConfirmed = Boolean(offer.paymentDetailsConfirmedAt);
  const directPayout = Number(offer.weighedKg) * Number(offer.agreedPricePerKg);
  const commissionAmount =
    (Number(offer.saleAmount) * Number(offer.commissionPercent)) / 100;
  const consignmentPayout = Number(offer.saleAmount) - commissionAmount;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <MonoText className="block break-all text-beeswax">
            {offer.reference || id}
          </MonoText>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {offer.cooperative?.name && (
              <p className="text-xs text-dust">{offer.cooperative.name}</p>
            )}
            {offer.farmer && !offer.farmer.isVerified && (
              <Badge variant="sold">Farmer unverified</Badge>
            )}
          </div>
        </div>
        <Badge variant={STATUS_VARIANTS[status] || 'default'}>
          {humanize(status)}
        </Badge>
      </div>

      <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Farmer" secondary={offer.farmer?.phone || 'No phone'}>
          {offer.farmer?.name || 'Farmer not available'}
        </Detail>
        <Detail
          label="Offered lot"
          secondary={`${formatKes(offer.expectedPricePerKg)} expected / kg`}
        >
          {formatNumber(offer.offeredKg)} kg
        </Detail>
        <Detail
          label="Trade"
          secondary={
            offer.tradeType === 'consignment'
              ? `${formatNumber(offer.commissionPercent)}% commission`
              : 'No cooperative commission'
          }
        >
          {humanize(offer.tradeType)}
        </Detail>
        <Detail
          label={offer.weighedKg != null ? 'Measured lot' : 'Offer expiry'}
          secondary={
            offer.weighedKg != null
              ? `${formatNumber(offer.moisturePercent, 1)}% moisture`
              : formatDate(offer.expiresAt, true)
          }
        >
          {offer.weighedKg != null
            ? `${formatNumber(offer.weighedKg)} kg`
            : offer.agreedPricePerKg != null
              ? `${formatKes(offer.agreedPricePerKg)} / kg agreed`
              : 'Awaiting intake'}
        </Detail>
      </dl>

      {offer.farmer && !offer.farmer.isVerified && (
        <div className="mt-5 rounded-md border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-200">
          This farmer is not yet verified. Payout remains blocked until the
          farmer is verified and has confirmed payout details with their PIN.
        </div>
      )}

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

      {offer.batchId && (
        <div className="mt-5 rounded-md border border-sage/25 bg-sage/10 p-4 text-sm text-dust">
          Included in batch{' '}
          <MonoText className="text-ivory">{offer.batchId}</MonoText>
        </div>
      )}

      {offer.tradeType === 'direct' && status === 'verified' && (
        <div className="mt-5 rounded-md border border-dust/15 bg-obsidian/40 p-4 text-sm text-dust">
          Direct payout estimate:{' '}
          <span className="font-medium text-ivory">
            {formatKes(directPayout)}
          </span>
          .
        </div>
      )}

      {offer.tradeType === 'consignment' && offer.saleAmount != null && (
        <div className="mt-5 rounded-md border border-dust/15 bg-obsidian/40 p-4 text-sm text-dust">
          Sale {formatKes(offer.saleAmount)} less {formatKes(commissionAmount)}{' '}
          commission. Estimated farmer payout:{' '}
          <span className="font-medium text-ivory">
            {formatKes(consignmentPayout)}
          </span>
          .
        </div>
      )}

      {isPaymentStage && !payoutDetailsConfirmed && !payment && (
        <div className="mt-5 rounded-md border border-beeswax/25 bg-beeswax/5 p-4 text-sm text-beeswax">
          Waiting for the farmer to PIN-confirm their payout details. Payment
          actions stay disabled until confirmation is recorded.
        </div>
      )}

      {paymentQuery.error && !paymentMissing && (
        <div
          role="alert"
          className="mt-5 rounded-md border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300"
        >
          Unable to load payout status: {paymentQuery.error.message}
        </div>
      )}

      <PaymentSummary payment={payment} />

      {TERMINAL_STATUSES.has(status) && (
        <p className="mt-5 border-t border-dust/10 pt-4 text-xs text-dust">
          {status === 'paid'
            ? 'Payout completed. This offer is closed.'
            : `This ${status} offer is closed and has no further actions.`}
        </p>
      )}

      {['offered', 'accepted', 'delivered', 'verified'].includes(status) && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-dust/10 pt-5">
          {status === 'offered' && (
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
          {status === 'accepted' && (
            <Button
              size="sm"
              onClick={() => onAction('delivery', offer)}
              disabled={pending}
            >
              Record delivery
            </Button>
          )}
          {status === 'delivered' && (
            <Button
              size="sm"
              onClick={() => onAction('verify', offer)}
              disabled={pending}
            >
              Verify lot
            </Button>
          )}
          {status === 'verified' && paymentQuery.isPending && (
            <p className="text-xs text-dust">Checking payout status...</p>
          )}
          {canStartPayment && offer.tradeType === 'direct' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction('payout', offer)}
              disabled={pending || !payoutDetailsConfirmed}
              title={
                payoutDetailsConfirmed
                  ? undefined
                  : 'Farmer PIN confirmation is required'
              }
            >
              Initiate payout
            </Button>
          )}
          {canStartPayment && offer.tradeType === 'consignment' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction('sold', offer)}
              disabled={pending || !payoutDetailsConfirmed}
              title={
                payoutDetailsConfirmed
                  ? undefined
                  : 'Farmer PIN confirmation is required'
              }
            >
              Mark sold and pay
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
  const [page, setPage] = useState(1);

  const offersQuery = useQuery({
    queryKey: ['harvest-offers', 'manage', page],
    queryFn: async () => {
      const response = await harvestOffersApi.list({ page, limit: 20 });
      const responseData = response.data;
      const data = responseData.data;
      return {
        offers: Array.isArray(data) ? data : data?.offers || [],
        pagination: responseData.pagination || data?.pagination || null,
      };
    },
  });

  const refreshOffers = () => {
    queryClient.invalidateQueries({ queryKey: ['harvest-offers'] });
  };

  const refreshOperationalData = (id, { batches = false } = {}) => {
    refreshOffers();
    queryClient.invalidateQueries({ queryKey: ['coop-stats'] });
    if (batches) {
      queryClient.invalidateQueries({ queryKey: ['my-batches'] });
    }
    if (id) {
      queryClient.invalidateQueries({
        queryKey: ['offer-payment', String(id)],
      });
    }
    queryClient.invalidateQueries({ queryKey: ['payments'] });
  };

  const closeWithSuccess = (message, id, options) => {
    refreshOperationalData(id, options);
    setAction(null);
    toast.success(message);
  };

  const showActionError = (error, id) => {
    const message = error.message || 'Unable to update the offer';
    const payment = error.data?.data?.payment;
    if (payment && id) {
      queryClient.setQueryData(['offer-payment', String(id)], payment);
    }
    setAction((current) =>
      current ? { ...current, error: message } : current
    );
    toast.error(message);
  };

  const acceptMutation = useMutation({
    mutationFn: ({ id, payload }) => harvestOffersApi.accept(id, payload),
    onSuccess: (_response, variables) =>
      closeWithSuccess('Harvest offer accepted', variables.id),
    onError: (error, variables) => showActionError(error, variables.id),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, payload }) => harvestOffersApi.reject(id, payload),
    onSuccess: (_response, variables) =>
      closeWithSuccess('Harvest offer rejected', variables.id),
    onError: (error, variables) => showActionError(error, variables.id),
  });

  const deliveryMutation = useMutation({
    mutationFn: ({ id, payload }) => harvestOffersApi.delivery(id, payload),
    onSuccess: (_response, variables) =>
      closeWithSuccess('Delivered lot measurements recorded', variables.id),
    onError: (error, variables) => showActionError(error, variables.id),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id }) => harvestOffersApi.verify(id),
    onSuccess: (_response, variables) =>
      closeWithSuccess(
        'Lot verified and ready for batch selection',
        variables.id,
        {
          batches: true,
        }
      ),
    onError: (error, variables) => showActionError(error, variables.id),
  });

  const payoutMutation = useMutation({
    mutationFn: ({ id, payload }) => paymentsApi.initiatePayout(id, payload),
    onSuccess: (response, variables) => {
      const payment = paymentFromResponse(response);
      if (payment) {
        queryClient.setQueryData(
          ['offer-payment', String(variables.id)],
          payment
        );
      }
      closeWithSuccess('Direct payout submitted', variables.id);
    },
    onError: (error, variables) => showActionError(error, variables.id),
  });

  const soldMutation = useMutation({
    mutationFn: ({ id, payload }) => harvestOffersApi.sold(id, payload),
    onSuccess: (response, variables) => {
      const payment = paymentFromResponse(response);
      if (payment) {
        queryClient.setQueryData(
          ['offer-payment', String(variables.id)],
          payment
        );
      }
      closeWithSuccess(
        'Consignment sale recorded and payout submitted',
        variables.id
      );
    },
    onError: (error, variables) => showActionError(error, variables.id),
  });

  const pending =
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    deliveryMutation.isPending ||
    verifyMutation.isPending ||
    payoutMutation.isPending ||
    soldMutation.isPending;
  const offers = offersQuery.data?.offers || [];
  const pagination = offersQuery.data?.pagination;

  const openAction = (type, offer) => setAction({ type, offer, error: '' });
  const actionId = action ? offerId(action.offer) : null;

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

      {!offersQuery.isLoading && !offersQuery.error && offers.length === 0 && (
        <Card>
          <EmptyState
            title="No harvest offers"
            description="Farmer offers assigned to this cooperative will appear here for intake review."
          />
        </Card>
      )}

      {offers.length > 0 && (
        <div className="space-y-4">
          {offers.map((offer, index) => (
            <OfferCard
              key={offerId(offer) || offer.reference || index}
              offer={offer}
              pending={pending}
              onAction={openAction}
            />
          ))}
        </div>
      )}

      {pagination?.totalPages > 1 && (
        <nav
          className="mt-6 flex items-center justify-between gap-4"
          aria-label="Harvest offer pages"
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || offersQuery.isFetching}
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
            disabled={page >= pagination.totalPages || offersQuery.isFetching}
          >
            Next
          </Button>
        </nav>
      )}

      {action?.type === 'accept' && (
        <AcceptOfferModal
          offer={action.offer}
          pending={acceptMutation.isPending}
          serverError={action.error}
          onClose={() => setAction(null)}
          onSubmit={(payload) =>
            acceptMutation.mutate({ id: actionId, payload })
          }
        />
      )}
      {action?.type === 'reject' && (
        <RejectOfferModal
          offer={action.offer}
          pending={rejectMutation.isPending}
          serverError={action.error}
          onClose={() => setAction(null)}
          onSubmit={(payload) =>
            rejectMutation.mutate({ id: actionId, payload })
          }
        />
      )}
      {action?.type === 'delivery' && (
        <DeliveryOfferModal
          offer={action.offer}
          pending={deliveryMutation.isPending}
          serverError={action.error}
          onClose={() => setAction(null)}
          onSubmit={(payload) =>
            deliveryMutation.mutate({ id: actionId, payload })
          }
        />
      )}
      {action?.type === 'verify' && (
        <VerifyOfferModal
          offer={action.offer}
          pending={verifyMutation.isPending}
          serverError={action.error}
          onClose={() => setAction(null)}
          onSubmit={() => verifyMutation.mutate({ id: actionId })}
        />
      )}
      {action?.type === 'payout' && (
        <PayoutOfferModal
          offer={action.offer}
          pending={payoutMutation.isPending}
          serverError={action.error}
          onClose={() => setAction(null)}
          onSubmit={(payload) =>
            payoutMutation.mutate({ id: actionId, payload })
          }
        />
      )}
      {action?.type === 'sold' && (
        <MarkSoldModal
          offer={action.offer}
          pending={soldMutation.isPending}
          serverError={action.error}
          onClose={() => setAction(null)}
          onSubmit={(payload) => soldMutation.mutate({ id: actionId, payload })}
        />
      )}
    </section>
  );
}
