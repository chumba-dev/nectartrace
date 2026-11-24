import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  batchesApi,
  cooperativeApplicationsApi,
  cooperativeMembersApi,
  cooperativesApi,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import DashboardShell from '../components/DashboardShell';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import MonoText from '../components/ui/MonoText';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import BatchRegisterModal from '../components/BatchRegisterModal';
import ListingCreateModal from '../components/ListingCreateModal';
import HarvestOffersSection from '../components/HarvestOffersSection';

const SECTION_IDS = new Set(['overview', 'offers', 'inventory', 'team']);
const ETHEREUM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const inputClass =
  'w-full rounded-md border border-dust/20 bg-obsidian px-4 py-3 text-ivory placeholder:text-dust/50 transition-colors focus:border-beeswax focus:outline-none';
const labelClass = 'mb-2 block text-sm text-dust';

function formatDate(value, includeTime = false) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(includeTime && { hour: 'numeric', minute: '2-digit' }),
  }).format(date);
}

function QRCodeModal({ batchId, onClose }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['qr', batchId],
    queryFn: () =>
      batchesApi.qr(batchId).then((response) => response.data.data),
    enabled: Boolean(batchId),
  });

  if (!batchId) return null;

  return (
    <Modal
      isOpen={Boolean(batchId)}
      onClose={onClose}
      title={`QR - ${batchId}`}
    >
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

function AccessCard({ children }) {
  return (
    <div className="container-content flex min-h-[calc(100svh-72px)] items-center justify-center py-12 md:py-20">
      <Card className="w-full max-w-3xl border-beeswax/20 bg-stone-deep p-6 sm:p-9">
        {children}
      </Card>
    </div>
  );
}

function AccessHeader({ eyebrow, title, description }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
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
          <path d="M12 3 4 7v5c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V7l-8-4Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <p className="mt-6 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-beeswax">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ivory text-balance">
        {title}
      </h1>
      <p className="mt-4 text-sm leading-6 text-dust text-pretty">
        {description}
      </p>
    </div>
  );
}

function ApplicationForm({ rejectedApplication, onSubmitted }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: rejectedApplication?.name || '',
    village: rejectedApplication?.village || '',
    ward: rejectedApplication?.ward || '',
    county: rejectedApplication?.county || 'Baringo',
    walletAddress: rejectedApplication?.walletAddress || '',
    registrationNumber: rejectedApplication?.registrationNumber || '',
    phone: rejectedApplication?.phone || '',
    commissionPercent: String(rejectedApplication?.commissionPercent ?? 0),
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => cooperativeApplicationsApi.create(data),
    onSuccess: (response) => {
      const application = response.data.data;
      queryClient.setQueryData(
        ['cooperative-applications', 'mine'],
        (current) => ({
          current: application,
          applications: [
            application,
            ...(current?.applications || []).filter(
              (candidate) => candidate.id !== application.id
            ),
          ],
        })
      );
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Cooperative application submitted');
      onSubmitted?.(application);
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const updateField = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');
    const commissionPercent = Number(form.commissionPercent);
    if (!ETHEREUM_ADDRESS.test(form.walletAddress.trim())) {
      setError('Enter a valid Ethereum wallet address beginning with 0x');
      return;
    }
    if (
      !Number.isFinite(commissionPercent) ||
      commissionPercent < 0 ||
      commissionPercent > 100
    ) {
      setError('Commission percent must be between 0 and 100');
      return;
    }

    mutation.mutate({
      name: form.name.trim(),
      village: form.village.trim(),
      ward: form.ward.trim(),
      ...(form.county.trim() && { county: form.county.trim() }),
      walletAddress: form.walletAddress.trim(),
      registrationNumber: form.registrationNumber.trim(),
      phone: form.phone.trim(),
      commissionPercent,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 border-t border-dust/15 pt-8">
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ivory">
          {rejectedApplication
            ? 'Submit a corrected application'
            : 'Apply for a cooperative'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-dust">
          Provide the registered organization and blockchain details an
          administrator will verify.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="application-name" className={labelClass}>
            Cooperative name *
          </label>
          <input
            id="application-name"
            name="name"
            value={form.name}
            onChange={updateField}
            maxLength="200"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="application-village" className={labelClass}>
            Village *
          </label>
          <input
            id="application-village"
            name="village"
            value={form.village}
            onChange={updateField}
            maxLength="120"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="application-ward" className={labelClass}>
            Ward *
          </label>
          <input
            id="application-ward"
            name="ward"
            value={form.ward}
            onChange={updateField}
            maxLength="120"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="application-county" className={labelClass}>
            County
          </label>
          <input
            id="application-county"
            name="county"
            value={form.county}
            onChange={updateField}
            maxLength="120"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="application-phone" className={labelClass}>
            Cooperative phone *
          </label>
          <input
            id="application-phone"
            name="phone"
            type="tel"
            value={form.phone}
            onChange={updateField}
            maxLength="40"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="application-registration" className={labelClass}>
            Registration number *
          </label>
          <input
            id="application-registration"
            name="registrationNumber"
            value={form.registrationNumber}
            onChange={updateField}
            maxLength="120"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="application-commission" className={labelClass}>
            Commission percent
          </label>
          <input
            id="application-commission"
            name="commissionPercent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.commissionPercent}
            onChange={updateField}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="application-wallet" className={labelClass}>
            Ethereum wallet address *
          </label>
          <input
            id="application-wallet"
            name="walletAddress"
            value={form.walletAddress}
            onChange={updateField}
            placeholder="0x..."
            className={`${inputClass} font-mono text-sm`}
            spellCheck="false"
            required
          />
          <p className="mt-1.5 text-xs text-dust">
            Approval grants this wallet the cooperative blockchain role.
          </p>
        </div>
      </div>

      <Button
        type="submit"
        className="mt-6 w-full sm:w-auto"
        disabled={mutation.isPending}
      >
        {mutation.isPending
          ? 'Submitting application...'
          : 'Submit application'}
      </Button>
    </form>
  );
}

function PendingApplication({ application }) {
  const steps = [
    {
      title: 'Application submitted',
      description: `${application.name} was submitted ${formatDate(
        application.createdAt,
        true
      )}.`,
      state: 'complete',
    },
    {
      title: 'Administrator review',
      description:
        'Registration, wallet, commission, and applicant eligibility are being reviewed.',
      state: 'current',
    },
    {
      title: 'Cooperative access',
      description:
        'Approval creates your owner membership and unlocks operational tools.',
      state: 'pending',
    },
  ];

  return (
    <AccessCard>
      <AccessHeader
        eyebrow="Application pending"
        title={`${application.name} is under review`}
        description="No offer, batch, listing, team, or order data is loaded until the application is approved and your membership is active."
      />
      <ol className="mx-auto mt-9 max-w-xl" aria-label="Application progress">
        {steps.map((step, index) => {
          const complete = step.state === 'complete';
          const current = step.state === 'current';
          return (
            <li
              key={step.title}
              className="relative flex gap-4 pb-7 last:pb-0"
              aria-current={current ? 'step' : undefined}
            >
              {index < steps.length - 1 && (
                <span
                  className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px ${
                    complete ? 'bg-sage' : 'bg-dust/20'
                  }`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
                  complete
                    ? 'border-sage bg-sage text-ivory'
                    : current
                      ? 'border-beeswax bg-beeswax/10 text-beeswax'
                      : 'border-dust/25 bg-obsidian text-dust'
                }`}
              >
                {complete ? '✓' : index + 1}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ivory">
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
        <Button to="/marketplace" variant="outline" size="sm">
          Browse the marketplace
        </Button>
      </div>
    </AccessCard>
  );
}

function RefreshAccess({ title, description }) {
  const { refreshUser } = useAuth();
  const mutation = useMutation({
    mutationFn: () => refreshUser(),
    onSuccess: (freshUser) => {
      if (
        freshUser?.cooperativeMembership?.isActive &&
        (freshUser.cooperativeMembership.cooperative?.isVerified ||
          freshUser.cooperative?.isVerified)
      ) {
        toast.success('Cooperative access refreshed');
      } else {
        toast(
          'Access is not active yet. Sign out and back in if approval was recent.'
        );
      }
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AccessCard>
      <AccessHeader
        eyebrow="Refresh required"
        title={title}
        description={description}
      />
      <div className="mt-8 text-center">
        <Button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Refreshing access...' : 'Refresh my access'}
        </Button>
        <p className="mt-4 text-xs leading-5 text-dust">
          If access still appears stale after refresh, sign out and sign in
          again to obtain the latest authenticated profile.
        </p>
      </div>
    </AccessCard>
  );
}

function CooperativeAccessState({ user, cooperativeId, cooperative }) {
  const applicationsQuery = useQuery({
    queryKey: ['cooperative-applications', 'mine'],
    queryFn: () =>
      cooperativeApplicationsApi.mine().then((response) => response.data.data),
  });

  if (applicationsQuery.isLoading) {
    return (
      <AccessCard>
        <div className="mx-auto max-w-xl space-y-5 py-8">
          <Skeleton variant="title" className="mx-auto w-2/3" />
          <Skeleton className="w-full" />
          <Skeleton className="mx-auto w-4/5" />
        </div>
      </AccessCard>
    );
  }

  if (applicationsQuery.error) {
    return (
      <AccessCard>
        <AccessHeader
          eyebrow="Access check unavailable"
          title="We could not load your application state"
          description={applicationsQuery.error.message}
        />
        <div className="mt-7 text-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => applicationsQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      </AccessCard>
    );
  }

  const membership = user.cooperativeMembership;
  const current = applicationsQuery.data?.current;
  const applications = applicationsQuery.data?.applications || [];
  const latest = applications[0];

  if (membership && !membership.isActive) {
    return (
      <AccessCard>
        <AccessHeader
          eyebrow="Membership inactive"
          title="Your cooperative access is paused"
          description={`Your platform account is still signed in, but your ${
            cooperative?.name || 'cooperative'
          } membership is inactive. An owner or manager with permission must reactivate it.`}
        />
        <div className="mt-8 text-center">
          <Button to="/marketplace" variant="outline">
            Browse the marketplace
          </Button>
        </div>
      </AccessCard>
    );
  }

  if (current) return <PendingApplication application={current} />;

  if (cooperativeId) {
    if (cooperative?.isVerified === false) {
      return (
        <AccessCard>
          <AccessHeader
            eyebrow="Verification pending"
            title={`${cooperative.name || 'Your cooperative'} is not verified yet`}
            description="Operational tools remain locked until an administrator completes cooperative verification. No operational data is loaded in the meantime."
          />
          <div className="mt-8 text-center">
            <Button to="/marketplace" variant="outline">
              Browse the marketplace
            </Button>
          </div>
        </AccessCard>
      );
    }

    return (
      <RefreshAccess
        title="Your cooperative assignment needs a fresh session"
        description="A cooperative assignment exists, but the active membership or verification details are not present in this cached profile. Refresh before loading operational data."
      />
    );
  }

  if (latest?.status === 'APPROVED') {
    return (
      <RefreshAccess
        title={`${latest.name} was approved`}
        description="The application is approved, but this browser still has a profile without the new owner membership. Refreshing safely reloads /auth/me before any operational request is made."
      />
    );
  }

  const rejected = latest?.status === 'REJECTED' ? latest : null;
  return (
    <AccessCard>
      <AccessHeader
        eyebrow={
          rejected ? 'Application needs revision' : 'Cooperative onboarding'
        }
        title={
          rejected
            ? `${rejected.name} was not approved`
            : `Register ${user.name}'s cooperative`
        }
        description={
          rejected
            ? 'Review the administrator feedback, correct the details, and submit a new application.'
            : 'Submit the cooperative details required for administrator review. Operational data stays unloaded until approval.'
        }
      />
      {rejected && (
        <div className="mt-7 rounded-md border border-red-500/25 bg-red-500/5 p-5">
          <p className="font-mono text-xs uppercase tracking-widest text-red-300">
            Administrator feedback
          </p>
          <p className="mt-2 text-sm leading-6 text-dust">
            {rejected.rejectionReason}
          </p>
          <p className="mt-3 text-xs text-dust">
            Reviewed {formatDate(rejected.reviewedAt, true)}
          </p>
        </div>
      )}
      <ApplicationForm rejectedApplication={rejected} />
    </AccessCard>
  );
}

function OverviewSection({
  stats,
  loading,
  error,
  cooperative,
  membership,
  onNavigate,
}) {
  return (
    <div className="space-y-8">
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-6">
          <p className="text-sm text-red-300">
            Failed to load cooperative stats: {error.message}
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total batches', value: stats?.totalBatches ?? 0 },
          { label: 'Active listings', value: stats?.activeListings ?? 0 },
          {
            label: 'Total honey',
            value: `${stats?.totalWeightKg ?? 0} kg`,
          },
        ].map((item) => (
          <Card key={item.label} className="p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-dust">
              {item.label}
            </p>
            {loading ? (
              <Skeleton variant="title" className="mt-3 w-24" />
            ) : (
              <p className="mt-3 font-display text-3xl text-beeswax">
                {item.value}
              </p>
            )}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-beeswax">
                Verified cooperative
              </p>
              <h2 className="mt-2 font-display text-2xl text-ivory">
                {cooperative?.name}
              </h2>
              <p className="mt-2 text-sm text-dust">
                {cooperative?.village}
                {cooperative?.ward ? `, ${cooperative.ward}` : ''}
                {cooperative?.county ? ` · ${cooperative.county}` : ''}
              </p>
            </div>
            <VerifiedBadge />
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-dust">Your local role</dt>
              <dd className="mt-1 text-sm text-ivory">{membership?.role}</dd>
            </div>
            <div>
              <dt className="text-xs text-dust">Registration</dt>
              <dd className="mt-1 text-sm text-ivory">
                {cooperative?.registrationNumber || 'Not provided'}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-dust">
            Work queues
          </p>
          <div className="mt-4 grid gap-3">
            <button
              type="button"
              onClick={() => onNavigate('offers')}
              className="rounded-lg border border-dust/15 bg-obsidian/30 px-4 py-3 text-left text-sm text-ivory transition-colors hover:border-beeswax/40"
            >
              Review farmer harvest offers
            </button>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="rounded-lg border border-dust/15 bg-obsidian/30 px-4 py-3 text-left text-sm text-ivory transition-colors hover:border-beeswax/40"
            >
              Manage batches and listings
            </button>
            <button
              type="button"
              onClick={() => onNavigate('team')}
              className="rounded-lg border border-dust/15 bg-obsidian/30 px-4 py-3 text-left text-sm text-ivory transition-colors hover:border-beeswax/40"
            >
              Review cooperative team
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function InventorySection({
  batches,
  loading,
  error,
  onNewBatch,
  onNewListing,
  onQr,
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ivory">
            Batches and listings
          </h2>
          <p className="mt-2 text-sm text-dust">
            Aggregate verified lots into traceable batches, then publish
            available stock to the marketplace.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button type="button" variant="secondary" onClick={onNewBatch}>
            Register batch
          </Button>
          <Button type="button" onClick={onNewListing}>
            Create listing
          </Button>
        </div>
      </div>

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="space-y-3 p-6">
              <Skeleton variant="title" className="w-1/3" />
              <Skeleton className="w-full" />
            </Card>
          ))}
        </div>
      )}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5 p-6">
          <p className="text-sm text-red-300">
            Failed to load batches: {error.message}
          </p>
        </Card>
      )}
      {!loading && !error && batches.length === 0 && (
        <Card>
          <EmptyState
            title="No batches yet"
            description="Register your first batch from verified farmer lots."
            action={<Button onClick={onNewBatch}>Register batch</Button>}
          />
        </Card>
      )}

      <div className="space-y-4">
        {batches.map((batch) => (
          <Card key={batch.id} className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-3">
                  <MonoText className="text-beeswax">{batch.batchId}</MonoText>
                  <VerifiedBadge />
                </div>
                <p className="text-sm text-dust">
                  {batch.village} · {batch.moistureContent}% moisture ·{' '}
                  {batch.weightKg} kg · Harvested{' '}
                  {formatDate(batch.harvestDate)}
                </p>
                {batch.blockchainTxHash && (
                  <MonoText className="mt-2 block truncate text-xs">
                    {batch.blockchainTxHash}
                  </MonoText>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onQr(batch.batchId)}
              >
                View QR
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TeamSection({ actorMembership, currentUserId }) {
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [newRole, setNewRole] = useState(
    actorMembership.role === 'OWNER' ? 'MANAGER' : 'STAFF'
  );
  const canAdd = ['OWNER', 'MANAGER'].includes(actorMembership.role);

  const membersQuery = useQuery({
    queryKey: ['cooperative-members'],
    queryFn: () =>
      cooperativeMembersApi.list().then((response) => response.data.data),
  });

  const refreshMembers = () =>
    queryClient.invalidateQueries({ queryKey: ['cooperative-members'] });

  const addMutation = useMutation({
    mutationFn: (data) => cooperativeMembersApi.add(data),
    onSuccess: () => {
      refreshMembers();
      setIdentifier('');
      toast.success('Cooperative member added');
    },
    onError: (error) => toast.error(error.message),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }) =>
      cooperativeMembersApi.updateRole(userId, role),
    onSuccess: () => {
      refreshMembers();
      toast.success('Membership role updated');
    },
    onError: (error) => toast.error(error.message),
  });

  const activeMutation = useMutation({
    mutationFn: ({ userId, isActive }) =>
      cooperativeMembersApi.updateActive(userId, isActive),
    onSuccess: (_response, variables) => {
      refreshMembers();
      toast.success(
        variables.isActive ? 'Membership reactivated' : 'Membership paused'
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const submitMember = (event) => {
    event.preventDefault();
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) return;
    addMutation.mutate({
      identifier: normalizedIdentifier,
      role: actorMembership.role === 'MANAGER' ? 'STAFF' : newRole,
    });
  };

  const members = membersQuery.data || [];

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ivory">Cooperative team</h2>
        <p className="mt-2 text-sm text-dust">
          Local membership roles control cooperative operations. Platform roles
          are never changed here.
        </p>
      </div>

      {canAdd && (
        <Card className="mb-6 border-beeswax/20 p-6">
          <h3 className="font-display text-xl text-ivory">
            Add an existing user
          </h3>
          <p className="mt-2 text-sm leading-6 text-dust">
            The user must already have an active, unassigned cooperative staff
            account. Find them by email or phone.
          </p>
          <form
            onSubmit={submitMember}
            className="mt-5 grid gap-4 sm:grid-cols-[1fr_160px_auto] sm:items-end"
          >
            <div>
              <label htmlFor="member-identifier" className={labelClass}>
                Email or phone
              </label>
              <input
                id="member-identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="member-role" className={labelClass}>
                Local role
              </label>
              <select
                id="member-role"
                value={actorMembership.role === 'MANAGER' ? 'STAFF' : newRole}
                onChange={(event) => setNewRole(event.target.value)}
                disabled={actorMembership.role === 'MANAGER'}
                className={inputClass}
              >
                {actorMembership.role === 'OWNER' && (
                  <option value="MANAGER">Manager</option>
                )}
                <option value="STAFF">Staff</option>
              </select>
            </div>
            <Button
              type="submit"
              disabled={addMutation.isPending || !identifier.trim()}
            >
              {addMutation.isPending ? 'Adding...' : 'Add member'}
            </Button>
          </form>
        </Card>
      )}

      {!canAdd && (
        <Card className="mb-6 border-dust/15 bg-stone-deep p-5">
          <p className="text-sm text-dust">
            Staff can view the team. Owners and managers control eligible local
            memberships.
          </p>
        </Card>
      )}

      {membersQuery.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="space-y-3 p-6">
              <Skeleton variant="title" className="w-1/3" />
              <Skeleton className="w-2/3" />
            </Card>
          ))}
        </div>
      )}
      {membersQuery.error && (
        <Card className="border-red-500/30 bg-red-500/5 p-6">
          <p className="text-sm text-red-300">
            Failed to load members: {membersQuery.error.message}
          </p>
        </Card>
      )}
      {!membersQuery.isLoading &&
        !membersQuery.error &&
        members.length === 0 && (
          <Card>
            <EmptyState
              title="No cooperative members"
              description="The approved owner membership should appear here."
            />
          </Card>
        )}

      <div className="space-y-3">
        {members.map((member) => {
          const isSelf = member.user.id === currentUserId;
          const canManage =
            !isSelf &&
            (actorMembership.role === 'OWNER'
              ? member.role !== 'OWNER'
              : actorMembership.role === 'MANAGER' && member.role === 'STAFF');
          const canChangeRole = canManage && actorMembership.role === 'OWNER';

          return (
            <Card key={member.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg text-ivory">
                      {member.user.name}
                    </h3>
                    <Badge
                      variant={member.role === 'OWNER' ? 'verified' : 'default'}
                    >
                      {member.role}
                    </Badge>
                    <Badge variant={member.isActive ? 'verified' : 'sold'}>
                      {member.isActive
                        ? 'Membership active'
                        : 'Membership paused'}
                    </Badge>
                    {!member.user.isActive && (
                      <Badge variant="sold">Platform account suspended</Badge>
                    )}
                    {isSelf && <Badge variant="pending">You</Badge>}
                  </div>
                  <p className="mt-2 break-words text-sm text-dust">
                    {member.user.email || 'No email'}
                    {member.user.phone ? ` · ${member.user.phone}` : ''}
                  </p>
                </div>

                {canManage ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {canChangeRole && (
                      <select
                        value={member.role}
                        onChange={(event) =>
                          roleMutation.mutate({
                            userId: member.user.id,
                            role: event.target.value,
                          })
                        }
                        disabled={roleMutation.isPending}
                        aria-label={`Change ${member.user.name}'s local role`}
                        className={`${inputClass} sm:w-36`}
                      >
                        <option value="MANAGER">Manager</option>
                        <option value="STAFF">Staff</option>
                      </select>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={member.isActive ? 'secondary' : 'outline'}
                      onClick={() =>
                        activeMutation.mutate({
                          userId: member.user.id,
                          isActive: !member.isActive,
                        })
                      }
                      disabled={activeMutation.isPending}
                    >
                      {member.isActive
                        ? 'Pause membership'
                        : 'Reactivate membership'}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-dust">
                    {isSelf
                      ? 'You cannot change your own membership.'
                      : 'This membership is outside your management scope.'}
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section') || 'overview';
  const section = SECTION_IDS.has(requestedSection)
    ? requestedSection
    : 'overview';
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [showNewListing, setShowNewListing] = useState(false);
  const [qrBatchId, setQrBatchId] = useState(null);
  const membership = user.cooperativeMembership;
  const cooperative = membership?.cooperative || user.cooperative;
  const cooperativeId =
    membership?.cooperativeId ?? user.cooperativeId ?? cooperative?.id;
  const canOperate =
    user.role === 'COOPERATIVE_STAFF' &&
    user.isActive !== false &&
    membership?.isActive === true &&
    cooperative?.isVerified === true;

  useEffect(() => {
    document.title = 'Dashboard - NectarTrace';
  }, []);

  const statsQuery = useQuery({
    queryKey: ['coop-stats', cooperativeId],
    queryFn: () =>
      cooperativesApi
        .stats(cooperativeId)
        .then((response) => response.data.data),
    enabled: canOperate,
  });

  const batchesQuery = useQuery({
    queryKey: ['my-batches'],
    queryFn: () =>
      batchesApi.myBatches().then((response) => response.data.data),
    enabled: canOperate,
  });

  if (!canOperate) {
    return (
      <CooperativeAccessState
        user={user}
        cooperativeId={cooperativeId}
        cooperative={cooperative}
      />
    );
  }

  const navigateSection = (nextSection) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('section', nextSection);
    setSearchParams(nextParams);
  };

  const sidebarItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'offers', label: 'Harvest offers' },
    { id: 'inventory', label: 'Batches & listings' },
    { id: 'team', label: 'Team' },
    { id: 'orders', label: 'Orders', to: '/orders' },
  ];

  return (
    <>
      <DashboardShell
        eyebrow="Cooperative operations"
        title={cooperative.name}
        description={`${user.name} · ${membership.role} membership`}
        items={sidebarItems}
        activeSection={section}
        onSectionChange={navigateSection}
      >
        {section === 'overview' && (
          <OverviewSection
            stats={statsQuery.data}
            loading={statsQuery.isLoading}
            error={statsQuery.error}
            cooperative={cooperative}
            membership={membership}
            onNavigate={navigateSection}
          />
        )}
        {section === 'offers' && <HarvestOffersSection />}
        {section === 'inventory' && (
          <InventorySection
            batches={batchesQuery.data || []}
            loading={batchesQuery.isLoading}
            error={batchesQuery.error}
            onNewBatch={() => setShowNewBatch(true)}
            onNewListing={() => setShowNewListing(true)}
            onQr={setQrBatchId}
          />
        )}
        {section === 'team' && (
          <TeamSection actorMembership={membership} currentUserId={user.id} />
        )}
      </DashboardShell>

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
    </>
  );
}
