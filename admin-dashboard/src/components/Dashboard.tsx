import { useState, useEffect } from 'react';
import { Calendar, Wifi, ArrowUpRight, FileText, Send, RefreshCw } from 'lucide-react';
import { io } from 'socket.io-client';
import axios from 'axios';

const socket = io({
    auth: {
        token: localStorage.getItem('token')
    }
});

const StatCard = ({ title, value, icon: Icon, color, secondary }: any) => (
    <div className="glass-card p-6 flex items-start justify-between">
        <div>
            <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-white">{value}</h3>
            {secondary && <p className="text-xs text-slate-500 mt-1">{secondary}</p>}
        </div>
        <div className={`p-3 rounded-xl ${color} bg-opacity-20`}>
            <Icon size={24} className={color.replace('bg-', 'text-')} />
        </div>
    </div>
);

const Dashboard = ({ setActiveTab, triggerNewAnnouncement }: any) => {
    const [stats, setStats] = useState({
        total: 0,
        activeRecurring: 0,
        status: 'DISCONNECTED'
    });
    const [upcoming, setUpcoming] = useState([]);
    const [logs, setLogs] = useState([]);
    const [postingId, setPostingId] = useState<number | null>(null);

    const fetchData = async () => {
        try {
            const [announcementsRes, statusRes, logsRes] = await Promise.all([
                axios.get('/api/announcements'),
                axios.get('/api/whatsapp/status'),
                axios.get('/api/logs')
            ]);

            const announcements = announcementsRes.data;
            const activeRecurringCount = announcements.filter((a: any) => a.is_recurring && a.status === 'active').length;
            
            // Sort announcements with next_post_at for upcoming
            const upcomingAnnouncements = announcements
                .filter((a: any) => a.status === 'active' && a.next_post_at)
                .sort((a: any, b: any) => new Date(a.next_post_at).getTime() - new Date(b.next_post_at).getTime());

            setStats({
                total: announcements.length,
                activeRecurring: activeRecurringCount,
                status: statusRes.data.status
            });
            setUpcoming(upcomingAnnouncements.slice(0, 5));
            setLogs(logsRes.data.slice(0, 5));
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        }
    };

    const handlePostNow = async (id: number) => {
        if (!window.confirm('Post this announcement to all target groups right now?')) return;
        setPostingId(id);
        try {
            await axios.post(`/api/announcements/${id}/post-now`);
            alert('Post initiated! Check Activity Logs for status.');
            fetchData();
        } catch {
            alert('Failed to initiate post.');
        } finally {
            setPostingId(null);
        }
    };

    useEffect(() => {
        fetchData();

        socket.on('stats_update', () => fetchData());
        socket.on('whatsapp_status', (data) => {
            setStats(prev => ({ ...prev, status: data.status }));
        });

        return () => {
            socket.off('stats_update');
            socket.off('whatsapp_status');
        };
    }, []);

    return (
        <div className="space-y-8">
            {/* Quick Actions Panel */}
            <div className="glass-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-lg font-bold text-white">Quick Actions</h3>
                    <p className="text-sm text-slate-400">Launch a new message campaign or manage current configurations</p>
                </div>
                <button
                    onClick={triggerNewAnnouncement}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all text-sm cursor-pointer"
                >
                    + New Announcement
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Total Announcements"
                    value={stats.total.toString()}
                    icon={FileText}
                    color="bg-primary"
                    secondary="Total created"
                />
                <StatCard
                    title="Active Recurring"
                    value={stats.activeRecurring.toString()}
                    icon={Calendar}
                    color="bg-emerald-500"
                    secondary="Active playlists"
                />
                <StatCard
                    title="WhatsApp Status"
                    value={stats.status}
                    icon={Wifi}
                    color={stats.status === 'CONNECTED' ? 'bg-emerald-500' : 'bg-red-500'}
                    secondary={stats.status === 'CONNECTED' ? 'System Ready' : 'Connection Required'}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Upcoming Posts */}
                <div className="glass-card">
                    <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
                        <h3 className="font-bold text-white">Upcoming Announcements</h3>
                        <button onClick={() => setActiveTab('announcements')} className="text-primary text-sm font-medium flex items-center gap-1 hover:underline">
                            View All <ArrowUpRight size={16} />
                        </button>
                    </div>
                    <div className="p-0">
                        {upcoming.map((ann: any, i) => (
                            <div key={ann.id} className={`p-4 flex items-center justify-between ${i !== upcoming.length - 1 ? 'border-b border-slate-700/30' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-primary">
                                        AN
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">{ann.title}</p>
                                        <p className="text-xs text-slate-500">
                                            {ann.is_recurring ? `Every ${ann.recurrence_days} days` : 'One-time'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
                                        {new Date(ann.next_post_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <button
                                        onClick={() => handlePostNow(ann.id)}
                                        disabled={postingId === ann.id}
                                        title="Post Now"
                                        className="p-2 text-green-400 hover:text-white hover:bg-green-500/20 rounded-lg transition-colors cursor-pointer"
                                    >
                                        {postingId === ann.id ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {upcoming.length === 0 && (
                            <div className="p-12 text-center text-slate-500">No upcoming announcements scheduled</div>
                        )}
                    </div>
                </div>

                {/* Recent Activity Logs */}
                <div className="glass-card">
                    <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
                        <h3 className="font-bold text-white">Recent Activity</h3>
                        <button onClick={() => setActiveTab('activity')} className="text-primary text-sm font-medium flex items-center gap-1 hover:underline">
                            View Logs <ArrowUpRight size={16} />
                        </button>
                    </div>
                    <div className="p-0">
                        {logs.map((log: any, i) => (
                            <div key={log.id} className={`p-4 flex flex-col gap-1 ${i !== logs.length - 1 ? 'border-b border-slate-700/30' : ''}`}>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                        {log.action_type.replace('_', ' ')}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                        {new Date(log.created_at).toLocaleString()}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-300">{log.description}</p>
                            </div>
                        ))}
                        {logs.length === 0 && (
                            <div className="p-12 text-center text-slate-500">No recent activity logged</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
