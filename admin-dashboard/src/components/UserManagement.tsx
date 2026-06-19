import { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, Search, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

interface SaaSUser {
  id: number;
  email: string;
  subscription_status: 'active' | 'inactive';
  tier: 'trial' | 'plus';
  trial_ends_at: string | null;
  paystack_subscription_code: string | null;
  sessions_count: number;
  announcements_count: number;
  created_at: string;
}

const UserManagement = () => {
  const [users, setUsers] = useState<SaaSUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionId, setActionId] = useState<number | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/users');
      setUsers(res.data.users || []);
    } catch (err: any) {
      console.error('Failed to fetch SaaS users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSubscription = async (userId: number) => {
    setActionId(userId);
    try {
      await axios.post(`/api/admin/users/${userId}/subscription`);
      await fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to toggle user subscription.');
    } finally {
      setActionId(null);
    }
  };

  const handleToggleTier = async (userId: number, newTier: 'trial' | 'plus') => {
    setActionId(userId);
    try {
      await axios.post(`/api/admin/users/${userId}/tier`, { tier: newTier });
      await fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update user subscription tier.');
    } finally {
      setActionId(null);
    }
  };

  // Filter users based on search
  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  // Compute stats
  const totalUsers = users.length;
  const activeSubs = users.filter(u => u.subscription_status === 'active').length;
  const inactiveSubs = totalUsers - activeSubs;

  return (
    <div className="space-y-6">
      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total SaaS Users</p>
            <h3 className="text-3xl font-extrabold text-white mt-1">{totalUsers}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Users size={24} />
          </div>
        </div>

        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Subscribers</p>
            <h3 className="text-3xl font-extrabold text-emerald-400 mt-1">{activeSubs}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <CheckCircle size={24} />
          </div>
        </div>

        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inactive Accounts</p>
            <h3 className="text-3xl font-extrabold text-red-400 mt-1">{inactiveSubs}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center">
            <XCircle size={24} />
          </div>
        </div>
      </div>

      {/* Table & Filtering */}
      <div className="glass-card flex flex-col overflow-hidden">
        {/* Table Header Filter controls */}
        <div className="p-6 border-b border-slate-700/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/20">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search users by email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary placeholder-slate-600 transition-colors"
            />
          </div>

          <button
            onClick={fetchUsers}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 hover:border-slate-700 text-xs text-slate-300 font-bold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* User Database Table */}
        <div className="overflow-x-auto">
          {loading && users.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
              <p className="text-slate-500 text-xs">Loading SaaS users list...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              No registered SaaS users found.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-[10px] font-bold uppercase tracking-wider bg-slate-900/10">
                  <th className="px-6 py-4">User ID</th>
                  <th className="px-6 py-4">Email Address</th>
                  <th className="px-6 py-4">Plan Details</th>
                  <th className="px-6 py-4">Usage Metrics</th>
                  <th className="px-6 py-4">Signup Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300 text-xs">
                {filteredUsers.map(user => {
                  const isActive = user.subscription_status === 'active';
                  const isManualUpgrade = user.tier === 'plus' && !user.paystack_subscription_code;
                  return (
                    <tr key={user.id} className="hover:bg-slate-900/20 transition-colors">
                       <td className="px-6 py-4 text-slate-500 font-mono font-medium">#{user.id}</td>
                      <td className="px-6 py-4 font-semibold text-white">{user.email}</td>
                      <td className="px-6 py-4 space-y-1">
                        <div className="flex gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                            {user.subscription_status}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${user.tier === 'plus' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>
                            {user.tier}
                          </span>
                          {isManualUpgrade && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              Manual
                            </span>
                          )}
                        </div>
                        {user.tier === 'trial' && user.trial_ends_at && (
                          <p className="text-[10px] text-slate-500 font-mono">
                            Ends: {new Date(user.trial_ends_at).toLocaleDateString('en-GB')}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 space-y-1">
                        <p className="text-slate-400">
                          Sessions Linked: <strong className="text-white font-mono">{user.sessions_count || 0}</strong>
                        </p>
                        <p className="text-slate-400">
                          Announcements: <strong className="text-white font-mono">{user.announcements_count || 0}</strong>
                        </p>
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {new Date(user.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-4 text-right space-y-2">
                        <button
                          onClick={() => handleToggleSubscription(user.id)}
                          disabled={actionId === user.id}
                          className={`block w-full px-3 py-1.5 rounded text-[10px] font-bold transition-all disabled:opacity-50 cursor-pointer ${isActive ? 'bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white' : 'bg-emerald-500/10 hover:bg-emerald-600 text-emerald-400 hover:text-white'}`}
                        >
                          {actionId === user.id ? (
                            <RefreshCw size={12} className="animate-spin inline" />
                          ) : isActive ? (
                            'Revoke Access'
                          ) : (
                            'Grant Access'
                          )}
                        </button>
                        <button
                          onClick={() => handleToggleTier(user.id, user.tier === 'plus' ? 'trial' : 'plus')}
                          disabled={actionId === user.id}
                          className={`block w-full px-3 py-1.5 rounded text-[10px] font-bold transition-all disabled:opacity-50 cursor-pointer ${user.tier === 'plus' ? 'bg-yellow-500/10 hover:bg-yellow-600 text-yellow-400 hover:text-white' : 'bg-indigo-500/10 hover:bg-indigo-600 text-indigo-400 hover:text-white'}`}
                        >
                          {user.tier === 'plus' ? 'Downgrade to Trial' : 'Upgrade to Plus'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
