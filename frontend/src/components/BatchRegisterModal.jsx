import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { batchesApi } from '../lib/api';

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
        setError('Your account needs to be linked to a cooperative. Contact your admin.');
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

    // Validation
    const moisture = parseFloat(form.moisturePercent);
    if (moisture < 0 || moisture > 100) {
      setError('Moisture must be between 0 and 100%');
      return;
    }

    mutation.mutate({
      batchId: form.batchId.trim(),
      village: form.village.trim(),
      harvestDate: form.harvestDate,
      moisturePercent: moisture,
      weightKg: parseFloat(form.weightKg),
      pricePerKg: form.pricePerKg ? parseFloat(form.pricePerKg) : null,
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
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Register new batch"
    >
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
            required
          />
          <p className="text-xs text-dust mt-1.5">
            Must be unique. Format: BAR-YYYY-NNN
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
            className={inputClass}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Moisture % *</label>
            <input
              type="number"
              name="moisturePercent"
              value={form.moisturePercent}
              onChange={handleChange}
              placeholder="18.5"
              step="0.1"
              min="0"
              max="100"
              className={inputClass}
              required
            />
            <p className="text-xs text-dust mt-1.5">
              Below 20% = pure
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
              step="0.1"
              min="0"
              className={inputClass}
              required
            />
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
            step="1"
            min="0"
            className={inputClass}
          />
          <p className="text-xs text-dust mt-1.5">
            Optional. Can be set when listing.
          </p>
        </div>

        <div className="bg-obsidian/50 border border-dust/10 rounded-md p-4 text-xs text-dust">
          <p className="mb-2">
            <strong className="text-ivory">On submit:</strong>
          </p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Batch is written to the blockchain (immutable)</li>
            <li>Saved to database with transaction hash</li>
            <li>QR code will be generated for the batch</li>
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
