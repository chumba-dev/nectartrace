import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { batchesApi, cooperativesApi, listingsApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import MonoText from '../components/ui/MonoText';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import BatchRegisterModal from '../components/BatchRegisterModal';

function QRCodeModal({ batchId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['qr', batchId],
    queryFn: () => batchesApi.qr(batchId).then((res) => res.data.data),
    enabled: !!batchId,
  });

  if (!batchId) return null;

  return (
    <Modal isOpen={!!batchId} onClose={onClose} title={`QR - ${batchId}`}>
      {isLoading ? (
        <Skeleton variant="card" className="aspect-square" />
      ) : (
        <div className="text-center">
          <img
            src={data.qrDataUrl}
            alt={`QR code for batch ${batchId}`}
            className="mx-auto rounded-lg"
          />
          <p className="text-xs text-dust mt-4 font-mono break-all">
            {data.verifyUrl}
          </p>
          <a
            href={data.qrDataUrl}
            download={`${batchId}-qr.png`}
            className="inline-block mt-4 text-beeswax hover:underline text-sm"
          >
            Download PNG
          </a>
        </div>
      )}
    </Modal>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [qrBatchId, setQrBatchId] = useState(null);

  useEffect(() => {
    document.title = 'Dashboard — NectarTrace';
  }, []);

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['coop-stats', user.cooperativeId],
    queryFn: () =>
      cooperativesApi.stats(user.cooperativeId).then((res) => res.data.data),
    enabled: !!user.cooperativeId,
  });

  // Fetch batches
  const { data: batches, isLoading } = useQuery({
    queryKey: ['my-batches'],
    queryFn: () => batchesApi.myBatches().then((res) => res.data.data),
    enabled: !!user.cooperativeId,
  });

  return (
    <div className="container-content py-20 md:py-28">
      <div className="flex flex-wrap items-start justify-between gap-6 mb-16">
        <div>
          <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4">
            Dashboard
          </p>
          <h1 className="text-display-lg font-display text-ivory text-balance">
            {user.name}
          </h1>
          <p className="text-dust mt-2">
            {user.cooperative?.name || 'No cooperative assigned'}
          </p>
        </div>
        <Button onClick={() => setShowNewBatch(true)}>
          + Register batch
        </Button>
      </div>

      {!user.cooperativeId && (
        <Card className="p-6 border-beeswax/30 bg-beeswax/5">
          <p className="text-beeswax text-sm">
            Your account isn't linked to a cooperative. Contact your admin to be assigned.
          </p>
        </Card>
      )}

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-6 mb-16">
        <Card className="p-6">
          <p className="font-mono text-dust text-xs tracking-widest uppercase mb-3">
            Total batches
          </p>
          <p className="font-display text-4xl text-beeswax">
            {stats?.totalBatches || 0}
          </p>
        </Card>
        <Card className="p-6">
          <p className="font-mono text-dust text-xs tracking-widest uppercase mb-3">
            Active listings
          </p>
          <p className="font-display text-4xl text-beeswax">
            {stats?.activeListings || 0}
          </p>
        </Card>
        <Card className="p-6">
          <p className="font-mono text-dust text-xs tracking-widest uppercase mb-3">
            Total honey
          </p>
          <p className="font-display text-4xl text-beeswax">
            {stats?.totalWeightKg || 0}
            <span className="text-lg text-dust ml-2">kg</span>
          </p>
        </Card>
      </div>

      {/* Batches list */}
      <div>
        <h2 className="font-display text-2xl text-ivory mb-6">
          Recent batches
        </h2>

        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 space-y-3">
                <Skeleton variant="title" className="w-1/3" />
                <Skeleton className="w-full" />
              </Card>
            ))}
          </div>
        )}

        {batches && batches.length === 0 && (
          <Card className="p-6">
            <EmptyState
              title="No batches yet"
              description="Register your first batch to get started."
              action={
                <Button onClick={() => setShowNewBatch(true)}>
                  Register batch
                </Button>
              }
            />
          </Card>
        )}

        {batches && batches.length > 0 && (
          <div className="space-y-4">
            {batches.map((batch) => (
              <Card key={batch.id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <MonoText className="text-beeswax">
                        {batch.batchId}
                      </MonoText>
                      <VerifiedBadge />
                    </div>
                    <p className="text-dust text-sm">
                      {batch.village} · {batch.moistureContent}% moisture ·{' '}
                      {batch.weightKg}kg · Harvested{' '}
                      {new Date(batch.harvestDate).toLocaleDateString(
                        'en-KE',
                        { month: 'short', day: 'numeric', year: 'numeric' }
                      )}
                    </p>
                    {batch.blockchainTxHash && (
                      <MonoText className="block text-xs mt-2 truncate">
                        {batch.blockchainTxHash}
                      </MonoText>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setQrBatchId(batch.batchId)}
                  >
                    View QR
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* TODO: New batch modal (next phase) */}
      <BatchRegisterModal
        isOpen={showNewBatch}
        onClose={() => setShowNewBatch(false)}
      />
      <QRCodeModal
        batchId={qrBatchId}
        onClose={() => setQrBatchId(null)}
      />
    </div>
  );
}
