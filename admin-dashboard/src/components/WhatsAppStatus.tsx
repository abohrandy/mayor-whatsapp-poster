import { useState, useEffect } from 'react';
import { QrCode, RefreshCcw, CheckCircle2, AlertCircle, History, Send } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';
import { io } from 'socket.io-client';

const socket = io();

const WhatsAppStatus = () => {
    const [status, setStatus] = useState<any>({
        status: 'DISCONNECTED',
        qrText: '',
        lastError: null
    });
    const [logs, setLogs] = useState<any[]>([
        { time: new Date().toLocaleTimeString(), msg: 'Dashboard connected to live stream', type: 'info' }
    ]);

    useEffect(() => {
        // Initial fetch
        fetchStatus();

        // Socket listeners
        socket.on('whatsapp_status', (data) => {
            console.log('Live status update:', data);
            setStatus(data);
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

    const fetchStatus = async () => {
        try {
            const res = await axios.get('/api/whatsapp/status');
            setStatus(res.data);
        } catch (error) {
            console.error('Failed to fetch status');
        }
    };

    const [sending, setSending] = useState(false);
    const handleSendTest = async () => {
        if (!isConnected) return;
        setSending(true);
        try {
            await axios.post('/api/whatsapp/send-test');
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: 'Test message sent successfully!',
                type: 'info'
            }, ...prev]);
        } catch (error: any) {
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: 'Failed to send test: ' + (error.response?.data?.error || error.message),
                type: 'error'
            }, ...prev]);
        } finally {
            setSending(false);
        }
    };

    const [reconnecting, setReconnecting] = useState(false);
    const handleReconnect = async () => {
        setReconnecting(true);
        try {
            await axios.post('/api/whatsapp/reconnect');
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: 'Reconnection initiated...',
                type: 'info'
            }, ...prev]);
        } catch (error: any) {
            setLogs(prev => [{
                time: new Date().toLocaleTimeString(),
                msg: 'Failed to reconnect: ' + (error.response?.data?.error || error.message),
                type: 'error'
            }, ...prev]);
        } finally {
            setReconnecting(false);
        }
    };

    const isConnected = status.status === 'CONNECTED';
    const needsAuth = status.status === 'AUTH_REQUIRED';

    return (
        <div className="space-y-8">
            {/* Status Header */}
            <div className={`glass-card p-6 flex flex-col md:flex-row items-center justify-between gap-6 border-l-4 ${isConnected ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isConnected ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                        {isConnected ? <CheckCircle2 size={32} /> : <AlertCircle size={32} />}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white uppercase tracking-wider">{status.status}</h3>
                        <p className="text-sm text-slate-500">System is {isConnected ? 'ready to send posts' : 'awaiting connection'}</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleReconnect}
                        disabled={reconnecting}
                        className={`px-4 py-2 glass-card hover:bg-slate-800 text-sm font-bold flex items-center gap-2 ${reconnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <RefreshCcw size={16} className={reconnecting ? 'animate-spin' : ''} /> {reconnecting ? 'Reconnecting...' : 'Reconnect'}
                    </button>
                    <button
                        onClick={handleSendTest}
                        disabled={!isConnected || sending}
                        className={`px-4 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-bold rounded-lg flex items-center gap-2 ${(!isConnected || sending) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {sending ? <RefreshCcw size={16} className="animate-spin" /> : <Send size={16} />}
                        {sending ? 'Sending...' : 'Send Test'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* QR Section */}
                <div className="glass-card flex flex-col items-center p-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4">
                        <QrCode size={120} className="text-primary/5 -mr-8 -mt-8" />
                    </div>

                    <h4 className="text-lg font-bold text-white mb-6">Device Linker</h4>

                    {needsAuth && status.qrText ? (
                        <div className="bg-white p-4 rounded-xl shadow-2xl mb-8">
                            <QRCodeSVG
                                value={status.qrText}
                                size={256}
                                level="M"
                                includeMargin={true}
                                className="rounded-lg"
                            />
                        </div>
                    ) : isConnected ? (
                        <div className="flex flex-col items-center py-12 text-center">
                            <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-6">
                                <CheckCircle2 size={64} />
                            </div>
                            <h5 className="text-xl font-bold text-white mb-2">Authenticated Successfully</h5>
                            <p className="text-slate-400 max-w-xs">Your WhatsApp account is linked. Automated posts will trigger according to schedule.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center py-12 text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-6"></div>
                            <p className="text-slate-500">Generating login session...</p>
                        </div>
                    )}

                    <div className="text-xs text-slate-500 space-y-2 max-w-sm">
                        <p className="font-bold text-slate-300">Instructions:</p>
                        <ol className="list-decimal pl-4 space-y-1">
                            <li>Open WhatsApp on your phone</li>
                            <li>Tap Menu (⋮) or Settings (⚙️)</li>
                            <li>Select Linked Devices {'>'} Link a Device</li>
                            <li>Point your camera at this screen to scan</li>
                        </ol>
                    </div>
                </div>

                {/* Log Section */}
                <div className="glass-card flex flex-col">
                    <div className="p-6 border-b border-slate-700/50 flex items-center gap-2">
                        <History size={20} className="text-slate-400" />
                        <h4 className="font-bold text-white">Connection Logs</h4>
                    </div>
                    <div className="flex-1 p-6 space-y-4 font-mono text-xs overflow-y-auto max-h-[400px]">
                        {logs.map((log, i) => (
                            <div key={i} className="flex gap-4">
                                <span className="text-slate-600">[{log.time}]</span>
                                <span className={log.type === 'success' ? 'text-emerald-500' : log.type === 'error' ? 'text-red-400' : 'text-slate-400'}>
                                    {log.msg}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WhatsAppStatus;
