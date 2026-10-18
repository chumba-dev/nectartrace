import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import MonoText from '../components/ui/MonoText';
import toast from 'react-hot-toast';

const adminApi = {
  listUsers: () => api.get('/admin/users'),
  assignCooperative: (userId, cooperativeId) =>
    api.put(`/admin/users/${userId}/cooperative`, { cooperativeId }),
  changeRole: (userId, role) =>
    api.put(`/admin/users/${userId}/role`, { role }),
};

export default function Admin() {
  const queryClient = useQueryClient();
  const [editUserId, setEditUserId] = useState(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers().then((res) => res.data.data),
  });

  const { data: cooperatives } = useQuery({
    queryKey: ['cooperatives'],
    queryFn: () =>
      api.get('/cooperatives').then((res) => res.data.data),
  });

  const assignMutation = useMutation({
    mutationFn: ({ userId, cooperativeId }) =>
      adminApi.assignCooperative(userId, cooperativeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Cooperative assigned');
      setEditUserId(null);
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
      <div className="mb-12">
        <p className="font-mono text-dust text-sm tracking-widest uppercase mb-4">
          Admin
        </p>
        <h1 className="text-display-lg font-display text-ivory mb-4">
          User management
        </h1>
        <p className="text-dust">
          Assign users to cooperatives and change roles.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-4">
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
                    <Badge variant="default">{user.role}</Badge>
                    {!user.isActive && <Badge variant="sold">Inactive</Badge>}
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
  );
}