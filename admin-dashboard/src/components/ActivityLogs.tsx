import { useState, useEffect } from 'react';
import { History, Activity, Settings, UserPlus, UserMinus, UserCheck, CheckCircle2, XCircle } from 'lucide-react';
import axios from 'axios';

const ActivityLogs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchLogs(true);
    }, []);

    const fetchLogs = async (showMainLoader = false) => {
        if (showMainLoader) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        try {
            const res = await axios.get('/api/logs');
            setLogs(res.data);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const getIconInfo = (actionType: string) => {
        switch (actionType) {
            case 'announcement_added': return { icon: <UserPlus size={18} />, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' };
            case 'announcement_updated': return { icon: <UserCheck size={18} />, color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' };
            case 'announcement_deleted': return { icon: <UserMinus size={18} />, color: 'text-red-400 bg-red-400/10 border-red-400/20' };
            case 'settings_updated': return { icon: <Settings size={18} />, color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' };
            case 'announcement_posted': return { icon: <CheckCircle2 size={18} />, color: 'text-green-400 bg-green-400/10 border-green-400/20' };
            case 'whatsapp_post_failed': return { icon: <XCircle size={18} />, color: 'text-red-500 bg-red-500/10 border-red-500/20' };
            default: return { icon: <Activity size={18} />, color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' };
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                        <History className="text-indigo-400" size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Activity Logs</h2>
                        <p className="text-slate-400">System operations and action history</p>
                    </div>
                </div>
                <button 
                    onClick={() => fetchLogs(false)} 
                    disabled={refreshing}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700/50 flex items-center gap-2 text-sm font-medium disabled:opacity-50 cursor-pointer"
                >
                    <History size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <div className="glass-card">
                {loading ? (
                    <div className="p-12 text-center text-slate-500">Loading logs...</div>
                ) : logs.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                        <Activity size={40} className="mb-4 opacity-50" />
                        <p>No system activity recorded yet.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-700/50">
                        {logs.map((log: any) => {
                            const { icon, color } = getIconInfo(log.action_type);
                            return (
                                <div key={log.id} className="p-4 flex gap-4 hover:bg-slate-800/30 transition-colors items-start">
                                    <div className={`p-2 rounded-lg border ${color} mt-1 flex-shrink-0`}>
                                        {icon}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className="font-medium text-white">{log.description}</p>
                                            <span className="text-xs font-medium text-slate-500 shrink-0">
                                                {new Date(log.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{log.action_type.replace(/_/g, ' ')}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityLogs;
