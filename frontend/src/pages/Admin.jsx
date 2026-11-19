import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import MonoText from '../components/ui/MonoText';
import Skeleton from '../components/ui/Skeleton';
import Modal from '../components/ui/Modal';

const adminApi = {
  listUsers: () => api.get('/admin/users'),
  assignCooperative: (userId, cooperativeId) =>
    api.put(`/admin/users/${userId}/cooperative`, { cooperativeId }),
  changeRole: (userId, role) =>
    api.put(`/admin/users/${userId}/role`, { role }),
  createCooperative: (data) => api.post('/admin/cooperatives', data),
  stats: () => api.get('/admin/stats'),
};

const roleVariant = {
  ADMIN: 'verified',
  COOPERATIVE_STAFF: 'pending',
  BUYER: 'default',
  FARMER: 'default',
};

export default function Admin() {
  const queryClient = useQueryClient();
  const { user: signedInAdmin } = useAuth();
  const [showCreateCoop, setShowCreateCoop] = useState(false);

  useEffect(() => {
    document.title = 'Admin — NectarTrace';
  }, []);

  const {
    data: users = [],
    isLoading: loadingUsers,
    error: usersError,
  } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers().then((res) => res.data.data),
  });

  const { data: stats, error: statsError } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.stats().then((res) => res.data.data),
  });

  const {
    data: cooperatives = [],
    isLoading: loadingCooperatives,
    error: cooperativesError,
  } = useQuery({
    queryKey: ['cooperatives'],
    queryFn: () => api.get('/cooperatives').then((res) => res.data.data),
  });

  const assignMutation = useMutation({
    mutationFn: ({ userId, cooperativeId }) =>
      adminApi.assignCooperative(userId, cooperativeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Cooperative assigned');
    },
    onError: (err) => toast.error(err.message),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }) => adminApi.changeRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Role updated');
    },
    onError: (err) => toast.error(err.message),
  });

  const cooperativeIds = new Set(cooperatives.map((coop) => coop.id));
  const cooperativeStaff = users.filter(
    (account) => account.role === 'COOPERATIVE_STAFF'
  );
  const unassignedStaff = cooperativeStaff.filter(
    (account) =>
      !account.cooperativeId || !cooperativeIds.has(account.cooperativeId)
  );
  const administrators = users.filter((account) => account.role === 'ADMIN');
  const otherAccounts = users.filter(
    (account) =>
      account.role !== 'ADMIN' && account.role !== 'COOPERATIVE_STAFF'
  );

  const assignCooperative = (account, cooperativeId) => {
    const parsedCooperativeId = Number(cooperativeId);
    if (!Number.isInteger(parsedCooperativeId) || parsedCooperativeId <= 0)
      return;
    if (parsedCooperativeId === account.cooperativeId) return;

    assignMutation.mutate({
      userId: account.id,
      cooperativeId: parsedCooperativeId,
    });
  };

  const cooperativeSelect = (
    account,
    placeholder = 'Assign cooperative...'
  ) => (
    <select
      value={account.cooperativeId || ''}
      onChange={(event) => assignCooperative(account, event.target.value)}
      disabled={assignMutation.isPending || cooperatives.length === 0}
      aria-label={`Assign ${account.name} to a cooperative`}
      className="w-full rounded-md border border-dust/20 bg-obsidian px-3 py-2 text-sm text-ivory focus:border-beeswax focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
    >
      <option value="">{placeholder}</option>
      {cooperatives.map((coop) => (
        <option key={coop.id} value={coop.id}>
          {coop.name}
        </option>
      ))}
    </select>
  );

  const roleSelect = (account) => (
    <select
      value={account.role}
      onChange={(event) =>
        roleMutation.mutate({
          userId: account.id,
          role: event.target.value,
        })
      }
      disabled={roleMutation.isPending}
      aria-label={`Change ${account.name}'s role`}
      className="w-full rounded-md border border-dust/20 bg-obsidian px-3 py-2 text-sm text-ivory focus:border-beeswax focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
    >
      <option value="BUYER">Buyer</option>
      <option value="FARMER">Farmer</option>
      <option value="COOPERATIVE_STAFF">Cooperative staff</option>
      <option value="ADMIN">Administrator</option>
    </select>
  );

  const queryError = usersError || cooperativesError || statsError;

  return (
    <div className="container-content py-20">
      {/* Header */}
      <div className="mb-12">
        <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4">
          Admin
        </p>
        <h1 className="text-display-lg font-display text-ivory mb-4">
          Platform control
        </h1>
        <p className="text-dust">
          Manage users, cooperatives, and monitor platform activity.
        </p>
      </div>

      {queryError && (
        <Card className="mb-8 border-red-500/30 bg-red-500/5 p-6">
          <p className="text-sm text-red-300">
            Failed to load part of the admin dashboard: {queryError.message}
          </p>
        </Card>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
          {[
            { label: 'Users', value: stats.users },
            { label: 'Cooperatives', value: stats.cooperatives },
            { label: 'Batches', value: stats.batches },
            { label: 'Listings', value: stats.listings },
            { label: 'Orders', value: stats.orders },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <p className="font-mono text-dust text-xs tracking-widest uppercase mb-2">
                {s.label}
              </p>
              <p className="font-display text-3xl text-beeswax">{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Cooperative teams */}
      <div className="mb-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl text-ivory">
              Cooperative teams
            </h2>
            <p className="mt-2 text-sm text-dust">
              Staff are grouped under the cooperative they represent.
            </p>
          </div>
          <Button onClick={() => setShowCreateCoop(true)}>
            + New cooperative
          </Button>
        </div>

        {(loadingUsers || loadingCooperatives) && (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((item) => (
              <Card key={item} className="space-y-4 p-6">
                <Skeleton variant="title" className="w-2/3" />
                <Skeleton className="w-full" />
                <Skeleton className="w-4/5" />
              </Card>
            ))}
          </div>
        )}

        {!loadingCooperatives && cooperatives.length === 0 && (
          <Card className="p-6">
            <p className="text-dust text-sm">
              No cooperatives yet. Click "New cooperative" to create the first
              one.
            </p>
          </Card>
        )}

        {!loadingUsers && !loadingCooperatives && cooperatives.length > 0 && (
          <div className="grid gap-5 xl:grid-cols-2">
            {cooperatives.map((coop) => (
              <Card key={coop.id} className="overflow-hidden">
                <div className="p-6">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-display text-xl text-ivory">
                        {coop.name}
                      </h3>
                      <p className="mt-1 text-sm text-dust">
                        {coop.village}, {coop.county}
                      </p>
                    </div>
                    <Badge variant="verified">Registered</Badge>
                  </div>
                  <MonoText className="block truncate text-xs">
                    {coop.walletAddress}
                  </MonoText>
                </div>

                <div className="border-t border-dust/10 bg-obsidian/35">
                  <div className="flex items-center justify-between px-6 py-4">
                    <p className="font-mono text-xs uppercase tracking-widest text-dust">
                      Cooperative staff
                    </p>
                    <span className="text-xs text-beeswax">
                      {
                        cooperativeStaff.filter(
                          (account) => account.cooperativeId === coop.id
                        ).length
                      }{' '}
                      assigned
                    </span>
                  </div>

                  {cooperativeStaff.filter(
                    (account) => account.cooperativeId === coop.id
                  ).length === 0 ? (
                    <p className="border-t border-dust/10 px-6 py-5 text-sm text-dust">
                      No staff assigned to this cooperative yet.
                    </p>
                  ) : (
                    cooperativeStaff
                      .filter((account) => account.cooperativeId === coop.id)
                      .map((account) => (
                        <div
                          key={account.id}
                          className="flex flex-col gap-4 border-t border-dust/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-ivory">
                                {account.name}
                              </p>
                              {!account.isActive && (
                                <Badge variant="sold">Inactive</Badge>
                              )}
                            </div>
                            <MonoText className="mt-1 block truncate text-xs">
                              {account.phone}
                            </MonoText>
                          </div>
                          {cooperativeSelect(account, 'Move to cooperative...')}
                        </div>
                      ))
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Staff awaiting assignment */}
      <div className="mb-12">
        <div className="mb-6">
          <h2 className="font-display text-2xl text-ivory">
            Staff awaiting assignment ({unassignedStaff.length})
          </h2>
          <p className="mt-2 text-sm text-dust">
            These users already registered as cooperative staff. Approve them by
            selecting their cooperative; no role change is required.
          </p>
        </div>

        {!loadingUsers && unassignedStaff.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-dust">
              No cooperative staff accounts are waiting for assignment.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {unassignedStaff.map((account) => (
              <Card key={account.id} className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-display text-lg text-ivory">
                        {account.name}
                      </h3>
                      <Badge variant="pending">Cooperative staff</Badge>
                    </div>
                    <MonoText className="mt-2 block truncate text-sm">
                      {account.phone}
                    </MonoText>
                  </div>
                  {cooperativeSelect(account)}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Administrators */}
      <div className="mb-12">
        <h2 className="mb-6 font-display text-2xl text-ivory">
          Administrators ({administrators.length})
        </h2>
        <div className="space-y-3">
          {administrators.map((account) => {
            const isCurrentAdmin = account.id === signedInAdmin?.id;
            return (
              <Card key={account.id} className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-display text-lg text-ivory">
                        {account.name}
                      </h3>
                      <Badge variant="verified">
                        {isCurrentAdmin
                          ? 'You · Administrator'
                          : 'Administrator'}
                      </Badge>
                    </div>
                    <MonoText className="mt-2 block truncate text-sm">
                      {account.phone}
                    </MonoText>
                  </div>
                  {isCurrentAdmin ? (
                    <p className="rounded-md border border-sage/30 bg-sage/10 px-3 py-2 text-xs text-sage">
                      Your administrator role is protected
                    </p>
                  ) : (
                    roleSelect(account)
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Other accounts */}
      <div>
        <h2 className="mb-2 font-display text-2xl text-ivory">
          Buyer and farmer accounts ({otherAccounts.length})
        </h2>
        <p className="mb-6 text-sm text-dust">
          Change an account to cooperative staff only when it should enter the
          assignment queue above.
        </p>

        {otherAccounts.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-dust">
              No buyer or farmer accounts yet.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {otherAccounts.map((account) => (
              <Card key={account.id} className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-display text-lg text-ivory">
                        {account.name}
                      </h3>
                      <Badge variant={roleVariant[account.role] || 'default'}>
                        {account.role}
                      </Badge>
                      {!account.isActive && (
                        <Badge variant="sold">Inactive</Badge>
                      )}
                    </div>
                    <MonoText className="mt-2 block truncate text-sm">
                      {account.phone}
                    </MonoText>
                  </div>
                  {roleSelect(account)}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create cooperative modal */}
      <CreateCooperativeModal
        isOpen={showCreateCoop}
        onClose={() => setShowCreateCoop(false)}
      />
    </div>
  );
}

// ============================================
// CREATE COOPERATIVE MODAL
// ============================================

function CreateCooperativeModal({ isOpen, onClose }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    village: '',
    county: 'Baringo',
    walletAddress: '',
    registrationNumber: '',
    phone: '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => adminApi.createCooperative(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cooperatives'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Cooperative created and registered on-chain');
      setForm({
        name: '',
        village: '',
        county: 'Baringo',
        walletAddress: '',
        registrationNumber: '',
        phone: '',
      });
      onClose();
    },
    onError: (err) => {
      setError(err.message || 'Failed to create cooperative');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    mutation.mutate(form);
  };

  const inputClass =
    'w-full px-4 py-3 bg-obsidian border border-dust/20 rounded-md text-ivory placeholder:text-dust/50 focus:border-beeswax focus:outline-none transition-colors';
  const labelClass = 'block text-sm text-dust mb-2';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create cooperative">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        <div>
          <label className={labelClass}>Cooperative name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Baringo Highlands Honey Cooperative"
            className={inputClass}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Village *</label>
            <input
              type="text"
              value={form.village}
              onChange={(e) => setForm({ ...form, village: e.target.value })}
              placeholder="Kabarnet"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>County</label>
            <input
              type="text"
              value={form.county}
              onChange={(e) => setForm({ ...form, county: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Wallet address *</label>
          <input
            type="text"
            value={form.walletAddress}
            onChange={(e) =>
              setForm({ ...form, walletAddress: e.target.value.trim() })
            }
            placeholder="0x..."
            className={`${inputClass} font-mono text-sm`}
            required
          />
          <p className="text-xs text-dust mt-1.5">
            This wallet will be registered on the blockchain as a cooperative.
          </p>
        </div>

        <div>
          <label className={labelClass}>Registration number</label>
          <input
            type="text"
            value={form.registrationNumber}
            onChange={(e) =>
              setForm({ ...form, registrationNumber: e.target.value })
            }
            placeholder="COOP-001"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+254 700 000 000"
            className={inputClass}
          />
        </div>

        <div className="bg-obsidian/50 border border-dust/10 rounded-md p-4 text-xs text-dust">
          <p className="mb-2">
            <strong className="text-ivory">On submit:</strong>
          </p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Cooperative wallet registered on blockchain</li>
            <li>Saved to database</li>
            <li>Available for user assignment</li>
          </ul>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
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
            {mutation.isPending
              ? 'Registering on-chain...'
              : 'Create cooperative'}
          </Button>
        </div>

        {mutation.isPending && (
          <p className="text-xs text-dust text-center">
            This may take ~15 seconds (blockchain write).
          </p>
        )}
      </form>
    </Modal>
  );
}
