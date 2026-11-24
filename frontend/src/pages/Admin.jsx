import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  adminApplicationsApi,
  adminCooperativesApi,
  adminOrdersApi,
  adminStatsApi,
  adminUsersApi,
  cooperativesApi,
  notificationsApi,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import DashboardShell from '../components/DashboardShell';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import MonoText from '../components/ui/MonoText';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';

const SECTION_IDS = new Set([
  'overview',
  'applications',
  'cooperatives',
  'farmers',
  'buyers',
  'consumers',
  'members',
  'administrators',
  'orders',
]);

const USER_SECTIONS = {
  farmers: { role: 'FARMER', title: 'Farmers' },
  buyers: { role: 'BUYER', title: 'Buyers' },
  consumers: { role: 'CONSUMER', title: 'Consumers' },
  members: { role: 'COOPERATIVE_STAFF', title: 'Cooperative members' },
  administrators: { role: 'ADMIN', title: 'Administrators' },
};

const APPLICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];
const statusVariant = {
  PENDING: 'pending',
  APPROVED: 'verified',
  REJECTED: 'sold',
  CONFIRMED: 'verified',
  DELIVERED: 'verified',
  CANCELLED: 'sold',
};
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

function formatCommission(value) {
  const commission = Number(value);
  if (!Number.isFinite(commission)) return 'Not available';
  return `${new Intl.NumberFormat('en-KE', {
    maximumFractionDigits: 2,
  }).format(commission)}%`;
}

function formatKes(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Not available';
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(amount);
}

function roleLabel(role) {
  return {
    FARMER: 'Farmer',
    BUYER: 'Buyer',
    CONSUMER: 'Consumer',
    COOPERATIVE_STAFF: 'Cooperative staff',
    ADMIN: 'Administrator',
  }[role];
}

function ErrorCard({ children }) {
  return (
    <Card className="border-red-500/30 bg-red-500/5 p-6">
      <p className="text-sm text-red-300">{children}</p>
    </Card>
  );
}

function StatCard({ label, value, loading, note }) {
  return (
    <Card className="p-5">
      <p className="font-mono text-xs uppercase tracking-widest text-dust">
        {label}
      </p>
      {loading ? (
        <Skeleton variant="title" className="mt-3 w-20" />
      ) : (
        <p className="mt-3 font-display text-3xl text-beeswax">{value ?? 0}</p>
      )}
      {note && <p className="mt-2 text-xs text-dust">{note}</p>}
    </Card>
  );
}

function OverviewSection({
  stats,
  loading,
  error,
  pendingApplications,
  onNavigate,
}) {
  if (error)
    return <ErrorCard>Failed to load overview: {error.message}</ErrorCard>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl text-ivory">Platform overview</h2>
        <p className="mt-2 text-sm text-dust">
          Governance queues and current marketplace activity at a glance.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <StatCard label="Users" value={stats?.users} loading={loading} />
        <StatCard
          label="Cooperatives"
          value={stats?.cooperatives}
          loading={loading}
        />
        <StatCard label="Batches" value={stats?.batches} loading={loading} />
        <StatCard label="Listings" value={stats?.listings} loading={loading} />
        <StatCard label="Orders" value={stats?.orders} loading={loading} />
        <StatCard
          label="Pending applications"
          value={stats?.pendingCooperativeApplications ?? pendingApplications}
          loading={loading}
          note="Requires administrator review"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-beeswax/20 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-beeswax">
            Review queue
          </p>
          <h3 className="mt-3 font-display text-xl text-ivory">
            {pendingApplications} cooperative application
            {pendingApplications === 1 ? '' : 's'} pending
          </h3>
          <p className="mt-2 text-sm leading-6 text-dust">
            Review registration, location, wallet, and commission details before
            approving on-chain access.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-5"
            onClick={() => onNavigate('applications')}
          >
            Review applications
          </Button>
        </Card>
        <Card className="p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-dust">
            Oversight
          </p>
          <h3 className="mt-3 font-display text-xl text-ivory">
            Marketplace orders remain read-only
          </h3>
          <p className="mt-2 text-sm leading-6 text-dust">
            Administrators can inspect and filter orders without changing their
            cooperative-managed lifecycle.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-5"
            onClick={() => onNavigate('orders')}
          >
            Open order oversight
          </Button>
        </Card>
      </div>
    </div>
  );
}

function ApplicationsSection({
  applications,
  loading,
  error,
  selectedStatus,
  onStatusChange,
  onApprove,
  onReject,
}) {
  const counts = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [
      status,
      applications.filter((application) => application.status === status)
        .length,
    ])
  );
  const filtered = applications.filter(
    (application) => application.status === selectedStatus
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ivory">
          Cooperative applications
        </h2>
        <p className="mt-2 text-sm text-dust">
          Application approval creates the verified cooperative and its owner
          membership in one protected backend transaction.
        </p>
      </div>

      <div
        className="mb-6 flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Application status"
      >
        {APPLICATION_STATUSES.map((status) => {
          const active = selectedStatus === status;
          return (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onStatusChange(status)}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-beeswax bg-beeswax text-obsidian'
                  : 'border-dust/20 text-dust hover:border-beeswax/50 hover:text-ivory'
              }`}
            >
              {status.charAt(0) + status.slice(1).toLowerCase()} (
              {counts[status]})
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="space-y-4">
          {[1, 2].map((item) => (
            <Card key={item} className="space-y-4 p-6">
              <Skeleton variant="title" className="w-1/2" />
              <Skeleton className="w-full" />
              <Skeleton className="w-4/5" />
            </Card>
          ))}
        </div>
      )}
      {error && (
        <ErrorCard>Failed to load applications: {error.message}</ErrorCard>
      )}
      {!loading && !error && filtered.length === 0 && (
        <Card>
          <EmptyState
            title={`No ${selectedStatus.toLowerCase()} applications`}
            description="Applications in this review state will appear here."
          />
        </Card>
      )}

      <div className="space-y-4">
        {filtered.map((application) => (
          <Card key={application.id} className="overflow-hidden">
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-beeswax">
                    Application #{application.id}
                  </p>
                  <h3 className="mt-2 font-display text-2xl text-ivory">
                    {application.name}
                  </h3>
                  <p className="mt-1 text-sm text-dust">
                    Applicant: {application.applicant?.name || 'Unavailable'}
                    {application.applicant?.phone
                      ? ` · ${application.applicant.phone}`
                      : ''}
                  </p>
                </div>
                <Badge variant={statusVariant[application.status]}>
                  {application.status}
                </Badge>
              </div>

              <dl className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-xs text-dust">Registration</dt>
                  <dd className="mt-1 break-words text-sm text-ivory">
                    {application.registrationNumber}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-dust">Location</dt>
                  <dd className="mt-1 text-sm text-ivory">
                    {application.village}, {application.ward}
                    {application.county ? `, ${application.county}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-dust">Commission</dt>
                  <dd className="mt-1 text-sm text-ivory">
                    {formatCommission(application.commissionPercent)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-dust">Submitted</dt>
                  <dd className="mt-1 text-sm text-ivory">
                    {formatDate(application.createdAt, true)}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 rounded-md border border-dust/10 bg-obsidian/40 p-4">
                <p className="text-xs text-dust">Cooperative wallet</p>
                <MonoText className="mt-1 block break-all text-xs text-ivory">
                  {application.walletAddress}
                </MonoText>
              </div>

              {application.status === 'REJECTED' && (
                <div className="mt-5 rounded-md border border-red-500/20 bg-red-500/5 p-4">
                  <p className="font-mono text-xs uppercase tracking-widest text-red-300">
                    Rejection reason
                  </p>
                  <p className="mt-2 text-sm leading-6 text-dust">
                    {application.rejectionReason}
                  </p>
                </div>
              )}

              {application.status !== 'PENDING' && (
                <p className="mt-5 text-xs text-dust">
                  Reviewed {formatDate(application.reviewedAt, true)}
                  {application.reviewedBy?.name
                    ? ` by ${application.reviewedBy.name}`
                    : ''}
                  {application.cooperative?.name
                    ? ` · ${application.cooperative.name}`
                    : ''}
                </p>
              )}
            </div>

            {application.status === 'PENDING' && (
              <div className="flex flex-wrap gap-3 border-t border-dust/10 bg-obsidian/25 px-6 py-4">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onApprove(application)}
                >
                  Approve application
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onReject(application)}
                >
                  Reject with reason
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function CooperativesSection({
  cooperatives,
  users,
  loading,
  error,
  onCreate,
  onVerify,
  verifyMutation,
}) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ivory">Cooperatives</h2>
          <p className="mt-2 text-sm text-dust">
            Approved organizations, verification state, commission, and local
            membership counts.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onCreate}>
          Manual support create
        </Button>
      </div>

      {loading && (
        <div className="grid gap-4 xl:grid-cols-2">
          {[1, 2].map((item) => (
            <Card key={item} className="space-y-4 p-6">
              <Skeleton variant="title" className="w-2/3" />
              <Skeleton className="w-full" />
            </Card>
          ))}
        </div>
      )}
      {error && (
        <ErrorCard>Failed to load cooperatives: {error.message}</ErrorCard>
      )}
      {!loading && !error && cooperatives.length === 0 && (
        <Card>
          <EmptyState
            title="No cooperatives"
            description="Approved applications and manual support records will appear here."
          />
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {cooperatives.map((cooperative) => {
          const members = users.filter(
            (account) =>
              account.cooperativeMembership?.cooperativeId === cooperative.id ||
              (!account.cooperativeMembership &&
                account.cooperativeId === cooperative.id)
          );
          return (
            <Card key={cooperative.id} className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-xl text-ivory">
                    {cooperative.name}
                  </h3>
                  <p className="mt-1 text-sm text-dust">
                    {cooperative.village}
                    {cooperative.ward ? `, ${cooperative.ward}` : ''}
                    {cooperative.county ? ` · ${cooperative.county}` : ''}
                  </p>
                </div>
                <Badge
                  variant={cooperative.isVerified ? 'verified' : 'pending'}
                >
                  {cooperative.isVerified ? 'Verified' : 'Unverified'}
                </Badge>
              </div>

              <dl className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs text-dust">Commission</dt>
                  <dd className="mt-1 text-lg text-ivory">
                    {formatCommission(cooperative.commissionPercent)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-dust">Members</dt>
                  <dd className="mt-1 text-lg text-ivory">{members.length}</dd>
                </div>
                <div>
                  <dt className="text-xs text-dust">Registration</dt>
                  <dd className="mt-1 break-words text-sm text-ivory">
                    {cooperative.registrationNumber || 'Not provided'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-dust">Verified</dt>
                  <dd className="mt-1 text-sm text-ivory">
                    {cooperative.isVerified
                      ? formatDate(cooperative.verifiedAt)
                      : 'Awaiting support review'}
                  </dd>
                </div>
              </dl>

              <MonoText className="mt-5 block truncate text-xs">
                {cooperative.walletAddress}
              </MonoText>

              {!cooperative.isVerified && (
                <div className="mt-5 border-t border-dust/10 pt-5">
                  <p className="text-xs leading-5 text-dust">
                    Manual verification is a support path. Normal application
                    approval verifies the cooperative automatically.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3"
                    onClick={() => onVerify(cooperative.id)}
                    disabled={verifyMutation.isPending}
                  >
                    {verifyMutation.isPending &&
                    verifyMutation.variables === cooperative.id
                      ? 'Verifying on-chain...'
                      : 'Verify cooperative'}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function UsersSection({
  config,
  users,
  currentUserId,
  loading,
  error,
  activeMutation,
}) {
  const filtered = users.filter((account) => account.role === config.role);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ivory">{config.title}</h2>
        <p className="mt-2 text-sm text-dust">
          Global identity and platform role are read-only. Account suspension is
          the only administrator action available here.
        </p>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="p-6">
              <Skeleton variant="title" className="w-1/3" />
              <Skeleton className="mt-3 w-2/3" />
            </Card>
          ))}
        </div>
      )}
      {error && <ErrorCard>Failed to load users: {error.message}</ErrorCard>}
      {!loading && !error && filtered.length === 0 && (
        <Card>
          <EmptyState
            title={`No ${config.title.toLowerCase()}`}
            description="Accounts with this platform role will appear here."
          />
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((account) => {
          const isSelf = account.id === currentUserId;
          const membership = account.cooperativeMembership;
          return (
            <Card key={account.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg text-ivory">
                      {account.name}
                    </h3>
                    <Badge
                      variant={
                        account.role === 'ADMIN' ? 'verified' : 'default'
                      }
                    >
                      {roleLabel(account.role)}
                    </Badge>
                    <Badge variant={account.isActive ? 'verified' : 'sold'}>
                      {account.isActive ? 'Active' : 'Suspended'}
                    </Badge>
                    {isSelf && <Badge variant="pending">You</Badge>}
                  </div>
                  <p className="mt-2 break-words text-sm text-dust">
                    {account.email || 'No email'}
                    {account.phone ? ` · ${account.phone}` : ''}
                  </p>
                  {account.role === 'COOPERATIVE_STAFF' && (
                    <p className="mt-2 text-xs text-dust">
                      {account.cooperative?.name || 'No cooperative membership'}
                      {membership
                        ? ` · Local role ${membership.role} · ${
                            membership.isActive
                              ? 'membership active'
                              : 'membership inactive'
                          }`
                        : ''}
                    </p>
                  )}
                </div>
                {isSelf ? (
                  <p className="text-xs text-dust">
                    Self-suspension is blocked by the backend.
                  </p>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant={account.isActive ? 'secondary' : 'outline'}
                    onClick={() =>
                      activeMutation.mutate({
                        id: account.id,
                        isActive: !account.isActive,
                      })
                    }
                    disabled={activeMutation.isPending}
                  >
                    {activeMutation.isPending &&
                    activeMutation.variables?.id === account.id
                      ? 'Updating...'
                      : account.isActive
                        ? 'Suspend account'
                        : 'Reactivate account'}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function OrdersOversightSection({
  orders,
  cooperatives,
  loading,
  error,
  cooperativeFilter,
  statusFilter,
  onCooperativeFilter,
  onStatusFilter,
}) {
  const groups = orders.reduce((grouped, order) => {
    const cooperative = order.listing?.cooperative;
    const key = cooperative?.id || 'unknown';
    const existing = grouped.get(key) || {
      cooperative,
      orders: [],
    };
    existing.orders.push(order);
    grouped.set(key, existing);
    return grouped;
  }, new Map());

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ivory">Order oversight</h2>
        <p className="mt-2 text-sm text-dust">
          Read-only visibility across cooperative orders. Status changes remain
          with active cooperative members.
        </p>
      </div>

      <div className="mb-6 grid gap-4 rounded-xl border border-dust/15 bg-stone-deep p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="admin-order-cooperative" className={labelClass}>
            Cooperative
          </label>
          <select
            id="admin-order-cooperative"
            value={cooperativeFilter}
            onChange={(event) => onCooperativeFilter(event.target.value)}
            className={inputClass}
          >
            <option value="">All cooperatives</option>
            {cooperatives.map((cooperative) => (
              <option key={cooperative.id} value={cooperative.id}>
                {cooperative.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="admin-order-status" className={labelClass}>
            Status
          </label>
          <select
            id="admin-order-status"
            value={statusFilter}
            onChange={(event) => onStatusFilter(event.target.value)}
            className={inputClass}
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="space-y-4">
          {[1, 2].map((item) => (
            <Card key={item} className="space-y-3 p-6">
              <Skeleton variant="title" className="w-1/3" />
              <Skeleton className="w-full" />
            </Card>
          ))}
        </div>
      )}
      {error && <ErrorCard>Failed to load orders: {error.message}</ErrorCard>}
      {!loading && !error && orders.length === 0 && (
        <Card>
          <EmptyState
            title="No matching orders"
            description="Change the cooperative or status filter to broaden the result."
          />
        </Card>
      )}

      <div className="space-y-7">
        {[...groups.values()].map((group) => (
          <section key={group.cooperative?.id || 'unknown'}>
            <div className="mb-3 flex items-center justify-between gap-4">
              <h3 className="font-display text-xl text-ivory">
                {group.cooperative?.name || 'Unknown cooperative'}
              </h3>
              <span className="text-xs text-dust">
                {group.orders.length} order
                {group.orders.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="space-y-3">
              {group.orders.map((order) => (
                <Card key={order.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <MonoText className="text-beeswax">
                          {order.listing?.batch?.batchId ||
                            `Order #${order.id}`}
                        </MonoText>
                        <Badge variant={statusVariant[order.status]}>
                          {order.status}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm text-ivory">
                        {order.buyer?.name || 'Unknown buyer'}
                        {order.buyer?.phone ? ` · ${order.buyer.phone}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-dust">
                        {order.quantityKg} kg · Placed{' '}
                        {formatDate(order.createdAt, true)}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="font-display text-xl text-ivory">
                        {formatKes(order.totalPrice)}
                      </p>
                      <p className="mt-1 font-mono text-xs text-dust">
                        Order #{order.id}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function Admin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section') || 'overview';
  const section = SECTION_IDS.has(requestedSection)
    ? requestedSection
    : 'overview';
  const [applicationStatus, setApplicationStatus] = useState('PENDING');
  const [cooperativeFilter, setCooperativeFilter] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showCreateCooperative, setShowCreateCooperative] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    document.title = 'Admin - NectarTrace';
  }, []);

  const statsQuery = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminStatsApi.get().then((response) => response.data.data),
  });
  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () =>
      notificationsApi
        .unreadCount()
        .then((response) => response.data.data.count),
    refetchInterval: 45_000,
  });
  const applicationsQuery = useQuery({
    queryKey: ['admin-applications'],
    queryFn: () =>
      adminApplicationsApi.list().then((response) => response.data.data),
    refetchInterval: 45_000,
  });
  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminUsersApi.list().then((response) => response.data.data),
  });
  const cooperativesQuery = useQuery({
    queryKey: ['cooperatives'],
    queryFn: () =>
      cooperativesApi.list().then((response) => response.data.data),
  });
  const ordersQuery = useQuery({
    queryKey: ['admin-orders', cooperativeFilter, orderStatus],
    queryFn: () =>
      adminOrdersApi
        .list({
          ...(cooperativeFilter && { cooperativeId: cooperativeFilter }),
          ...(orderStatus && { status: orderStatus }),
        })
        .then((response) => response.data.data),
    enabled: section === 'orders',
  });

  const invalidateGovernance = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-applications'] });
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    queryClient.invalidateQueries({ queryKey: ['cooperatives'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const approveMutation = useMutation({
    mutationFn: (id) => adminApplicationsApi.approve(id),
    onSuccess: () => {
      invalidateGovernance();
      setApproveTarget(null);
      toast.success('Cooperative application approved');
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => adminApplicationsApi.reject(id, reason),
    onSuccess: () => {
      invalidateGovernance();
      setRejectTarget(null);
      setRejectReason('');
      toast.success('Cooperative application rejected');
    },
    onError: (error) => toast.error(error.message),
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }) => adminUsersApi.updateActive(id, isActive),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(
        variables.isActive ? 'Account reactivated' : 'Account suspended'
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const verifyMutation = useMutation({
    mutationFn: (id) => adminCooperativesApi.verify(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cooperatives'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Cooperative verified');
    },
    onError: (error) => toast.error(error.message),
  });

  const applications = applicationsQuery.data || [];
  const users = usersQuery.data || [];
  const cooperatives = cooperativesQuery.data || [];
  const pendingApplicationCount = applications.filter(
    (application) => application.status === 'PENDING'
  ).length;
  const unreadAdminNotifications =
    unreadQuery.data ?? statsQuery.data?.unreadAdminNotifications ?? 0;

  const sidebarItems = [
    {
      id: 'overview',
      label: 'Overview',
      badge: unreadAdminNotifications || undefined,
    },
    {
      id: 'applications',
      label: 'Applications',
      badge: pendingApplicationCount || undefined,
    },
    { id: 'cooperatives', label: 'Cooperatives' },
    { id: 'farmers', label: 'Farmers' },
    { id: 'buyers', label: 'Buyers' },
    { id: 'consumers', label: 'Consumers' },
    { id: 'members', label: 'Cooperative members' },
    { id: 'administrators', label: 'Administrators' },
    { id: 'orders', label: 'Order oversight' },
  ];

  const navigateSection = (nextSection) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('section', nextSection);
    setSearchParams(nextParams);
  };

  const openRejectModal = (application) => {
    setRejectReason('');
    setRejectTarget(application);
  };

  const submitRejection = (event) => {
    event.preventDefault();
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error('A rejection reason is required');
      return;
    }
    rejectMutation.mutate({ id: rejectTarget.id, reason });
  };

  return (
    <>
      <DashboardShell
        eyebrow="Administration"
        title="Platform governance"
        description="Review cooperative applications, inspect platform identities, and oversee marketplace activity without crossing operational permissions."
        items={sidebarItems}
        activeSection={section}
        onSectionChange={navigateSection}
      >
        {section === 'overview' && (
          <OverviewSection
            stats={statsQuery.data}
            loading={statsQuery.isLoading}
            error={statsQuery.error}
            pendingApplications={pendingApplicationCount}
            onNavigate={navigateSection}
          />
        )}
        {section === 'applications' && (
          <ApplicationsSection
            applications={applications}
            loading={applicationsQuery.isLoading}
            error={applicationsQuery.error}
            selectedStatus={applicationStatus}
            onStatusChange={setApplicationStatus}
            onApprove={setApproveTarget}
            onReject={openRejectModal}
          />
        )}
        {section === 'cooperatives' && (
          <CooperativesSection
            cooperatives={cooperatives}
            users={users}
            loading={cooperativesQuery.isLoading || usersQuery.isLoading}
            error={cooperativesQuery.error || usersQuery.error}
            onCreate={() => setShowCreateCooperative(true)}
            onVerify={(id) => verifyMutation.mutate(id)}
            verifyMutation={verifyMutation}
          />
        )}
        {USER_SECTIONS[section] && (
          <UsersSection
            config={USER_SECTIONS[section]}
            users={users}
            currentUserId={user.id}
            loading={usersQuery.isLoading}
            error={usersQuery.error}
            activeMutation={activeMutation}
          />
        )}
        {section === 'orders' && (
          <OrdersOversightSection
            orders={ordersQuery.data || []}
            cooperatives={cooperatives}
            loading={ordersQuery.isLoading || cooperativesQuery.isLoading}
            error={ordersQuery.error || cooperativesQuery.error}
            cooperativeFilter={cooperativeFilter}
            statusFilter={orderStatus}
            onCooperativeFilter={setCooperativeFilter}
            onStatusFilter={setOrderStatus}
          />
        )}
      </DashboardShell>

      <Modal
        isOpen={Boolean(approveTarget)}
        onClose={() => !approveMutation.isPending && setApproveTarget(null)}
        title="Approve cooperative application"
      >
        <p className="text-sm leading-6 text-dust">
          Approving{' '}
          <strong className="text-ivory">{approveTarget?.name}</strong> creates
          and verifies the cooperative, grants its blockchain role, and makes
          the applicant its owner. This action cannot be reviewed as pending
          again.
        </p>
        <div className="mt-6 flex gap-3">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={() => setApproveTarget(null)}
            disabled={approveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => approveMutation.mutate(approveTarget.id)}
            disabled={approveMutation.isPending}
          >
            {approveMutation.isPending ? 'Approving...' : 'Confirm approval'}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(rejectTarget)}
        onClose={() => !rejectMutation.isPending && setRejectTarget(null)}
        title="Reject cooperative application"
      >
        <form onSubmit={submitRejection}>
          <p className="text-sm leading-6 text-dust">
            Explain what {rejectTarget?.name} must correct before submitting a
            new application.
          </p>
          <div className="mt-5">
            <label htmlFor="rejection-reason" className={labelClass}>
              Rejection reason *
            </label>
            <textarea
              id="rejection-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows="5"
              maxLength="1000"
              className={inputClass}
              required
            />
            <p className="mt-1 text-right text-xs text-dust">
              {rejectReason.length}/1000
            </p>
          </div>
          <div className="mt-6 flex gap-3">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => setRejectTarget(null)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="secondary"
              className="flex-1"
              disabled={rejectMutation.isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Reject application'}
            </Button>
          </div>
        </form>
      </Modal>

      <CreateCooperativeModal
        isOpen={showCreateCooperative}
        onClose={() => setShowCreateCooperative(false)}
      />
    </>
  );
}

function CreateCooperativeModal({ isOpen, onClose }) {
  const queryClient = useQueryClient();
  const emptyForm = {
    name: '',
    village: '',
    ward: '',
    county: 'Baringo',
    walletAddress: '',
    registrationNumber: '',
    phone: '',
    commissionPercent: '0',
  };
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => adminCooperativesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cooperatives'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Support cooperative created');
      setForm(emptyForm);
      setError('');
      onClose();
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
    if (
      !Number.isFinite(commissionPercent) ||
      commissionPercent < 0 ||
      commissionPercent > 100
    ) {
      setError('Commission percent must be between 0 and 100');
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(form.walletAddress.trim())) {
      setError('Enter a valid Ethereum wallet address');
      return;
    }

    mutation.mutate({
      name: form.name.trim(),
      village: form.village.trim(),
      ...(form.ward.trim() && { ward: form.ward.trim() }),
      ...(form.county.trim() && { county: form.county.trim() }),
      walletAddress: form.walletAddress.trim(),
      ...(form.registrationNumber.trim() && {
        registrationNumber: form.registrationNumber.trim(),
      }),
      ...(form.phone.trim() && { phone: form.phone.trim() }),
      commissionPercent,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !mutation.isPending && onClose()}
      title="Manual cooperative support"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm leading-6 text-dust">
          Use only for support or migrated records. New cooperative owners
          should normally use the application workflow.
        </p>
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="support-coop-name" className={labelClass}>
            Cooperative name *
          </label>
          <input
            id="support-coop-name"
            name="name"
            value={form.name}
            onChange={updateField}
            className={inputClass}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="support-coop-village" className={labelClass}>
              Village *
            </label>
            <input
              id="support-coop-village"
              name="village"
              value={form.village}
              onChange={updateField}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="support-coop-ward" className={labelClass}>
              Ward
            </label>
            <input
              id="support-coop-ward"
              name="ward"
              value={form.ward}
              onChange={updateField}
              maxLength="120"
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="support-coop-county" className={labelClass}>
              County
            </label>
            <input
              id="support-coop-county"
              name="county"
              value={form.county}
              onChange={updateField}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="support-coop-commission" className={labelClass}>
              Commission percent *
            </label>
            <input
              id="support-coop-commission"
              name="commissionPercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.commissionPercent}
              onChange={updateField}
              className={inputClass}
              required
            />
          </div>
        </div>
        <div>
          <label htmlFor="support-coop-wallet" className={labelClass}>
            Ethereum wallet *
          </label>
          <input
            id="support-coop-wallet"
            name="walletAddress"
            value={form.walletAddress}
            onChange={updateField}
            placeholder="0x..."
            className={`${inputClass} font-mono text-sm`}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="support-coop-registration" className={labelClass}>
              Registration number
            </label>
            <input
              id="support-coop-registration"
              name="registrationNumber"
              value={form.registrationNumber}
              onChange={updateField}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="support-coop-phone" className={labelClass}>
              Phone
            </label>
            <input
              id="support-coop-phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={updateField}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Creating...' : 'Create support record'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
