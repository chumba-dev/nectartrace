import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { batchesApi, harvestOffersApi } from '../lib/api';

const BATCH_ID_PATTERN = /^BAR-\d{4}-\d{3}$/;

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10)
  );
}

function offersFromResponse(response) {
  const data = response.data.data;
  return Array.isArray(data) ? data : data?.offers || [];
}

function offerId(offer) {
  return offer.id ?? offer._id;
}

function formatNumber(value, maximumFractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not set';
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits }).format(
    number
  );
}

export default function BatchRegisterModal({ isOpen, onClose }) {
  const queryClient = useQueryClient();
  const initialForm = () => ({
    batchId: '',
    village: '',
    harvestDate: new Date().toISOString().slice(0, 10),
    pricePerKg: '',
  });
  const [form, setForm] = useState(initialForm);
  const [selectedOfferIds, setSelectedOfferIds] = useState([]);
  const [error, setError] = useState('');

  const eligibleOffersQuery = useQuery({
    queryKey: ['harvest-offers', 'batch-eligible'],
    enabled: isOpen,
    queryFn: async () => {
      const firstResponse = await harvestOffersApi.list({
        status: 'verified',
        page: 1,
        limit: 100,
      });
      const totalPages = firstResponse.data.pagination?.totalPages || 1;
      const remainingResponses = await Promise.all(
        Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
          harvestOffersApi.list({
            status: 'verified',
            page: index + 2,
            limit: 100,
          })
        )
      );
      return [firstResponse, ...remainingResponses]
        .flatMap(offersFromResponse)
        .filter(
          (offer) =>
            offer.status === 'verified' &&
            !offer.batchId &&
            Boolean(offerId(offer))
        );
    },
  });

  const resetForm = () => {
    setForm(initialForm());
    setSelectedOfferIds([]);
    setError('');
  };

  const mutation = useMutation({
    mutationFn: (data) => batchesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['harvest-offers'] });
      queryClient.invalidateQueries({ queryKey: ['my-batches'] });
      queryClient.invalidateQueries({ queryKey: ['coop-stats'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast.success('Batch registered from verified lots');
      resetForm();
      onClose();
    },
    onError: (err) => {
      if (err.message?.includes('not linked to a cooperative')) {
        setError(
          'Your account needs to be linked to a cooperative. Contact your admin.'
        );
      } else {
        setError(err.message || 'Failed to register batch');
      }
    },
  });

  const eligibleOffers = eligibleOffersQuery.data || [];
  const selectedOffers = eligibleOffers.filter((offer) =>
    selectedOfferIds.includes(String(offerId(offer)))
  );
  const totalWeight = selectedOffers.reduce(
    (sum, offer) => sum + Number(offer.weighedKg || 0),
    0
  );
  const weightedMoisture =
    totalWeight > 0
      ? selectedOffers.reduce(
          (sum, offer) =>
            sum +
            Number(offer.weighedKg || 0) * Number(offer.moisturePercent || 0),
          0
        ) / totalWeight
      : 0;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === 'batchId' ? value.toUpperCase() : value,
    }));
  };

  const toggleOffer = (id) => {
    setSelectedOfferIds((current) =>
      current.includes(id)
        ? current.filter((offerIdValue) => offerIdValue !== id)
        : [...current, id]
    );
    setError('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    if (!BATCH_ID_PATTERN.test(form.batchId)) {
      setError('Batch ID must match BAR-YYYY-NNN exactly');
      return;
    }

    const village = form.village.trim();
    if (!village || village.length > 120) {
      setError('Village is required and must not exceed 120 characters');
      return;
    }

    if (!isValidDate(form.harvestDate)) {
      setError('Enter a valid harvest date that is not in the future');
      return;
    }

    const priceValue = form.pricePerKg.trim();
    const price = priceValue ? Number(priceValue) : null;
    if (priceValue && (!Number.isFinite(price) || price <= 0)) {
      setError('Price per kg must be greater than 0 when supplied');
      return;
    }

    if (selectedOfferIds.length === 0) {
      setError('Select at least one verified lot for this batch');
      return;
    }

    mutation.mutate({
      batchId: form.batchId,
      village,
      harvestDate: form.harvestDate,
      offerIds: selectedOfferIds,
      ...(priceValue && { pricePerKg: price }),
    });
  };

  const handleClose = () => {
    if (mutation.isPending) return;
    resetForm();
    onClose();
  };

  const inputClass =
    'w-full rounded-md border border-dust/20 bg-obsidian px-4 py-3 text-ivory placeholder:text-dust/50 transition-colors focus:border-beeswax focus:outline-none';
  const labelClass = 'mb-2 block text-sm text-dust';
  const noEligibleOffers =
    !eligibleOffersQuery.isLoading &&
    !eligibleOffersQuery.error &&
    eligibleOffers.length === 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Register new batch">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="batch-id" className={labelClass}>
            Batch ID *
          </label>
          <input
            id="batch-id"
            type="text"
            name="batchId"
            value={form.batchId}
            onChange={handleChange}
            placeholder="BAR-2026-002"
            className={`${inputClass} font-mono`}
            pattern="BAR-[0-9]{4}-[0-9]{3}"
            title="Use the exact format BAR-YYYY-NNN"
            maxLength={12}
            autoCapitalize="characters"
            spellCheck="false"
            required
          />
          <p className="mt-1.5 text-xs text-dust">
            Required and unique. Exact format: BAR-YYYY-NNN.
          </p>
        </div>

        <div>
          <label htmlFor="batch-village" className={labelClass}>
            Village *
          </label>
          <input
            id="batch-village"
            type="text"
            name="village"
            value={form.village}
            onChange={handleChange}
            placeholder="Kabarnet"
            maxLength="120"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="batch-harvest-date" className={labelClass}>
            Harvest date *
          </label>
          <input
            id="batch-harvest-date"
            type="date"
            name="harvestDate"
            value={form.harvestDate}
            onChange={handleChange}
            max={new Date().toISOString().slice(0, 10)}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label htmlFor="batch-price" className={labelClass}>
            Price per kg (KES)
          </label>
          <input
            id="batch-price"
            type="number"
            name="pricePerKg"
            value={form.pricePerKg}
            onChange={handleChange}
            placeholder="700"
            step="0.01"
            min="0.01"
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-dust">
            Optional. If supplied, it must be greater than 0.
          </p>
        </div>

        <fieldset>
          <legend className={labelClass}>Verified lots *</legend>

          {eligibleOffersQuery.isLoading && (
            <div className="rounded-md border border-dust/15 bg-obsidian/40 p-4 text-sm text-dust">
              Loading verified, unbatched lots...
            </div>
          )}

          {eligibleOffersQuery.error && (
            <div
              role="alert"
              className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
            >
              Unable to load verified lots: {eligibleOffersQuery.error.message}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 block"
                onClick={() => eligibleOffersQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          )}

          {noEligibleOffers && (
            <div className="rounded-md border border-beeswax/25 bg-beeswax/5 p-4 text-sm leading-6 text-dust">
              No verified lots are ready. First accept an offer, record its
              delivery measurements, and verify the lot. It will then appear
              here for batch aggregation.
            </div>
          )}

          {eligibleOffers.length > 0 && (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-dust/15 bg-obsidian/30 p-2">
              {eligibleOffers.map((offer) => {
                const id = String(offerId(offer));
                const checkboxId = `batch-offer-${id}`;
                return (
                  <label
                    key={id}
                    htmlFor={checkboxId}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent p-3 transition-colors hover:border-dust/20 hover:bg-stone/60"
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={selectedOfferIds.includes(id)}
                      onChange={() => toggleOffer(id)}
                      className="mt-1 h-4 w-4 shrink-0 accent-beeswax"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="truncate font-medium text-ivory">
                          {offer.farmer?.name || 'Unknown farmer'}
                        </span>
                        <span className="font-mono text-xs text-beeswax">
                          {offer.reference || id}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-dust">
                        {formatNumber(offer.weighedKg)} kg |{' '}
                        {formatNumber(offer.moisturePercent, 1)}% moisture
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        {selectedOffers.length > 0 && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-sage/20 bg-sage/5 p-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-dust">
                Preview weight
              </p>
              <p className="mt-1 font-display text-xl text-ivory">
                {formatNumber(totalWeight, 3)} kg
              </p>
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-dust">
                Weighted moisture
              </p>
              <p className="mt-1 font-display text-xl text-ivory">
                {formatNumber(weightedMoisture, 2)}%
              </p>
            </div>
            <p className="col-span-2 text-xs text-dust">
              Preview only. The backend recalculates both values from the
              selected verified lots.
            </p>
          </div>
        )}

        <div className="rounded-md border border-dust/10 bg-obsidian/50 p-4 text-xs text-dust">
          The batch aggregates only the selected verified lots. Its aggregate
          measurements and lot commitment are then recorded on-chain; farmer and
          payment details are not included.
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={mutation.isPending}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              mutation.isPending ||
              eligibleOffersQuery.isLoading ||
              Boolean(eligibleOffersQuery.error) ||
              noEligibleOffers
            }
            className="flex-1"
          >
            {mutation.isPending ? 'Recording on-chain...' : 'Register batch'}
          </Button>
        </div>

        {mutation.isPending && (
          <p className="text-center text-xs text-dust">
            The aggregate blockchain record can take several seconds. Please
            wait.
          </p>
        )}
      </form>
    </Modal>
  );
}
