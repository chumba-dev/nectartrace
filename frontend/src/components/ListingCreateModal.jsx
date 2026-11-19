import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { batchesApi, listingsApi } from '../lib/api';
import Button from './ui/Button';
import Modal from './ui/Modal';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,/;
const EMPTY_FORM = {
  batchId: '',
  quantityKg: '',
  pricePerKg: '',
  description: '',
};

export default function ListingCreateModal({ isOpen, onClose, cooperativeId }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const fileReaderRef = useRef(null);
  const readVersionRef = useRef(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [error, setError] = useState('');

  const {
    data: batches = [],
    isLoading: batchesLoading,
    error: batchesError,
  } = useQuery({
    queryKey: ['my-batches'],
    queryFn: () => batchesApi.myBatches().then((res) => res.data.data),
    enabled: isOpen && Boolean(cooperativeId),
  });

  const availableBatches = batches.filter(
    (batch) => batch.status === 'AVAILABLE'
  );
  const selectedBatch = availableBatches.find(
    (batch) => String(batch.id) === form.batchId
  );

  const mutation = useMutation({
    mutationFn: (data) => listingsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['coop-stats'] });
      toast.success('Marketplace listing created');
      resetForm();
      onClose();
    },
    onError: (err) => {
      const message = err.message || 'Failed to create listing';
      setError(message);
      toast.error(message);
    },
  });

  const resetForm = () => {
    readVersionRef.current += 1;
    if (fileReaderRef.current?.readyState === 1) {
      fileReaderRef.current.abort();
    }
    fileReaderRef.current = null;
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImageDataUrl('');
    setIsReadingImage(false);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    return () => {
      readVersionRef.current += 1;
      if (fileReaderRef.current?.readyState === 1) {
        fileReaderRef.current.abort();
      }
    };
  }, []);

  const handleChange = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    const readVersion = readVersionRef.current + 1;
    readVersionRef.current = readVersion;

    if (fileReaderRef.current?.readyState === 1) {
      fileReaderRef.current.abort();
    }
    fileReaderRef.current = null;
    setImageFile(null);
    setImageDataUrl('');
    setIsReadingImage(false);
    setError('');

    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError('Choose a JPEG, PNG, or WebP image');
      event.target.value = '';
      return;
    }

    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      setError('Cover image must be no larger than 2 MiB');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    fileReaderRef.current = reader;
    setIsReadingImage(true);

    reader.onload = () => {
      if (readVersionRef.current !== readVersion) return;

      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!IMAGE_DATA_URL_PATTERN.test(result)) {
        setError('The selected image could not be processed');
        setImageFile(null);
        setImageDataUrl('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setImageFile(file);
      setImageDataUrl(result);
    };

    reader.onerror = () => {
      if (readVersionRef.current !== readVersion) return;
      setError('The selected image could not be read');
      setImageFile(null);
      setImageDataUrl('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.onloadend = () => {
      if (readVersionRef.current === readVersion) {
        setIsReadingImage(false);
        fileReaderRef.current = null;
      }
    };

    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    readVersionRef.current += 1;
    if (fileReaderRef.current?.readyState === 1) {
      fileReaderRef.current.abort();
    }
    fileReaderRef.current = null;
    setImageFile(null);
    setImageDataUrl('');
    setIsReadingImage(false);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');

    const batch = availableBatches.find(
      (candidate) => String(candidate.id) === form.batchId
    );
    if (!batch) {
      setError('Select an available batch');
      return;
    }

    const quantityKg = Number(form.quantityKg);
    if (
      !form.quantityKg.trim() ||
      !Number.isFinite(quantityKg) ||
      quantityKg <= 0
    ) {
      setError('Quantity must be greater than 0');
      return;
    }

    const pricePerKg = Number(form.pricePerKg);
    if (
      !form.pricePerKg.trim() ||
      !Number.isFinite(pricePerKg) ||
      pricePerKg <= 0
    ) {
      setError('Price per kg must be greater than 0');
      return;
    }

    if (!imageFile || !IMAGE_DATA_URL_PATTERN.test(imageDataUrl)) {
      setError('Choose a cover image before creating the listing');
      return;
    }

    const payload = {
      batchId: batch.id,
      quantityKg,
      pricePerKg,
      imageUrl: imageDataUrl,
    };
    const description = form.description.trim();
    if (description) payload.description = description;

    mutation.mutate(payload);
  };

  const handleClose = () => {
    if (mutation.isPending) return;
    resetForm();
    onClose();
  };

  const inputClass =
    'w-full rounded-md border border-dust/20 bg-obsidian px-4 py-3 text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors';
  const labelClass = 'mb-2 block text-sm text-dust';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create marketplace listing"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm text-dust">
          Pair an available verified batch with a cover image for marketplace
          buyers.
        </p>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {batchesError && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Failed to load batches: {batchesError.message}
          </div>
        )}

        <div>
          <label htmlFor="listing-batch" className={labelClass}>
            Available batch *
          </label>
          <select
            id="listing-batch"
            name="batchId"
            value={form.batchId}
            onChange={handleChange}
            className={inputClass}
            disabled={batchesLoading || Boolean(batchesError)}
            required
          >
            <option value="">
              {batchesLoading
                ? 'Loading batches...'
                : availableBatches.length === 0
                  ? 'No available batches'
                  : 'Select a batch'}
            </option>
            {availableBatches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.batchId} - {batch.village} ({batch.weightKg} kg)
              </option>
            ))}
          </select>
          {!batchesLoading &&
            !batchesError &&
            availableBatches.length === 0 && (
              <p className="mt-1.5 text-xs text-dust">
                Register or restore a batch to AVAILABLE before listing it.
              </p>
            )}
          {selectedBatch && (
            <p className="mt-1.5 text-xs text-dust">
              Harvested{' '}
              {new Date(selectedBatch.harvestDate).toLocaleDateString('en-KE')}
              {' · '}
              {selectedBatch.moistureContent}% moisture
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="listing-quantity" className={labelClass}>
              Quantity (kg) *
            </label>
            <input
              id="listing-quantity"
              type="number"
              name="quantityKg"
              value={form.quantityKg}
              onChange={handleChange}
              min="0.01"
              step="0.01"
              placeholder="40"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="listing-price" className={labelClass}>
              Price per kg (KES) *
            </label>
            <input
              id="listing-price"
              type="number"
              name="pricePerKg"
              value={form.pricePerKg}
              onChange={handleChange}
              min="0.01"
              step="0.01"
              placeholder="700"
              className={inputClass}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="listing-description" className={labelClass}>
            Description
          </label>
          <textarea
            id="listing-description"
            name="description"
            value={form.description}
            onChange={handleChange}
            maxLength={2000}
            rows="3"
            placeholder="Share this honey's character, harvest, or ideal uses..."
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="listing-image" className={labelClass}>
            Cover image *
          </label>
          <div className="overflow-hidden rounded-lg border border-dust/20 bg-obsidian">
            {imageDataUrl ? (
              <div className="relative aspect-[16/9]">
                <img
                  src={imageDataUrl}
                  alt="Listing cover preview"
                  className="h-full w-full bg-ivory/[0.03] p-4 object-contain sm:p-6"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute right-3 top-3 rounded-md border border-ivory/20 bg-obsidian/80 px-3 py-2 text-xs text-ivory backdrop-blur-sm transition-colors hover:border-beeswax hover:text-beeswax"
                >
                  Replace image
                </button>
              </div>
            ) : (
              <label
                htmlFor="listing-image"
                className="flex min-h-36 cursor-pointer flex-col items-center justify-center px-6 py-8 text-center transition-colors hover:bg-stone/40"
              >
                <span className="font-display text-lg text-ivory">
                  {isReadingImage
                    ? 'Preparing preview...'
                    : 'Choose a cover image'}
                </span>
                <span className="mt-2 text-xs text-dust">
                  JPEG, PNG, or WebP · maximum 2 MiB
                </span>
              </label>
            )}
            <input
              ref={fileInputRef}
              id="listing-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              className="sr-only"
              required
            />
          </div>
          {imageFile && (
            <p className="mt-1.5 truncate text-xs text-dust">
              {imageFile.name} · {(imageFile.size / 1024 / 1024).toFixed(2)} MiB
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
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
              isReadingImage ||
              batchesLoading ||
              availableBatches.length === 0
            }
            className="flex-1"
          >
            {mutation.isPending ? 'Creating listing...' : 'Publish listing'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
