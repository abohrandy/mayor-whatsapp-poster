import { useState, useEffect } from 'react';
import { Users, CheckCircle, MessageSquare, Megaphone, Clock, ShieldAlert, RefreshCw, ExternalLink } from 'lucide-react';
import axios from 'axios';
import { io } from 'socket.io-client';

const socket = io({
  auth: {
    token: localStorage.getItem('token')
  }
});

interface StatCardProps {
  title: string;
  value: string | number;
  icon: any;
  color: string;
  subtext?: string;
}

const StatCard = ({ title, value, icon: Icon, color, subtext }: StatCardProps) => (
  <div className="glass-card p-6 flex items-start justify-between">
    <div>
      <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-3xl font-extrabold text-white">{value}</h3>
      {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
    </div>
    <div className={`p-3 rounded-xl ${color} bg-opacity-20`}>
      <Icon size={24} className={color.replace('bg-', 'text-')} />
    </div>
  </div>
);

const AdminDashboard = ({ setActiveTab }: any) => {
  const [data, setData] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionUserId, setActionUserId] = useState<number | null>(null);

  const fetchAdminStats = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [statsRes, logsRes] = await Promise.all([
        axios.get('/api/admin/stats'),
        axios.get('/api/logs') // Admin fetches top 200 platform-wide logs from this route
      ]);
      setData(statsRes.data);
      setLogs(logsRes.data || []);
    } catch (err) {
      console.error('Error fetching admin dashboard stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleToggleSubscription = async (userId: number) => {
    setActionUserId(userId);
    try {
      await axios.post(`/api/admin/users/${userId}/subscription`);
      await fetchAdminStats();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update subscription.');
    } finally {
      setActionUserId(null);
    }
  };

  const handleToggleTier = async (userId: number, currentTier: 'trial' | 'plus') => {
    const newTier = currentTier === 'plus' ? 'trial' : 'plus';
    setActionUserId(userId);
    try {
      await axios.post(`/api/admin/users/${userId}/tier`, { tier: newTier });
      await fetchAdminStats();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update user tier.');
    } finally {
      setActionUserId(null);
    }
  };

  useEffect(() => {
    fetchAdminStats();

    // Listen to real-time events that might change stats
    socket.on('stats_update', () => fetchAdminStats());
    socket.on('whatsapp_status', () => fetchAdminStats());

    return () => {
      socket.off('stats_update');
      socket.off('whatsapp_status');
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <RefreshCw className="animate-spin text-primary" size={32} />
        <p className="text-slate-400 text-sm">Loading super admin telemetry...</p>
      </div>
    );
  }

  const { overview = {}, recentUsers = [], recentAnnouncements = [], sessions = [] } = data || {};

  return (
    <div className="space-y-8">
      {/* Admin Title Panel */}
      <div className="glass-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <ShieldAlert className="text-primary" /> Super Admin Control Center
          </h2>
          <p className="text-sm text-slate-400">Real-time system health, subscription analytics, and session monitoring.</p>
        </div>
        <button
          onClick={() => fetchAdminStats(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Syncing...' : 'Sync System'}
        </button>
      </div>

      {/* Grid Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Platform Users"
          value={overview.totalUsers || 0}
          icon={Users}
          color="bg-primary"
          subtext={`${overview.plusUsers || 0} Plus • ${overview.trialUsers || 0} Trial`}
        />
        <StatCard
          title="Active Subscriptions"
          value={overview.activeSubscriptions || 0}
          icon={CheckCircle}
          color="bg-emerald-500"
          subtext="Paying accounts"
        />
        <StatCard
          title="Linked WhatsApp JIDs"
          value={overview.totalSessions || 0}
          icon={MessageSquare}
          color="bg-indigo-500"
          subtext={`${sessions.filter((s: any) => s.status === 'CONNECTED').length} Online`}
        />
        <StatCard
          title="Total Announcements"
          value={overview.totalAnnouncements || 0}
          icon={Megaphone}
          color="bg-amber-500"
          subtext={`across ${overview.totalAudienceLists || overview.totalProfiles || 0} audience lists`}
        />
      </div>

      {/* Main Administrative Control Blocks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* WhatsApp Session Monitor */}
        <div className="glass-card flex flex-col">
          <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
            <h3 className="font-bold text-white flex items-center gap-2">
              <MessageSquare size={18} className="text-indigo-400" /> System WhatsApp Sessions
            </h3>
            <span className="text-[11px] bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              {sessions.length} Total
            </span>
          </div>
          <div className="divide-y divide-slate-700/30 overflow-y-auto max-h-[350px] flex-1">
            {sessions.map((sess: any) => (
              <div key={sess.sessionId} className="p-4 flex items-center justify-between hover:bg-slate-800/10 transition-colors">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-semibold text-white truncate max-w-[220px]">
                    {sess.userEmail}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                    ID: {sess.sessionId.substring(0, 12)}...
                    {sess.phoneNumber && ` (+${sess.phoneNumber})`}
                  </span>
                </div>
                <div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                    sess.status === 'CONNECTED' 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : sess.status === 'AUTH_REQUIRED'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {sess.status}
                  </span>
                </div>
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="p-12 text-center text-slate-500 text-sm">No WhatsApp numbers connected by users.</div>
            )}
          </div>
        </div>

        {/* User Direct Actions Dashboard */}
        <div className="glass-card flex flex-col">
          <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Users size={18} className="text-primary" /> Recent User Registrations
            </h3>
            <button onClick={() => setActiveTab('users')} className="text-primary text-xs font-bold flex items-center gap-1 hover:underline">
              Manage Users <ExternalLink size={12} />
            </button>
          </div>
          <div className="divide-y divide-slate-700/30 overflow-y-auto max-h-[350px] flex-1">
            {recentUsers.map((u: any) => (
              <div key={u.id} className="p-4 flex items-center justify-between hover:bg-slate-800/10 transition-colors">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate max-w-[200px]">
                      {u.email}
                    </span>
                    <button
                      onClick={() => handleToggleTier(u.id, u.tier)}
                      disabled={actionUserId === u.id}
                      className={`text-[9px] font-bold px-2 py-0.5 rounded cursor-pointer transition-all uppercase ${
                        u.tier === 'plus' ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {u.tier}
                    </button>
                    {u.tier === 'plus' && !u.paystack_subscription_code && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-wider">
                        Manual
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">
                    Joined {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleSubscription(u.id)}
                    disabled={actionUserId === u.id}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                      u.subscription_status === 'active'
                        ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                        : 'border-red-500/30 text-red-400 bg-red-500/10 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                    }`}
                  >
                    {actionUserId === u.id ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : u.subscription_status === 'active' ? (
                      'Active'
                    ) : (
                      'Inactive'
                    )}
                  </button>
                </div>
              </div>
            ))}
            {recentUsers.length === 0 && (
              <div className="p-12 text-center text-slate-500 text-sm">No registered users found.</div>
            )}
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Recent Announcements */}
        <div className="glass-card flex flex-col">
          <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Megaphone size={18} className="text-amber-400" /> Recent Campaign Submissions
            </h3>
            <span className="text-[11px] bg-amber-500/10 text-amber-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              {recentAnnouncements.length} Recent
            </span>
          </div>
          <div className="divide-y divide-slate-700/30 overflow-y-auto max-h-[350px] flex-1">
            {recentAnnouncements.map((ann: any) => (
              <div key={ann.id} className="p-4 flex items-center justify-between hover:bg-slate-800/10 transition-colors">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-semibold text-white truncate max-w-[220px]">
                    {ann.title}
                  </span>
                  <span className="text-xs text-slate-500">
                    By {ann.userEmail} • {new Date(ann.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    ann.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {ann.status}
                  </span>
                </div>
              </div>
            ))}
            {recentAnnouncements.length === 0 && (
              <div className="p-12 text-center text-slate-500 text-sm">No campaigns registered in database.</div>
            )}
          </div>
        </div>

        {/* Platform Live Logs Feed */}
        <div className="glass-card flex flex-col">
          <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Clock size={18} className="text-slate-400" /> Live Platform Activity
            </h3>
            <button onClick={() => setActiveTab('activity')} className="text-primary text-xs font-bold flex items-center gap-1 hover:underline">
              Full Logs <ExternalLink size={12} />
            </button>
          </div>
          <div className="divide-y divide-slate-700/30 overflow-y-auto max-h-[350px] flex-1">
            {logs.slice(0, 10).map((log: any) => (
              <div key={log.id} className="p-4 flex flex-col gap-1 hover:bg-slate-800/10 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                    {log.action_type.replace('_', ' ')}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-slate-300 line-clamp-2">{log.description}</p>
                {log.user_email && (
                  <span className="text-[9px] text-slate-500 font-semibold">User: {log.user_email}</span>
                )}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="p-12 text-center text-slate-500 text-sm">No activity recorded.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminDashboard;
