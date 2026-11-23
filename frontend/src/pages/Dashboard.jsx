import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { batchesApi, cooperativesApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import MonoText from '../components/ui/MonoText';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import BatchRegisterModal from '../components/BatchRegisterModal';
import ListingCreateModal from '../components/ListingCreateModal';
import HarvestOffersSection from '../components/HarvestOffersSection';

function QRCodeModal({ batchId, onClose }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['qr', batchId],
    queryFn: () => batchesApi.qr(batchId).then((res) => res.data.data),
    enabled: !!batchId,
  });

  if (!batchId) return null;

  return (
    <Modal isOpen={!!batchId} onClose={onClose} title={`QR - ${batchId}`}>
      {isLoading ? (
        <Skeleton variant="card" className="aspect-square" />
      ) : error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Unable to load this QR code: {error.message}
        </div>
      ) : data ? (
        <div className="text-center">
          <img
            src={data.qrDataUrl}
            alt={`QR code for batch ${batchId}`}
            className="mx-auto rounded-lg"
          />
          <p className="mt-4 break-all font-mono text-xs text-dust">
            {data.verifyUrl}
          </p>
          <a
            href={data.qrDataUrl}
            download={`${batchId}-qr.png`}
            className="mt-4 inline-block text-sm text-beeswax hover:underline"
          >
            Download PNG
          </a>
        </div>
      ) : (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          The QR code response was empty. Please try again.
        </div>
      )}
    </Modal>
  );
}

function CooperativeLockedState({ user, cooperativeId }) {
  const hasAssignment = Boolean(cooperativeId);
  const steps = [
    {
      title: 'Staff application received',
      description: 'Your NectarTrace staff account has been created.',
      state: 'complete',
    },
    {
      title: 'Cooperative assignment',
      description: hasAssignment
        ? `Assigned to ${user.cooperative?.name || 'your cooperative'}.`
        : 'An administrator must assign your account to a cooperative.',
      state: hasAssignment ? 'complete' : 'current',
    },
    {
      title: 'Cooperative verification',
      description: hasAssignment
        ? 'An administrator must verify the assigned cooperative.'
        : 'Verification can begin after a cooperative is assigned.',
      state: hasAssignment ? 'current' : 'pending',
    },
    {
      title: 'Dashboard access',
      description:
        'Batch, offer, and listing tools unlock after both checks are complete.',
      state: 'pending',
    },
  ];

  return (
    <div className="container-content flex min-h-[calc(100svh-72px)] items-center justify-center py-16 md:py-24">
      <Card className="w-full max-w-2xl border-beeswax/20 bg-stone-deep p-6 sm:p-9">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-beeswax/30 bg-beeswax/10 text-beeswax">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <div className="mx-auto mt-6 max-w-xl text-center">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-beeswax">
            Dashboard locked
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold text-ivory text-balance">
            {hasAssignment
              ? 'Cooperative verification pending'
              : 'Cooperative assignment pending'}
          </h1>
          <p className="mt-4 text-sm leading-6 text-dust text-pretty">
            {hasAssignment
              ? `Your account is assigned to ${user.cooperative?.name || 'a cooperative'}, but dashboard access stays locked until that cooperative is verified.`
              : 'Your staff application is active, but dashboard access requires an administrator to assign you to a cooperative. The cooperative must also be verified.'}
          </p>
        </div>

        <ol
          className="mx-auto mt-8 max-w-lg"
          aria-label="Dashboard access steps"
        >
          {steps.map((step, index) => {
            const isComplete = step.state === 'complete';
            const isCurrent = step.state === 'current';

            return (
              <li
                key={step.title}
                className="relative flex gap-4 pb-6 last:pb-0"
                aria-current={isCurrent ? 'step' : undefined}
              >
                {index < steps.length - 1 && (
                  <span
                    className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px ${
                      isComplete ? 'bg-sage' : 'bg-dust/20'
                    }`}
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
                    isComplete
                      ? 'border-sage bg-sage text-ivory'
                      : isCurrent
                        ? 'border-beeswax bg-beeswax/10 text-beeswax'
                        : 'border-dust/25 bg-obsidian text-dust'
                  }`}
                  aria-hidden="true"
                >
                  {isComplete ? (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <div className="pt-0.5">
                  <h2
                    className={`text-sm font-semibold ${
                      isCurrent || isComplete ? 'text-ivory' : 'text-dust'
                    }`}
                  >
                    {step.title}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-dust">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 border-t border-dust/15 pt-6 text-center">
          <p className="text-xs leading-5 text-dust">
            No batch, offer, or listing data is loaded while access is locked.
          </p>
          <Button to="/marketplace" variant="outline" className="mt-5">
            Browse the marketplace
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [showNewListing, setShowNewListing] = useState(false);
  const [qrBatchId, setQrBatchId] = useState(null);
  const cooperativeId = user.cooperativeId ?? user.cooperative?.id;
  const isCooperativeLocked =
    user.role === 'COOPERATIVE_STAFF' &&
    (!cooperativeId || user.cooperative?.isVerified !== true);
  const canManageInventory =
    Boolean(cooperativeId) &&
    user.role === 'COOPERATIVE_STAFF' &&
    !isCooperativeLocked;

  useEffect(() => {
    document.title = 'Dashboard — NectarTrace';
  }, []);

  // Fetch stats
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ['coop-stats', cooperativeId],
    queryFn: () =>
      cooperativesApi.stats(cooperativeId).then((res) => res.data.data),
    enabled: canManageInventory,
  });

  // Fetch batches
  const {
    data: batches = [],
    isLoading,
    error: batchesError,
  } = useQuery({
    queryKey: ['my-batches'],
    queryFn: () => batchesApi.myBatches().then((res) => res.data.data),
    enabled: canManageInventory,
  });

  if (isCooperativeLocked) {
    return <CooperativeLockedState user={user} cooperativeId={cooperativeId} />;
  }

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
        {canManageInventory && (
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button variant="secondary" onClick={() => setShowNewBatch(true)}>
              Register batch
            </Button>
            <Button onClick={() => setShowNewListing(true)}>
              Create listing
            </Button>
          </div>
        )}
      </div>

      {cooperativeId && (
        <>
          {statsError ? (
            <Card className="mb-8 border-red-500/30 bg-red-500/5 p-6">
              <p className="text-sm text-red-300">
                Failed to load cooperative stats: {statsError.message}
              </p>
            </Card>
          ) : (
            <div className="mb-16 grid gap-6 md:grid-cols-3">
              <Card className="p-6">
                <p className="mb-3 font-mono text-xs uppercase tracking-widest text-dust">
                  Total batches
                </p>
                {statsLoading ? (
                  <Skeleton variant="title" className="w-20" />
                ) : (
                  <p className="font-display text-4xl text-beeswax">
                    {stats?.totalBatches ?? 0}
                  </p>
                )}
              </Card>
              <Card className="p-6">
                <p className="mb-3 font-mono text-xs uppercase tracking-widest text-dust">
                  Active listings
                </p>
                {statsLoading ? (
                  <Skeleton variant="title" className="w-20" />
                ) : (
                  <p className="font-display text-4xl text-beeswax">
                    {stats?.activeListings ?? 0}
                  </p>
                )}
              </Card>
              <Card className="p-6">
                <p className="mb-3 font-mono text-xs uppercase tracking-widest text-dust">
                  Total honey
                </p>
                {statsLoading ? (
                  <Skeleton variant="title" className="w-28" />
                ) : (
                  <p className="font-display text-4xl text-beeswax">
                    {stats?.totalWeightKg ?? 0}
                    <span className="ml-2 text-lg text-dust">kg</span>
                  </p>
                )}
              </Card>
            </div>
          )}

          <HarvestOffersSection />

          <div>
            <h2 className="mb-6 font-display text-2xl text-ivory">
              Recent batches
            </h2>

            {isLoading && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="space-y-3 p-6">
                    <Skeleton variant="title" className="w-1/3" />
                    <Skeleton className="w-full" />
                  </Card>
                ))}
              </div>
            )}

            {batchesError && (
              <Card className="border-red-500/30 bg-red-500/5 p-6">
                <p className="text-sm text-red-300">
                  Failed to load batches: {batchesError.message}
                </p>
              </Card>
            )}

            {!isLoading && !batchesError && batches.length === 0 && (
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

            {batches.length > 0 && (
              <div className="space-y-4">
                {batches.map((batch) => (
                  <Card key={batch.id} className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center gap-3">
                          <MonoText className="text-beeswax">
                            {batch.batchId}
                          </MonoText>
                          <VerifiedBadge />
                        </div>
                        <p className="text-sm text-dust">
                          {batch.village} · {batch.moistureContent}% moisture ·{' '}
                          {batch.weightKg}kg · Harvested{' '}
                          {new Date(batch.harvestDate).toLocaleDateString(
                            'en-KE',
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            }
                          )}
                        </p>
                        {batch.blockchainTxHash && (
                          <MonoText className="mt-2 block truncate text-xs">
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
        </>
      )}

      <BatchRegisterModal
        isOpen={showNewBatch}
        onClose={() => setShowNewBatch(false)}
      />
      <ListingCreateModal
        isOpen={showNewListing}
        onClose={() => setShowNewListing(false)}
        cooperativeId={cooperativeId}
      />
      <QRCodeModal batchId={qrBatchId} onClose={() => setQrBatchId(null)} />
    </div>
  );
}
