import { useState, useEffect } from 'react';
import { QrCode, RefreshCw, AlertCircle, History, Send, Plus, Trash2, Link2, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';
import { io } from 'socket.io-client';

const socket = io({
    auth: {
        token: localStorage.getItem('token')
    }
});

interface WhatsAppSession {
    id: string;
    jid: string | null;
    status: string;
    qrText: string;
    lastError: string;
}

const WhatsAppStatus = () => {
    const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [logs, setLogs] = useState<any[]>([
        { time: new Date().toLocaleTimeString(), msg: 'Dashboard connected to live stream', type: 'info' }
    ]);

    // Track input links and loading status per session JID/ID
    const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
    const [joiningStates, setJoiningStates] = useState<Record<string, boolean>>({});
    const [sendingStates, setSendingStates] = useState<Record<string, boolean>>({});

    useEffect(() => {
        // Initial fetch
        fetchSessions();

        // Socket listeners
        socket.on('whatsapp_status', (data) => {
            console.log('Live status update:', data);
            setSessions(data.sessions || []);
        });

        socket.on('post_log', (log) => {
            setLogs(prev => [{
                time: new Date(log.timestamp).toLocaleTimeString(),
                msg: log.message,
                type: log.type
            }, ...prev].slice(0, 50));
        });

        return () => {
            socket.off('whatsapp_status');
            socket.off('post_log');
        };
    }, []);

    const fetchSessions = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/whatsapp/status');
            setSessions(res.data.sessions || []);
        } catch (error) {
            console.error('Failed to fetch status', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSession = async () => {
        setCreating(true);
        try {
            await axios.post('/api/whatsapp/session/new');
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: 'Requested a new WhatsApp QR code session...',
                type: 'info'
            }, ...prev]);
            await fetchSessions();
        } catch (error: any) {
            alert('Failed to add account: ' + (error.response?.data?.error || error.message));
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteSession = async (id: string) => {
        if (!window.confirm('Are you sure you want to disconnect and delete this session?')) return;
        try {
            await axios.post('/api/whatsapp/session/delete', { id });
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `Disconnected session ${id}`,
                type: 'info'
            }, ...prev]);
            await fetchSessions();
        } catch (error: any) {
            alert('Failed to delete session: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleSendTest = async (sessionId: string) => {
        const targetGroup = window.prompt("Enter target WhatsApp Group JID (e.g. 1234567-890123@g.us) to send a test message:");
        if (!targetGroup) return;

        setSendingStates(prev => ({ ...prev, [sessionId]: true }));
        try {
            await axios.post('/api/whatsapp/send-test', {
                from: sessionId,
                groupId: targetGroup
            });
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `Test message sent successfully from ${sessionId}!`,
                type: 'success'
            }, ...prev]);
            alert('Test message sent successfully!');
        } catch (error: any) {
            const errText = error.response?.data?.error || error.message;
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `Failed to send test from ${sessionId}: ` + errText,
                type: 'error'
            }, ...prev]);
            alert('Failed to send test: ' + errText);
        } finally {
            setSendingStates(prev => ({ ...prev, [sessionId]: false }));
        }
    };

    const handleJoinGroup = async (sessionId: string) => {
        const link = inviteLinks[sessionId];
        if (!link || !link.trim()) {
            alert('Please paste a valid WhatsApp Group invite link.');
            return;
        }

        setJoiningStates(prev => ({ ...prev, [sessionId]: true }));
        try {
            const res = await axios.post('/api/whatsapp/join', {
                from: sessionId,
                inviteLink: link.trim()
            });
            
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `Session ${sessionId} successfully joined group: "${res.data.name}"`,
                type: 'success'
            }, ...prev]);
            
            alert(`Successfully joined group: "${res.data.name}"!`);
            setInviteLinks(prev => ({ ...prev, [sessionId]: '' }));
        } catch (error: any) {
            const errText = error.response?.data?.error || error.message;
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: `Session ${sessionId} failed to join group: ${errText}`,
                type: 'error'
            }, ...prev]);
            alert('Failed to join group: ' + errText);
        } finally {
            setJoiningStates(prev => ({ ...prev, [sessionId]: false }));
        }
    };

    return (
        <div className="space-y-8">
            {/* Header section with add button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-xl font-bold text-white">Linked WhatsApp Accounts</h3>
                    <p className="text-sm text-slate-500">Connect, scan, and manage multiple WhatsApp numbers concurrently.</p>
                </div>
                <button
                    onClick={handleCreateSession}
                    disabled={creating}
                    className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                    {creating ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={18} />}
                    {creating ? 'Initializing...' : 'Add WhatsApp Account'}
                </button>
            </div>

            {loading && sessions.length === 0 ? (
                <div className="flex flex-col items-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                    <p className="text-slate-400">Loading WhatsApp accounts...</p>
                </div>
            ) : sessions.length === 0 ? (
                <div className="glass-card p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
                        <QrCode size={32} />
                    </div>
                    <h4 className="text-lg font-bold text-white mb-2">No WhatsApp Accounts Linked</h4>
                    <p className="text-slate-500 max-w-sm mb-6">Link your first account to begin automated posting. Tap the button above to generate a connection QR code.</p>
                    <button
                        onClick={handleCreateSession}
                        disabled={creating}
                        className="px-5 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-bold rounded-lg flex items-center gap-2 cursor-pointer"
                    >
                        {creating ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={18} />}
                        Add WhatsApp Account
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {/* Sessions Grid */}
                    <div className="space-y-6">
                        {sessions.map((sess) => {
                            const isConnected = sess.status === 'CONNECTED';
                            const needsAuth = sess.status === 'AUTH_REQUIRED';
                            const phone = sess.jid ? sess.jid.split('@')[0] : null;

                            return (
                                <div key={sess.id} className={`glass-card overflow-hidden border-l-4 ${isConnected ? 'border-l-emerald-500' : needsAuth ? 'border-l-amber-500' : 'border-l-red-500'}`}>
                                    <div className="p-6 border-b border-slate-700/50 flex items-center justify-between gap-4 bg-slate-900/40">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : needsAuth ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {isConnected ? '✓' : '!'}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white truncate max-w-[180px] sm:max-w-none">
                                                    {phone ? `+${phone}` : sess.id.startsWith('temp_') ? 'Setup Connection' : sess.id}
                                                </h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${isConnected ? 'bg-emerald-600/30 text-emerald-400' : needsAuth ? 'bg-amber-600/30 text-amber-400' : 'bg-red-600/30 text-red-400'}`}>
                                                        {sess.status}
                                                    </span>
                                                    {sess.lastError && (
                                                        <span className="text-[10px] text-red-400 truncate max-w-xs" title={sess.lastError}>
                                                            ({sess.lastError})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {isConnected && (
                                                <button
                                                    onClick={() => handleSendTest(sess.id)}
                                                    disabled={sendingStates[sess.id]}
                                                    className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                                                    title="Send test message"
                                                >
                                                    {sendingStates[sess.id] ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteSession(sess.id)}
                                                className="p-2 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition-colors"
                                                title="Remove Account"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Action Content inside card */}
                                    <div className="p-6 space-y-4">
                                        {needsAuth && sess.qrText ? (
                                            <div className="flex flex-col md:flex-row items-center gap-6">
                                                <div className="bg-white p-3 rounded-lg flex-shrink-0">
                                                    <QRCodeSVG
                                                        value={sess.qrText}
                                                        size={160}
                                                        level="M"
                                                        includeMargin={false}
                                                    />
                                                </div>
                                                <div className="text-xs text-slate-400 space-y-2">
                                                    <p className="font-bold text-slate-300 flex items-center gap-1">
                                                        <QrCode size={14} className="text-amber-500" /> Link WhatsApp Account:
                                                    </p>
                                                    <ol className="list-decimal pl-4 space-y-1">
                                                        <li>Open WhatsApp on your mobile phone.</li>
                                                        <li>Tap Menu (⋮) or Settings (⚙️) and select Linked Devices.</li>
                                                        <li>Tap Link a Device.</li>
                                                        <li>Scan this QR code with your phone camera.</li>
                                                    </ol>
                                                </div>
                                            </div>
                                        ) : isConnected ? (
                                            <div className="space-y-4">
                                                {/* Join Group Input */}
                                                <div className="bg-slate-950/40 border border-slate-800 rounded-lg p-3 space-y-2">
                                                    <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                                                        <Link2 size={14} className="text-indigo-400" /> Join Group by Invite Link
                                                    </label>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="https://chat.whatsapp.com/..."
                                                            value={inviteLinks[sess.id] || ''}
                                                            onChange={(e) => setInviteLinks(prev => ({ ...prev, [sess.id]: e.target.value }))}
                                                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-primary"
                                                        />
                                                        <button
                                                            onClick={() => handleJoinGroup(sess.id)}
                                                            disabled={joiningStates[sess.id]}
                                                            className="px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                                                        >
                                                            {joiningStates[sess.id] ? <RefreshCw size={12} className="animate-spin" /> : <Users size={12} />}
                                                            Join
                                                        </button>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500">Paste any invite link or invite code to let this account join the group programmatically.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-500 flex items-center gap-2 py-4">
                                                <AlertCircle size={16} className="text-red-400" />
                                                <span>Awaiting device configuration. Use the 'Add WhatsApp Account' command to sync.</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Connection Logs Panel */}
                    <div className="glass-card flex flex-col h-[500px]">
                        <div className="p-6 border-b border-slate-700/50 flex items-center gap-2">
                            <History size={20} className="text-slate-400" />
                            <h4 className="font-bold text-white">Multi-Session Live Logs</h4>
                        </div>
                        <div className="flex-1 p-6 space-y-4 font-mono text-xs overflow-y-auto">
                            {logs.map((log, i) => (
                                <div key={i} className="flex gap-4">
                                    <span className="text-slate-600 flex-shrink-0">[{log.time}]</span>
                                    <span className={log.type === 'success' ? 'text-emerald-500' : log.type === 'error' ? 'text-red-400' : 'text-slate-400'}>
                                        {log.msg}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppStatus;
