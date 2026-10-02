import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { batchesApi } from '../lib/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import MonoText from '../components/ui/MonoText';
import Badge from '../components/ui/Badge';

export default function Verify() {
  const [batchId, setBatchId] = useState('');

  const verifyMutation = useMutation({
    mutationFn: (id) => batchesApi.verify(id).then((res) => res.data),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!batchId.trim()) return;
    verifyMutation.mutate(batchId.trim());
  };

  const result = verifyMutation.data;
  const error = verifyMutation.error;

  return (
    <div className="container-content py-20 md:py-28">
      <div className="max-w-2xl mb-16">
        <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4">
          Verify
        </p>
        <h1 className="text-display-lg font-display text-ivory mb-6 text-balance">
          Proof, not promises.
        </h1>
        <p className="text-dust text-lg text-pretty">
          Enter a batch ID or scan the QR code on a jar to see its full
          history — pulled directly from the blockchain.
        </p>
      </div>

      <div className="max-w-2xl">
        <Card className="p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-dust mb-2">
                Batch ID
              </label>
              <input
                type="text"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                placeholder="e.g., BAR-2026-001"
                className="w-full px-4 py-3 bg-obsidian border border-dust/20 rounded-md text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors font-mono"
                required
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={verifyMutation.isPending}
            >
              {verifyMutation.isPending ? 'Verifying...' : 'Verify batch'}
            </Button>
          </form>
        </Card>

        {/* Error */}
        {error && (
          <Card className="mt-8 p-6 border-red-500/30 bg-red-500/5">
            <p className="text-red-300 text-sm">
              {error.message || 'Batch not found on blockchain'}
            </p>
          </Card>
        )}

        {/* Success — the honey background moment */}
        {result?.verified && (
          <div className="mt-8 relative rounded-2xl overflow-hidden border border-sage/30">
            {/* Honey image background */}
            <img
              src="/honey-hero.webp"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover opacity-20"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-obsidian via-obsidian/80 to-obsidian/60" />

            {/* Content */}
            <div className="relative p-10 backdrop-blur-sm">
              <VerifiedBadge className="mb-6" />

              <h2 className="font-display text-2xl text-ivory mb-8">
                This batch is verified on-chain.
              </h2>

              <dl className="space-y-4">
                <div className="flex justify-between items-baseline pb-3 border-b border-dust/10">
                  <dt className="text-sm text-dust">Batch ID</dt>
                  <dd className="font-mono text-beeswax">
                    {result.data.batchId}
                  </dd>
                </div>

                <div className="flex justify-between items-baseline pb-3 border-b border-dust/10">
                  <dt className="text-sm text-dust">Village</dt>
                  <dd className="text-ivory">{result.data.village}</dd>
                </div>

                <div className="flex justify-between items-baseline pb-3 border-b border-dust/10">
                  <dt className="text-sm text-dust">Cooperative</dt>
                  <dd className="text-ivory">
                    {result.data.cooperativeName}
                  </dd>
                </div>

                <div className="flex justify-between items-baseline pb-3 border-b border-dust/10">
                  <dt className="text-sm text-dust">Moisture content</dt>
                  <dd className="text-ivory">
                    {result.data.moisturePercent}%
                    {result.data.moisturePercent < 20 ? (
                      <Badge variant="verified" className="ml-3">
                        Pure
                      </Badge>
                    ) : (
                      <Badge variant="pending" className="ml-3">
                        Above threshold
                      </Badge>
                    )}
                  </dd>
                </div>

                <div className="flex justify-between items-baseline pb-3 border-b border-dust/10">
                  <dt className="text-sm text-dust">Harvest date</dt>
                  <dd className="text-ivory">
                    {result.data.harvestDate}
                  </dd>
                </div>

                <div className="flex justify-between items-baseline pb-3 border-b border-dust/10">
                  <dt className="text-sm text-dust">Weight</dt>
                  <dd className="text-ivory">{result.data.weightKg} kg</dd>
                </div>

                <div>
                  <dt className="text-sm text-dust mb-2">Verified by</dt>
                  <dd>
                    <MonoText className="block truncate">
                      {result.data.verifiedBy}
                    </MonoText>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}