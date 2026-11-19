import { useState } from 'react';
import Button from './ui/Button';
import Modal from './ui/Modal';

const BATCH_ID_PATTERN = /^BAR-\d{4}-\d{3}$/;
const MOISTURE_PATTERN = /^\d+(?:\.\d)?$/;
const INPUT_CLASS =
  'w-full rounded-md border border-dust/20 bg-obsidian px-4 py-3 text-ivory placeholder:text-dust/50 transition-colors focus:border-beeswax focus:outline-none';
const LABEL_CLASS = 'mb-2 block text-sm text-dust';

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10)
  );
}

function formatKes(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'KES 0.00';

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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

export function AcceptOfferModal({ offer, onClose, onSubmit, pending }) {
  const [form, setForm] = useState({
    acceptedWeightKg: String(
      offer.acceptedWeightKg ?? offer.offeredWeightKg ?? ''
    ),
    agreedPricePerKg: String(
      offer.agreedPricePerKg ?? offer.expectedPricePerKg ?? ''
    ),
  });
  const [error, setError] = useState('');

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    const acceptedWeightKg = Number(form.acceptedWeightKg);
    const agreedPricePerKg = Number(form.agreedPricePerKg);
    if (!Number.isFinite(acceptedWeightKg) || acceptedWeightKg <= 0) {
      setError('Accepted weight must be greater than 0 kg');
      return;
    }
    if (!Number.isFinite(agreedPricePerKg) || agreedPricePerKg <= 0) {
      setError('Agreed price must be greater than KES 0');
      return;
    }

    onSubmit({
      status: 'ACCEPTED',
      acceptedWeightKg,
      agreedPricePerKg,
    });
  };

  return (
    <Modal isOpen onClose={handleClose} title="Accept harvest offer">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm leading-6 text-dust">
          Confirm the intake terms for{' '}
          <span className="font-mono text-ivory">
            {offer.reference || offer.id}
          </span>
          .
        </p>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Accepted weight (kg) *</label>
            <input
              type="number"
              value={form.acceptedWeightKg}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  acceptedWeightKg: event.target.value,
                }))
              }
              min="0.01"
              step="0.01"
              className={INPUT_CLASS}
              required
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Agreed price / kg (KES) *</label>
            <input
              type="number"
              value={form.agreedPricePerKg}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  agreedPricePerKg: event.target.value,
                }))
              }
              min="0.01"
              step="0.01"
              className={INPUT_CLASS}
              required
            />
          </div>
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

export function RejectOfferModal({ offer, onClose, onSubmit, pending }) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const reason = rejectionReason.trim();
    if (!reason) {
      setError('A rejection reason is required');
      return;
    }

    setError('');
    onSubmit({ status: 'REJECTED', rejectionReason: reason });
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

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className={LABEL_CLASS}>Rejection reason *</label>
          <textarea
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
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

export function VerifyOfferModal({ offer, onClose, onSubmit, pending }) {
  const [form, setForm] = useState({
    batchId: '',
    village: '',
    harvestDate: new Date().toISOString().slice(0, 10),
    moisturePercent: '',
    weightKg: String(offer.acceptedWeightKg ?? offer.offeredWeightKg ?? ''),
    pricePerKg: String(
      offer.agreedPricePerKg ?? offer.expectedPricePerKg ?? ''
    ),
  });
  const [error, setError] = useState('');

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === 'batchId' ? value.toUpperCase() : value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    if (!BATCH_ID_PATTERN.test(form.batchId)) {
      setError('Batch ID must match BAR-YYYY-NNN exactly');
      return;
    }

    const village = form.village.trim();
    if (!village) {
      setError('Village is required');
      return;
    }

    if (!isValidDate(form.harvestDate)) {
      setError('Enter a valid harvest date that is not in the future');
      return;
    }

    const moistureValue = form.moisturePercent.trim();
    const moisturePercent = Number(moistureValue);
    if (
      !MOISTURE_PATTERN.test(moistureValue) ||
      !Number.isFinite(moisturePercent) ||
      moisturePercent <= 0 ||
      moisturePercent >= 100
    ) {
      setError(
        'Moisture must be greater than 0 and less than 100, with at most one decimal place'
      );
      return;
    }

    const weightKg = Number(form.weightKg);
    if (!Number.isInteger(weightKg) || weightKg < 1) {
      setError('Weight must be a whole number of kilograms, at least 1 kg');
      return;
    }

    const priceValue = form.pricePerKg.trim();
    const pricePerKg = priceValue ? Number(priceValue) : null;
    if (priceValue && (!Number.isFinite(pricePerKg) || pricePerKg <= 0)) {
      setError('Price per kg must be greater than 0 when supplied');
      return;
    }

    const payload = {
      batchId: form.batchId,
      village,
      harvestDate: form.harvestDate,
      moisturePercent,
      weightKg,
    };
    if (priceValue) payload.pricePerKg = pricePerKg;
    onSubmit(payload);
  };

  return (
    <Modal isOpen onClose={handleClose} title="Verify received harvest">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-md border border-beeswax/20 bg-beeswax/5 p-4 text-sm leading-6 text-dust">
          Verification creates the traceable batch for{' '}
          <span className="font-mono text-ivory">
            {offer.reference || offer.id}
          </span>
          . Batch details cannot be casually changed after recording.
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className={LABEL_CLASS}>Batch ID *</label>
          <input
            type="text"
            name="batchId"
            value={form.batchId}
            onChange={handleChange}
            placeholder="BAR-2026-002"
            pattern="BAR-[0-9]{4}-[0-9]{3}"
            title="Use the exact format BAR-YYYY-NNN"
            maxLength="12"
            autoCapitalize="characters"
            spellCheck="false"
            className={`${INPUT_CLASS} font-mono`}
            required
          />
          <p className="mt-1.5 text-xs text-dust">
            Required and unique. Exact format: BAR-YYYY-NNN.
          </p>
        </div>

        <div>
          <label className={LABEL_CLASS}>Village *</label>
          <input
            type="text"
            name="village"
            value={form.village}
            onChange={handleChange}
            placeholder="Kabarnet"
            className={INPUT_CLASS}
            required
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Harvest date *</label>
          <input
            type="date"
            name="harvestDate"
            value={form.harvestDate}
            onChange={handleChange}
            max={new Date().toISOString().slice(0, 10)}
            className={INPUT_CLASS}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Moisture % *</label>
            <input
              type="number"
              name="moisturePercent"
              value={form.moisturePercent}
              onChange={handleChange}
              min="0.1"
              max="99.9"
              step="0.1"
              placeholder="18.5"
              className={INPUT_CLASS}
              required
            />
            <p className="mt-1.5 text-xs text-dust">
              Greater than 0, less than 100; one decimal maximum.
            </p>
          </div>
          <div>
            <label className={LABEL_CLASS}>Weight (kg) *</label>
            <input
              type="number"
              name="weightKg"
              value={form.weightKg}
              onChange={handleChange}
              min="1"
              step="1"
              className={INPUT_CLASS}
              required
            />
            <p className="mt-1.5 text-xs text-dust">
              Whole kilograms only; minimum 1 kg.
            </p>
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Price per kg (KES)</label>
          <input
            type="number"
            name="pricePerKg"
            value={form.pricePerKg}
            onChange={handleChange}
            min="0.01"
            step="0.01"
            className={INPUT_CLASS}
          />
          <p className="mt-1.5 text-xs text-dust">
            Optional. If supplied, it must be greater than 0.
          </p>
        </div>

        <ModalActions
          onClose={handleClose}
          pending={pending}
          submitLabel="Verify and create batch"
          pendingLabel="Recording on-chain..."
        />
        {pending && (
          <p className="text-center text-xs text-dust">
            Blockchain verification can take several seconds. Keep this modal
            open.
          </p>
        )}
      </form>
    </Modal>
  );
}

export function SettlementModal({ offer, onClose, onSubmit, pending }) {
  const existing = offer.settlement;
  const isConsignment = offer.settlementType === 'CONSIGNMENT';
  const purchaseGross =
    Number(offer.acceptedWeightKg) * Number(offer.agreedPricePerKg);
  const authoritativeGross = isConsignment
    ? Number(offer.deliveredSalesAmount)
    : purchaseGross;
  const [form, setForm] = useState({
    grossAmount: String(
      existing?.grossAmount ??
        (Number.isFinite(authoritativeGross) && authoritativeGross > 0
          ? authoritativeGross
          : '')
    ),
    commissionAmount: String(
      isConsignment ? (existing?.commissionAmount ?? 0) : 0
    ),
    amountPaid: String(existing?.amountPaid ?? ''),
    paymentReference: existing?.paymentReference || '',
  });
  const [error, setError] = useState('');

  const gross = Number(form.grossAmount);
  const commission = Number(form.commissionAmount);
  const net =
    Number.isFinite(gross) && Number.isFinite(commission)
      ? gross - commission
      : 0;

  const handleClose = () => {
    if (!pending) onClose();
  };

  const handleChange = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    const grossAmount = Number(form.grossAmount);
    const commissionAmount = Number(form.commissionAmount);
    const amountPaid = Number(form.amountPaid);

    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
      setError('Gross amount must be greater than 0');
      return;
    }
    if (!Number.isFinite(commissionAmount) || commissionAmount < 0) {
      setError('Commission cannot be negative');
      return;
    }
    if (commissionAmount > grossAmount) {
      setError('Commission cannot exceed the gross amount');
      return;
    }
    if (!isConsignment && commissionAmount !== 0) {
      setError('Direct purchases cannot deduct a commission');
      return;
    }
    if (!Number.isFinite(amountPaid) || amountPaid < 0) {
      setError('Amount paid cannot be negative');
      return;
    }
    if (amountPaid > grossAmount - commissionAmount) {
      setError('Amount paid cannot exceed the calculated net amount');
      return;
    }

    const paymentReference = form.paymentReference.trim();
    const payload = { grossAmount, commissionAmount, amountPaid };
    if (paymentReference || existing?.paymentReference) {
      payload.paymentReference = paymentReference;
    }
    onSubmit(payload);
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title={existing ? 'Update settlement' : 'Record settlement'}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm leading-6 text-dust">
          Record the payment position for{' '}
          <span className="font-mono text-ivory">
            {offer.reference || offer.id}
          </span>
          .{' '}
          {isConsignment
            ? 'Gross revenue comes from delivered marketplace orders.'
            : 'Direct purchases pay the agreed amount without commission.'}
        </p>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Gross amount (KES) *</label>
            <input
              type="number"
              name="grossAmount"
              value={form.grossAmount}
              onChange={handleChange}
              min="0.01"
              step="0.01"
              readOnly
              className={INPUT_CLASS}
              required
            />
            <p className="mt-1.5 text-xs text-dust">
              {isConsignment
                ? 'Calculated from delivered marketplace orders.'
                : 'Calculated from accepted weight and agreed price.'}
            </p>
          </div>
          <div>
            <label className={LABEL_CLASS}>Commission (KES) *</label>
            <input
              type="number"
              name="commissionAmount"
              value={form.commissionAmount}
              onChange={handleChange}
              min="0"
              step="0.01"
              disabled={!isConsignment}
              className={INPUT_CLASS}
              required
            />
            {!isConsignment && (
              <p className="mt-1.5 text-xs text-dust">
                Direct cooperative purchases do not deduct commission.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-dust/15 bg-obsidian/50 p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-dust">
            Calculated net
          </p>
          <p className="mt-1 font-display text-2xl text-beeswax">
            {formatKes(Math.max(net, 0))}
          </p>
          <p className="mt-1 text-xs text-dust">Gross less commission</p>
        </div>

        <div>
          <label className={LABEL_CLASS}>Amount paid (KES) *</label>
          <input
            type="number"
            name="amountPaid"
            value={form.amountPaid}
            onChange={handleChange}
            min="0"
            step="0.01"
            className={INPUT_CLASS}
            required
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Payment reference</label>
          <input
            type="text"
            name="paymentReference"
            value={form.paymentReference}
            onChange={handleChange}
            maxLength="120"
            placeholder="M-Pesa or bank reference"
            className={`${INPUT_CLASS} font-mono`}
          />
        </div>

        <ModalActions
          onClose={handleClose}
          pending={pending}
          submitLabel={existing ? 'Update settlement' : 'Record settlement'}
          pendingLabel="Saving..."
        />
      </form>
    </Modal>
  );
}
