import { useState } from 'react';
import Button from './ui/Button';
import Modal from './ui/Modal';

const PAYMENT_REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9._:-]*$/i;
const INPUT_CLASS =
  'w-full rounded-md border border-dust/20 bg-obsidian px-4 py-3 text-ivory placeholder:text-dust/50 transition-colors focus:border-beeswax focus:outline-none';
const LABEL_CLASS = 'mb-2 block text-sm text-dust';

function formatKes(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Not available';

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(value, maximumFractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not available';
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits }).format(
    number
  );
}

function validateReference(value) {
  if (!value || value.length > 80 || !PAYMENT_REFERENCE_PATTERN.test(value)) {
    return 'Reference is required and may use letters, numbers, dot, underscore, colon, or hyphen';
  }
  return '';
}

function ErrorNotice({ localError, serverError }) {
  const message = localError || serverError;
  if (!message) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
    >
      {message}
    </div>
  );
}

function ModalActions({ onClose, pending, submitLabel, pendingLabel }) {
  return (
    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
      <Button
        type="button"
        variant="ghost"
        onClick={onClose}
        disabled={pending}
        className="flex-1"
      >
        Cancel
      </Button>
      <Button type="submit" disabled={pending} className="flex-1">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}

export function AcceptOfferModal({
  offer,
  onClose,
  onSubmit,
  pending,
  serverError,
}) {
  const isDirect = offer.tradeType === 'direct';
  const [agreedPricePerKg, setAgreedPricePerKg] = useState(
    String(
      offer.agreedPricePerKg ??
        (isDirect ? (offer.expectedPricePerKg ?? '') : '')
    )
  );
  const [error, setError] = useState('');

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    const priceValue = agreedPricePerKg.trim();
    if (isDirect && !priceValue) {
      setError('An agreed price is required for a direct purchase');
      return;
    }

    const price = priceValue ? Number(priceValue) : null;
    if (priceValue && (!Number.isFinite(price) || price <= 0)) {
      setError('Agreed price must be greater than KES 0 when supplied');
      return;
    }

    onSubmit(priceValue ? { agreedPricePerKg: price } : {});
  };

  return (
    <Modal isOpen onClose={handleClose} title="Accept harvest offer">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm leading-6 text-dust">
          Accept{' '}
          <span className="font-mono text-ivory">
            {offer.reference || offer.id}
          </span>{' '}
          as a {isDirect ? 'direct purchase' : 'consignment'}.
        </p>

        {!isDirect && (
          <div className="rounded-md border border-beeswax/20 bg-beeswax/5 p-4 text-sm leading-6 text-dust">
            The cooperative commission is fixed at{' '}
            <span className="font-medium text-ivory">
              {formatNumber(offer.commissionPercent)}%
            </span>
            . A price can be noted now, but the farmer payout is based on the
            later recorded sale amount.
          </div>
        )}

        <ErrorNotice localError={error} serverError={serverError} />

        <div>
          <label htmlFor="offer-agreed-price" className={LABEL_CLASS}>
            Agreed price / kg (KES) {isDirect ? '*' : '(optional)'}
          </label>
          <input
            id="offer-agreed-price"
            type="number"
            value={agreedPricePerKg}
            onChange={(event) => setAgreedPricePerKg(event.target.value)}
            min="0.01"
            step="0.01"
            className={INPUT_CLASS}
            required={isDirect}
          />
        </div>

        <ModalActions
          onClose={handleClose}
          pending={pending}
          submitLabel="Accept offer"
          pendingLabel="Accepting..."
        />
      </form>
    </Modal>
  );
}

export function RejectOfferModal({
  offer,
  onClose,
  onSubmit,
  pending,
  serverError,
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError('A rejection reason is required');
      return;
    }

    setError('');
    onSubmit({ reason: normalizedReason });
  };

  return (
    <Modal isOpen onClose={handleClose} title="Reject harvest offer">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm leading-6 text-dust">
          Explain why{' '}
          <span className="font-mono text-ivory">
            {offer.reference || offer.id}
          </span>{' '}
          cannot be accepted. The farmer can use this reason to correct a future
          offer.
        </p>

        <ErrorNotice localError={error} serverError={serverError} />

        <div>
          <label htmlFor="offer-rejection-reason" className={LABEL_CLASS}>
            Rejection reason *
          </label>
          <textarea
            id="offer-rejection-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows="4"
            maxLength="500"
            placeholder="Explain the intake issue clearly"
            className={`${INPUT_CLASS} resize-y`}
            required
          />
        </div>

        <ModalActions
          onClose={handleClose}
          pending={pending}
          submitLabel="Reject offer"
          pendingLabel="Rejecting..."
        />
      </form>
    </Modal>
  );
}

export function DeliveryOfferModal({
  offer,
  onClose,
  onSubmit,
  pending,
  serverError,
}) {
  const [form, setForm] = useState({
    weighedKg: String(offer.weighedKg ?? offer.offeredKg ?? ''),
    moisturePercent: String(offer.moisturePercent ?? ''),
  });
  const [error, setError] = useState('');

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    const weighedKg = Number(form.weighedKg);
    const moisturePercent = Number(form.moisturePercent);
    if (!Number.isFinite(weighedKg) || weighedKg <= 0 || weighedKg > 10000) {
      setError('Measured weight must be greater than 0 and at most 10,000 kg');
      return;
    }
    if (
      !Number.isFinite(moisturePercent) ||
      moisturePercent <= 0 ||
      moisturePercent >= 100
    ) {
      setError('Moisture must be greater than 0 and less than 100%');
      return;
    }

    onSubmit({ weighedKg, moisturePercent });
  };

  return (
    <Modal isOpen onClose={handleClose} title="Record delivered lot">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm leading-6 text-dust">
          Enter the measurements taken when{' '}
          <span className="font-mono text-ivory">
            {offer.reference || offer.id}
          </span>{' '}
          arrived. These measurements will later be aggregated into a batch.
        </p>

        <ErrorNotice localError={error} serverError={serverError} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="offer-weighed-kg" className={LABEL_CLASS}>
              Actual weighed kg *
            </label>
            <input
              id="offer-weighed-kg"
              type="number"
              value={form.weighedKg}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  weighedKg: event.target.value,
                }))
              }
              min="0.01"
              max="10000"
              step="0.01"
              className={INPUT_CLASS}
              required
            />
          </div>
          <div>
            <label htmlFor="offer-moisture" className={LABEL_CLASS}>
              Moisture % *
            </label>
            <input
              id="offer-moisture"
              type="number"
              value={form.moisturePercent}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  moisturePercent: event.target.value,
                }))
              }
              min="0.1"
              max="99.9"
              step="0.1"
              className={INPUT_CLASS}
              required
            />
          </div>
        </div>

        <ModalActions
          onClose={handleClose}
          pending={pending}
          submitLabel="Record delivery"
          pendingLabel="Recording..."
        />
      </form>
    </Modal>
  );
}

export function VerifyOfferModal({
  offer,
  onClose,
  onSubmit,
  pending,
  serverError,
}) {
  const handleClose = () => {
    if (!pending) onClose();
  };

  return (
    <Modal isOpen onClose={handleClose} title="Verify delivered lot">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="space-y-5"
      >
        <div className="rounded-md border border-sage/25 bg-sage/10 p-4 text-sm leading-6 text-dust">
          Confirm that{' '}
          <span className="font-mono text-ivory">
            {offer.reference || offer.id}
          </span>{' '}
          was inspected at {formatNumber(offer.weighedKg)} kg and{' '}
          {formatNumber(offer.moisturePercent, 1)}% moisture.
        </div>
        <p className="text-sm leading-6 text-dust">
          This verifies the individual lot only. It does not create a blockchain
          batch; verified lots are selected and aggregated when a batch is
          registered later.
        </p>

        <ErrorNotice serverError={serverError} />

        <ModalActions
          onClose={handleClose}
          pending={pending}
          submitLabel="Verify lot"
          pendingLabel="Verifying..."
        />
      </form>
    </Modal>
  );
}

export function PayoutOfferModal({
  offer,
  onClose,
  onSubmit,
  pending,
  serverError,
}) {
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const payoutEstimate =
    Number(offer.weighedKg) * Number(offer.agreedPricePerKg);

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    if (!offer.paymentDetailsConfirmedAt) {
      setError('The farmer must PIN-confirm payout details before payout');
      return;
    }
    const normalizedReference = reference.trim();
    const referenceError = validateReference(normalizedReference);
    if (referenceError) {
      setError(referenceError);
      return;
    }

    onSubmit({ reference: normalizedReference });
  };

  return (
    <Modal isOpen onClose={handleClose} title="Initiate direct payout">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-md border border-beeswax/20 bg-beeswax/5 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-dust">
            Estimated payout
          </p>
          <p className="mt-2 font-display text-2xl text-beeswax">
            {formatKes(payoutEstimate)}
          </p>
          <p className="mt-1 text-xs text-dust">
            {formatNumber(offer.weighedKg)} kg at{' '}
            {formatKes(offer.agreedPricePerKg)} per kg. The backend determines
            the final whole-shilling payout.
          </p>
        </div>

        <ErrorNotice localError={error} serverError={serverError} />

        <div>
          <label htmlFor="direct-payout-reference" className={LABEL_CLASS}>
            Unique payout reference *
          </label>
          <input
            id="direct-payout-reference"
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength="80"
            placeholder="PAY-2026-001"
            className={`${INPUT_CLASS} font-mono`}
            autoComplete="off"
            required
          />
        </div>

        <ModalActions
          onClose={handleClose}
          pending={pending}
          submitLabel="Initiate payout"
          pendingLabel="Submitting..."
        />
      </form>
    </Modal>
  );
}

export function MarkSoldModal({
  offer,
  onClose,
  onSubmit,
  pending,
  serverError,
}) {
  const [form, setForm] = useState({
    saleAmount: String(offer.saleAmount ?? ''),
    reference: '',
  });
  const [error, setError] = useState('');
  const saleAmount = Number(form.saleAmount);
  const commissionPercent = Number(offer.commissionPercent);
  const commissionAmount =
    Number.isFinite(saleAmount) && Number.isFinite(commissionPercent)
      ? (saleAmount * commissionPercent) / 100
      : 0;
  const payoutEstimate = saleAmount - commissionAmount;

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    if (!offer.paymentDetailsConfirmedAt) {
      setError('The farmer must PIN-confirm payout details before payout');
      return;
    }
    if (!Number.isFinite(saleAmount) || saleAmount <= 0) {
      setError('Sale amount must be greater than KES 0');
      return;
    }
    if (!Number.isFinite(payoutEstimate) || payoutEstimate <= 0) {
      setError('The sale must leave a positive payout after commission');
      return;
    }
    const reference = form.reference.trim();
    const referenceError = validateReference(reference);
    if (referenceError) {
      setError(referenceError);
      return;
    }

    onSubmit({ saleAmount, reference });
  };

  return (
    <Modal isOpen onClose={handleClose} title="Record consignment sale">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm leading-6 text-dust">
          Record the final sale for{' '}
          <span className="font-mono text-ivory">
            {offer.reference || offer.id}
          </span>
          . Saving the sale also initiates the farmer payout.
        </p>

        <ErrorNotice localError={error} serverError={serverError} />

        <div>
          <label htmlFor="consignment-sale-amount" className={LABEL_CLASS}>
            Sale amount (KES) *
          </label>
          <input
            id="consignment-sale-amount"
            type="number"
            value={form.saleAmount}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                saleAmount: event.target.value,
              }))
            }
            min="0.01"
            step="0.01"
            readOnly={offer.saleAmount != null}
            className={INPUT_CLASS}
            required
          />
        </div>

        <div className="grid gap-3 rounded-md border border-dust/15 bg-obsidian/50 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-dust">Commission rate</p>
            <p className="mt-1 text-sm font-medium text-ivory">
              {formatNumber(offer.commissionPercent)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-dust">Commission</p>
            <p className="mt-1 text-sm font-medium text-ivory">
              {formatKes(Math.max(commissionAmount, 0))}
            </p>
          </div>
          <div>
            <p className="text-xs text-dust">Payout estimate</p>
            <p className="mt-1 text-sm font-medium text-beeswax">
              {formatKes(Math.max(payoutEstimate, 0))}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="consignment-payout-reference" className={LABEL_CLASS}>
            Unique payout reference *
          </label>
          <input
            id="consignment-payout-reference"
            type="text"
            value={form.reference}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                reference: event.target.value,
              }))
            }
            maxLength="80"
            placeholder="SALE-2026-001"
            className={`${INPUT_CLASS} font-mono`}
            autoComplete="off"
            required
          />
        </div>

        <ModalActions
          onClose={handleClose}
          pending={pending}
          submitLabel="Record sale and pay"
          pendingLabel="Submitting..."
        />
      </form>
    </Modal>
  );
}
