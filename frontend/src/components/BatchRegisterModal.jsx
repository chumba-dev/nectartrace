import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { batchesApi } from '../lib/api';

const BATCH_ID_PATTERN = /^BAR-\d{4}-\d{3}$/;
const MOISTURE_PATTERN = /^\d+(?:\.\d)?$/;

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10)
  );
}

export default function BatchRegisterModal({ isOpen, onClose }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    batchId: '',
    village: '',
    harvestDate: new Date().toISOString().split('T')[0],
    moisturePercent: '',
    weightKg: '',
    pricePerKg: '',
  });

  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => batchesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-batches'] });
      queryClient.invalidateQueries({ queryKey: ['coop-stats'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast.success('Batch registered');
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

  const resetForm = () => {
    setForm({
      batchId: '',
      village: '',
      harvestDate: new Date().toISOString().split('T')[0],
      moisturePercent: '',
      weightKg: '',
      pricePerKg: '',
    });
    setError('');
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
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
    const moisture = Number(moistureValue);
    if (
      !MOISTURE_PATTERN.test(moistureValue) ||
      !Number.isFinite(moisture) ||
      moisture <= 0 ||
      moisture >= 100
    ) {
      setError(
        'Moisture must be greater than 0 and less than 100, with at most one decimal place'
      );
      return;
    }

    const weight = Number(form.weightKg);
    if (!Number.isInteger(weight) || weight < 1) {
      setError('Weight must be a whole number of kilograms, at least 1 kg');
      return;
    }

    const priceValue = form.pricePerKg.trim();
    const price = priceValue ? Number(priceValue) : null;
    if (priceValue && (!Number.isFinite(price) || price <= 0)) {
      setError('Price per kg must be greater than 0 when supplied');
      return;
    }

    mutation.mutate({
      batchId: form.batchId,
      village,
      harvestDate: form.harvestDate,
      moisturePercent: moisture,
      weightKg: weight,
      pricePerKg: price,
    });
  };

  const handleClose = () => {
    if (mutation.isPending) return;
    resetForm();
    onClose();
  };

  const inputClass =
    'w-full px-4 py-3 bg-obsidian border border-dust/20 rounded-md text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors';
  const labelClass = 'block text-sm text-dust mb-2';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Register new batch">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        <div>
          <label className={labelClass}>Batch ID *</label>
          <input
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
          <p className="text-xs text-dust mt-1.5">
            Required and unique. Exact format: BAR-YYYY-NNN.
          </p>
        </div>

        <div>
          <label className={labelClass}>Village *</label>
          <input
            type="text"
            name="village"
            value={form.village}
            onChange={handleChange}
            placeholder="Kabarnet"
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className={labelClass}>Harvest date *</label>
          <input
            type="date"
            name="harvestDate"
            value={form.harvestDate}
            onChange={handleChange}
            max={new Date().toISOString().slice(0, 10)}
            className={inputClass}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Moisture % *</label>
            <input
              type="number"
              name="moisturePercent"
              value={form.moisturePercent}
              onChange={handleChange}
              placeholder="18.5"
              step="0.1"
              min="0.1"
              max="99.9"
              className={inputClass}
              required
            />
            <p className="text-xs text-dust mt-1.5">
              Greater than 0, less than 100; one decimal maximum.
            </p>
          </div>

          <div>
            <label className={labelClass}>Weight (kg) *</label>
            <input
              type="number"
              name="weightKg"
              value={form.weightKg}
              onChange={handleChange}
              placeholder="120"
              step="1"
              min="1"
              className={inputClass}
              required
            />
            <p className="text-xs text-dust mt-1.5">
              Whole kilograms only; minimum 1 kg.
            </p>
          </div>
        </div>

        <div>
          <label className={labelClass}>Price per kg (KES)</label>
          <input
            type="number"
            name="pricePerKg"
            value={form.pricePerKg}
            onChange={handleChange}
            placeholder="700"
            step="0.01"
            min="0.01"
            className={inputClass}
          />
          <p className="text-xs text-dust mt-1.5">
            Optional. If supplied, it must be greater than 0.
          </p>
        </div>

        <div className="bg-obsidian/50 border border-dust/10 rounded-md p-4 text-xs text-dust">
          <p className="mb-2">
            <strong className="text-ivory">On submit:</strong>
          </p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Batch is written to the blockchain (immutable)</li>
            <li>Saved to database with transaction hash</li>
            <li>QR code becomes available to view and download</li>
          </ul>
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
            disabled={mutation.isPending}
            className="flex-1"
          >
            {mutation.isPending ? 'Recording on-chain...' : 'Register batch'}
          </Button>
        </div>

        {mutation.isPending && (
          <p className="text-xs text-dust text-center">
            This takes ~10-15 seconds on the blockchain. Please wait.
          </p>
        )}
      </form>
    </Modal>
  );
}
