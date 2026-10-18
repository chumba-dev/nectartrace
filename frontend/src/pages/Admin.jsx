import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
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
  const [showCreateCoop, setShowCreateCoop] = useState(false);

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers().then((res) => res.data.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.stats().then((res) => res.data.data),
  });

  const { data: cooperatives } = useQuery({
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

      {/* Cooperatives section */}
      <div className="mb-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="font-display text-2xl text-ivory">Cooperatives</h2>
          <Button onClick={() => setShowCreateCoop(true)}>
            + New cooperative
          </Button>
        </div>

        {cooperatives && cooperatives.length === 0 && (
          <Card className="p-6">
            <p className="text-dust text-sm">
              No cooperatives yet. Click "New cooperative" to create the first one.
            </p>
          </Card>
        )}

        {cooperatives && cooperatives.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {cooperatives.map((coop) => (
              <Card key={coop.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-display text-lg text-ivory">
                    {coop.name}
                  </h3>
                  <Badge variant="verified">Registered</Badge>
                </div>
                <p className="text-sm text-dust mb-3">
                  {coop.village}, {coop.county}
                </p>
                <MonoText className="block text-xs truncate">
                  {coop.walletAddress}
                </MonoText>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Users section */}
      <div>
        <h2 className="font-display text-2xl text-ivory mb-6">
          Users ({users?.length || 0})
        </h2>

        {loadingUsers && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6">
                <Skeleton variant="title" className="w-1/3" />
              </Card>
            ))}
          </div>
        )}

        {users && (
          <div className="space-y-3">
            {users.map((user) => (
              <Card key={user.id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h3 className="font-display text-lg text-ivory">
                        {user.name}
                      </h3>
                      <Badge variant={roleVariant[user.role] || 'default'}>
                        {user.role}
                      </Badge>
                      {!user.isActive && (
                        <Badge variant="sold">Inactive</Badge>
                      )}
                    </div>
                    <MonoText className="block text-sm">{user.phone}</MonoText>
                    <p className="text-sm text-dust mt-2">
                      Cooperative:{' '}
                      {user.cooperative ? (
                        <span className="text-ivory">
                          {user.cooperative.name}
                        </span>
                      ) : (
                        <span className="text-beeswax">Not assigned</span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* Assign cooperative */}
                    {user.role !== 'ADMIN' && (
                      <select
                        value={user.cooperativeId || ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            assignMutation.mutate({
                              userId: user.id,
                              cooperativeId: parseInt(e.target.value),
                            });
                          }
                        }}
                        className="px-3 py-2 bg-obsidian border border-dust/20 rounded-md text-ivory text-sm focus:border-beeswax focus:outline-none"
                      >
                        <option value="">Assign cooperative...</option>
                        {cooperatives?.map((coop) => (
                          <option key={coop.id} value={coop.id}>
                            {coop.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Change role */}
                    <select
                      value={user.role}
                      onChange={(e) =>
                        roleMutation.mutate({
                          userId: user.id,
                          role: e.target.value,
                        })
                      }
                      className="px-3 py-2 bg-obsidian border border-dust/20 rounded-md text-ivory text-sm focus:border-beeswax focus:outline-none"
                    >
                      <option value="BUYER">Buyer</option>
                      <option value="FARMER">Farmer</option>
                      <option value="COOPERATIVE_STAFF">Coop Staff</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
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