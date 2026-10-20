import { useState, useEffect, useMemo } from 'react';
import {
    QrCode, RefreshCw, History, Send, Plus, Trash2, Link2, Users, Smartphone, Download, Share2,
    CheckCircle2, AlertTriangle, WifiOff, X, ChevronDown
} from 'lucide-react';
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
    pairCode: string;
    lastError: string;
}

interface LogEntry {
    time: string;
    msg: string;
    type: 'info' | 'success' | 'error' | string;
}

type Notice = { type: 'success' | 'error'; text: string } | null;

const MAX_LOGS = 100;

// Helper to detect mobile device user agent or small screen viewport
const isMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    return mobileRegex.test(userAgent) || window.innerWidth < 768;
};

// The bridge reports raw library errors. Turn the ones we know about into something a
// person can act on; fall through to the original text for anything unrecognised.
const explainError = (raw: string): string => {
    if (!raw) return '';
    if (/websocket disconnected before|failed to generate pairing code/i.test(raw)) {
        return 'WhatsApp closed the connection before the code could be created. Check the number includes its country code, then try again.';
    }
    if (/logged out/i.test(raw)) {
        return 'This device was unlinked from the phone. Remove it and link the account again.';
    }
    if (/disconnected from whatsapp server/i.test(raw)) {
        return 'The connection dropped. It reconnects on its own; if it stays offline, remove the account and link it again.';
    }
    return raw;
};

const statusMeta = (status: string) => {
    if (status === 'CONNECTED') {
        return { label: 'Connected', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' };
    }
    if (status === 'AUTH_REQUIRED') {
        return { label: 'Waiting for scan', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' };
    }
    return { label: 'Offline', chip: 'bg-red-500/15 text-red-300 border-red-500/30', dot: 'bg-red-400' };
};

// Render the on-screen QR <svg> to a white-backed PNG so it can be saved or shared.
const qrToPngBlob = (qrSvgId: string): Promise<Blob | null> =>
    new Promise((resolve) => {
        const svgElement = document.getElementById(qrSvgId);
        if (!svgElement) return resolve(null);

        const svgData = new XMLSerializer().serializeToString(svgElement);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const blobURL = URL.createObjectURL(svgBlob);

        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 400;
            const context = canvas.getContext('2d');
            if (!context) {
                URL.revokeObjectURL(blobURL);
                return resolve(null);
            }
            context.fillStyle = '#FFFFFF';
            context.fillRect(0, 0, 400, 400);
            context.drawImage(image, 20, 20, 360, 360);
            URL.revokeObjectURL(blobURL);
            canvas.toBlob((blob) => resolve(blob), 'image/png');
        };
        image.onerror = () => {
            URL.revokeObjectURL(blobURL);
            resolve(null);
        };
        image.src = blobURL;
    });

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70';
const secondaryBtn = `px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${focusRing}`;
const primaryBtn = `px-4 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${focusRing}`;
const iconBtn = `p-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${focusRing}`;

const WhatsAppStatus = () => {
    const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [creating, setCreating] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);
    const [logs, setLogs] = useState<LogEntry[]>([
        { time: new Date().toLocaleTimeString(), msg: 'Dashboard connected to live stream', type: 'info' }
    ]);
    const [logFilter, setLogFilter] = useState<'all' | 'problems'>('all');
    const [logsOpen, setLogsOpen] = useState(true);
    const [isMobile, setIsMobile] = useState<boolean>(isMobileDevice());

    // Inline phone-link form (replaces window.prompt)
    const [phoneFormOpen, setPhoneFormOpen] = useState(false);
    const [phoneInput, setPhoneInput] = useState('');

    // Per-session UI state, keyed by session id
    const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
    const [joiningStates, setJoiningStates] = useState<Record<string, boolean>>({});
    const [sendingStates, setSendingStates] = useState<Record<string, boolean>>({});
    const [syncingContacts, setSyncingContacts] = useState<Record<string, boolean>>({});
    const [testOpen, setTestOpen] = useState<Record<string, boolean>>({});
    const [testTargets, setTestTargets] = useState<Record<string, string>>({});
    const [contactSyncInfo, setContactSyncInfo] = useState<{ lastSyncedAt: string | null; syncedCount: number }>({
        lastSyncedAt: null,
        syncedCount: 0
    });

    const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
        setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev].slice(0, MAX_LOGS));
    };

    useEffect(() => {
        const handleResize = () => setIsMobile(isMobileDevice());
        window.addEventListener('resize', handleResize);

        // Initial fetch
        fetchSessions();
        fetchSyncStatus();

        // Socket listeners
        socket.on('whatsapp_status', (data) => {
            setSessions(data.sessions || []);
            setLoadFailed(false);
        });

        socket.on('post_log', (log) => {
            setLogs(prev => [{
                time: new Date(log.timestamp).toLocaleTimeString(),
                msg: log.message,
                type: log.type
            }, ...prev].slice(0, MAX_LOGS));
        });

        return () => {
            window.removeEventListener('resize', handleResize);
            socket.off('whatsapp_status');
            socket.off('post_log');
        };
    }, []);

    const fetchSessions = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/whatsapp/status');
            setSessions(res.data.sessions || []);
            setLoadFailed(false);
        } catch (error) {
            console.error('Failed to fetch status', error);
            setLoadFailed(true);
        } finally {
            setLoading(false);
        }
    };

    const fetchSyncStatus = async () => {
        try {
            const res = await axios.get('/api/whatsapp/contact-sync-status');
            setContactSyncInfo(res.data);
        } catch (e) {}
    };

    const errText = (error: any) => error.response?.data?.error || error.message;

    const handleSyncContacts = async (sessionId: string) => {
        setSyncingContacts(prev => ({ ...prev, [sessionId]: true }));
        try {
            const res = await axios.post('/api/whatsapp/sync-contacts', { session_id: sessionId });
            addLog(`Harvested ${res.data.count} contacts from WhatsApp session ${sessionId}`, 'success');
            setNotice({ type: 'success', text: `Synced ${res.data.count} contacts.` });
            fetchSyncStatus();
        } catch (error: any) {
            addLog(`Failed to harvest contacts for ${sessionId}: ${errText(error)}`, 'error');
            setNotice({ type: 'error', text: `Contact sync failed: ${errText(error)}` });
        } finally {
            setSyncingContacts(prev => ({ ...prev, [sessionId]: false }));
        }
    };

    const handleCreateSession = async () => {
        setCreating(true);
        setNotice(null);
        try {
            await axios.post('/api/whatsapp/session/new');
            addLog('Requested a new WhatsApp QR code session...');
            await fetchSessions();
        } catch (error: any) {
            setNotice({ type: 'error', text: `Couldn't start linking: ${errText(error)}` });
        } finally {
            setCreating(false);
        }
    };

    const handleCreateSessionViaPhone = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const phone = phoneInput.replace(/\D/g, '');
        if (phone.length < 8) {
            setNotice({ type: 'error', text: 'Enter the full number with its country code, digits only (e.g. 2348012345678).' });
            return;
        }

        setCreating(true);
        setNotice(null);
        try {
            await axios.post('/api/whatsapp/session/pair-phone', { phone });
            addLog(`Requested a phone-pairing code for ${phone}...`);
            setPhoneFormOpen(false);
            setPhoneInput('');
            await fetchSessions();
        } catch (error: any) {
            setNotice({ type: 'error', text: `Couldn't get a pairing code: ${errText(error)}` });
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteSession = async (id: string) => {
        if (!window.confirm('Disconnect and remove this account? You will need to link it again to use it.')) return;
        try {
            await axios.post('/api/whatsapp/session/delete', { id });
            addLog(`Disconnected session ${id}`);
            await fetchSessions();
        } catch (error: any) {
            setNotice({ type: 'error', text: `Couldn't remove the account: ${errText(error)}` });
        }
    };

    const handleSendTest = async (sessionId: string) => {
        const targetGroup = (testTargets[sessionId] || '').trim();
        if (!targetGroup) {
            setNotice({ type: 'error', text: 'Enter the group ID to send the test message to (e.g. 1234567-890123@g.us).' });
            return;
        }

        setSendingStates(prev => ({ ...prev, [sessionId]: true }));
        try {
            await axios.post('/api/whatsapp/send-test', { from: sessionId, groupId: targetGroup });
            addLog(`Test message sent successfully from ${sessionId}`, 'success');
            setNotice({ type: 'success', text: 'Test message sent.' });
            setTestOpen(prev => ({ ...prev, [sessionId]: false }));
        } catch (error: any) {
            addLog(`Failed to send test from ${sessionId}: ${errText(error)}`, 'error');
            setNotice({ type: 'error', text: `Test message failed: ${errText(error)}` });
        } finally {
            setSendingStates(prev => ({ ...prev, [sessionId]: false }));
        }
    };

    const handleJoinGroup = async (sessionId: string) => {
        const link = inviteLinks[sessionId];
        if (!link || !link.trim()) {
            setNotice({ type: 'error', text: 'Paste a WhatsApp group invite link first.' });
            return;
        }

        setJoiningStates(prev => ({ ...prev, [sessionId]: true }));
        try {
            const res = await axios.post('/api/whatsapp/join', { from: sessionId, inviteLink: link.trim() });
            addLog(`Session ${sessionId} successfully joined group: "${res.data.name}"`, 'success');
            setNotice({ type: 'success', text: `Joined "${res.data.name}".` });
            setInviteLinks(prev => ({ ...prev, [sessionId]: '' }));
        } catch (error: any) {
            addLog(`Session ${sessionId} failed to join group: ${errText(error)}`, 'error');
            setNotice({ type: 'error', text: `Couldn't join the group: ${errText(error)}` });
        } finally {
            setJoiningStates(prev => ({ ...prev, [sessionId]: false }));
        }
    };

    const handleDownloadQR = async (qrSvgId: string, sessionId: string) => {
        const blob = await qrToPngBlob(qrSvgId);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `whatsapp-qr-${sessionId}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
    };

    const handleShareQR = async (qrSvgId: string, sessionId: string) => {
        const blob = await qrToPngBlob(qrSvgId);
        if (!blob) return;
        const file = new File([blob], `whatsapp-qr-${sessionId}.png`, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'WhatsApp Connection QR Code',
                    text: 'Scan this QR code with WhatsApp on your main phone to link your account.',
                    files: [file]
                });
            } catch (err) {
                // User cancelled the share sheet; nothing to do.
            }
        } else {
            handleDownloadQR(qrSvgId, sessionId);
        }
    };

    const connectedCount = sessions.filter(s => s.status === 'CONNECTED').length;
    const visibleLogs = useMemo(
        () => (logFilter === 'problems' ? logs.filter(l => l.type === 'error') : logs),
        [logs, logFilter]
    );

    const summary = loadFailed
        ? 'Status unavailable'
        : sessions.length === 0
            ? 'No accounts linked'
            : connectedCount === sessions.length
                ? `${connectedCount} of ${sessions.length} connected`
                : `${connectedCount} of ${sessions.length} connected, ${sessions.length - connectedCount} need attention`;

    const addActions = (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
                onClick={() => setPhoneFormOpen(open => !open)}
                disabled={creating}
                aria-expanded={phoneFormOpen}
                className={secondaryBtn}
                title="Link using an 8-character pairing code instead of scanning a QR"
            >
                <Smartphone size={16} />
                Link with phone number
            </button>
            <button onClick={handleCreateSession} disabled={creating} className={primaryBtn}>
                {creating ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
                {creating ? 'Starting...' : 'Add account'}
            </button>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div>
                    <h3 className="text-xl font-bold text-white">Linked WhatsApp accounts</h3>
                    <p className="text-sm text-slate-400 mt-1 flex items-center gap-2" aria-live="polite">
                        <span className={`inline-block w-2 h-2 rounded-full ${loadFailed ? 'bg-red-400' : connectedCount > 0 ? 'bg-emerald-400' : 'bg-slate-500'}`} aria-hidden="true" />
                        {summary}
                    </p>
                </div>
                {addActions}
            </div>

            {/* Phone-link form */}
            {phoneFormOpen && (
                <form onSubmit={handleCreateSessionViaPhone} className="glass-card p-4 flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1 space-y-1.5">
                        <label htmlFor="wa-phone" className="text-xs font-semibold text-slate-300">Phone number to link</label>
                        <input
                            id="wa-phone"
                            type="tel"
                            inputMode="numeric"
                            autoFocus
                            placeholder="2348012345678"
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            className={`w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 ${focusRing}`}
                        />
                        <p className="text-xs text-slate-400">Country code first, digits only, no + or spaces. You'll get a code to type into WhatsApp.</p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setPhoneFormOpen(false)} className={secondaryBtn}>Cancel</button>
                        <button type="submit" disabled={creating} className={primaryBtn}>
                            {creating && <RefreshCw size={16} className="animate-spin" />}
                            Get pairing code
                        </button>
                    </div>
                </form>
            )}

            {/* Notice */}
            {notice && (
                <div
                    role={notice.type === 'error' ? 'alert' : 'status'}
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${notice.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}`}
                >
                    {notice.type === 'error' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
                    <span className="flex-1">{notice.text}</span>
                    <button onClick={() => setNotice(null)} aria-label="Dismiss message" className={`${iconBtn} -m-1.5 hover:bg-white/10`}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Service unreachable */}
            {loadFailed && (
                <div role="alert" className="glass-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-300 flex items-center justify-center shrink-0">
                        <WifiOff size={20} />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-semibold text-white">Can't reach the WhatsApp service</h4>
                        <p className="text-sm text-slate-400 mt-0.5">
                            Account status couldn't be loaded, so the list below may be out of date. Check that the WhatsApp bridge is running, then retry.
                        </p>
                    </div>
                    <button onClick={fetchSessions} disabled={loading} className={secondaryBtn}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Retry
                    </button>
                </div>
            )}

            {loading && sessions.length === 0 && !loadFailed ? (
                <div className="space-y-4" aria-busy="true" aria-label="Loading WhatsApp accounts">
                    {[0, 1].map(i => (
                        <div key={i} className="glass-card p-5 flex items-center gap-4 animate-pulse">
                            <div className="w-10 h-10 rounded-full bg-slate-800" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 w-40 rounded bg-slate-800" />
                                <div className="h-3 w-24 rounded bg-slate-800/70" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : sessions.length === 0 && !loadFailed ? (
                <div className="glass-card p-8 sm:p-10">
                    <div className="max-w-xl">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 mb-4">
                            <QrCode size={24} />
                        </div>
                        <h4 className="text-lg font-bold text-white">Link a WhatsApp account to start posting</h4>
                        <p className="text-sm text-slate-400 mt-1.5">
                            Scheduled announcements are sent from a linked account, so nothing can go out until one is connected.
                        </p>
                        <ol className="mt-5 space-y-2 text-sm text-slate-300 list-decimal pl-5">
                            <li>Choose <strong className="text-white">Add account</strong> for a QR code, or <strong className="text-white">Link with phone number</strong> for a pairing code.</li>
                            <li>On your phone, open WhatsApp and go to Settings, then Linked devices, then Link a device.</li>
                            <li>Scan the QR code, or type in the code. The account shows as Connected within a few seconds.</li>
                        </ol>
                        <div className="mt-6">{addActions}</div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
                    {/* Accounts */}
                    <div className="xl:col-span-3 space-y-4">
                        {sessions.map((sess) => {
                            const isConnected = sess.status === 'CONNECTED';
                            const needsAuth = sess.status === 'AUTH_REQUIRED';
                            const isDraft = sess.id.startsWith('temp_');
                            const phone = sess.jid ? sess.jid.split('@')[0] : null;
                            const qrSvgId = `qr-svg-${sess.id}`;
                            const meta = statusMeta(sess.status);
                            const friendlyError = explainError(sess.lastError);

                            const title = phone
                                ? `+${phone}`
                                : isDraft
                                    ? (isConnected || needsAuth ? 'New account' : 'Unfinished link')
                                    : sess.id;

                            return (
                                <section key={sess.id} className="glass-card overflow-hidden" aria-label={`WhatsApp account ${title}`}>
                                    <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isConnected ? 'bg-emerald-500/15 text-emerald-300' : needsAuth ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'}`}>
                                                {isConnected ? <CheckCircle2 size={20} /> : needsAuth ? <QrCode size={20} /> : <WifiOff size={20} />}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-semibold text-white truncate">{title}</h4>
                                                <span className={`mt-1 inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${meta.chip}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
                                                    {meta.label}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            {isConnected && (
                                                <button
                                                    onClick={() => setTestOpen(prev => ({ ...prev, [sess.id]: !prev[sess.id] }))}
                                                    aria-expanded={!!testOpen[sess.id]}
                                                    aria-label="Send a test message"
                                                    className={`${iconBtn} text-slate-300 hover:text-white hover:bg-slate-800`}
                                                    title="Send a test message"
                                                >
                                                    <Send size={16} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteSession(sess.id)}
                                                aria-label={`Remove ${title}`}
                                                className={`${iconBtn} text-slate-400 hover:text-red-300 hover:bg-red-500/10`}
                                                title="Remove account"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Offline / failed: say why and what to do, in full */}
                                    {!isConnected && !needsAuth && (
                                        <div className="px-4 sm:px-5 pb-5">
                                            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm">
                                                <p className="text-red-200">
                                                    {friendlyError || 'This account is offline.'}
                                                </p>
                                                <p className="text-red-100/75 mt-1.5">
                                                    {isDraft
                                                        ? 'Remove this attempt and start again with Add account or Link with phone number.'
                                                        : 'If it does not come back on its own, remove it and link the account again.'}
                                                </p>
                                                {friendlyError !== sess.lastError && sess.lastError && (
                                                    <p className="text-xs text-red-200/60 mt-2 break-words">Technical detail: {sess.lastError}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Pairing code */}
                                    {needsAuth && sess.pairCode && !sess.qrText && (
                                        <div className="px-4 sm:px-5 pb-5 border-t border-slate-700/50 pt-5 flex flex-col sm:flex-row sm:items-center gap-5">
                                            <div className="bg-white rounded-lg px-5 py-3 shadow-lg self-start">
                                                <span className="font-mono text-2xl sm:text-3xl font-bold tracking-[0.25em] text-slate-900" aria-label={`Pairing code ${sess.pairCode.split('').join(' ')}`}>
                                                    {sess.pairCode}
                                                </span>
                                            </div>
                                            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-300">
                                                <li>Open WhatsApp on your phone.</li>
                                                <li>Go to Settings, then Linked devices, then Link a device.</li>
                                                <li>Choose "Link with phone number instead" and type the code.</li>
                                            </ol>
                                        </div>
                                    )}

                                    {/* QR code */}
                                    {needsAuth && sess.qrText && (
                                        <div className="px-4 sm:px-5 pb-5 border-t border-slate-700/50 pt-5 space-y-5">
                                            {isMobile && (
                                                <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-4 text-sm space-y-2">
                                                    <p className="font-semibold text-amber-200">Using this app on the same phone you want to link?</p>
                                                    <p className="text-amber-100/90">
                                                        A phone can't scan its own screen. Save or share the QR code to a second device, then scan it from WhatsApp on the phone you're linking. Or use Link with phone number instead.
                                                    </p>
                                                </div>
                                            )}
                                            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                                                <div className="flex flex-col items-center gap-3 shrink-0">
                                                    <div className="bg-white p-3 rounded-lg shadow-lg">
                                                        <QRCodeSVG id={qrSvgId} value={sess.qrText} size={176} level="M" includeMargin={false} />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => handleDownloadQR(qrSvgId, sess.id)} className={`${secondaryBtn} !px-2.5 !py-1.5 !text-xs`}>
                                                            <Download size={14} /> Save
                                                        </button>
                                                        <button onClick={() => handleShareQR(qrSvgId, sess.id)} className={`${secondaryBtn} !px-2.5 !py-1.5 !text-xs`}>
                                                            <Share2 size={14} /> Share
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="text-sm text-slate-300 space-y-3">
                                                    <p className="font-semibold text-white">Scan this code to link the account</p>
                                                    <ol className="list-decimal pl-5 space-y-1.5">
                                                        <li>Open WhatsApp on your phone.</li>
                                                        <li>Go to Settings, then Linked devices.</li>
                                                        <li>Tap Link a device and scan this code.</li>
                                                    </ol>
                                                    <p className="text-xs text-slate-400">The code refreshes on its own. If it expires, it is replaced with a new one here.</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Waiting for the code to appear */}
                                    {needsAuth && !sess.qrText && !sess.pairCode && (
                                        <div className="px-4 sm:px-5 pb-5 text-sm text-slate-400 flex items-center gap-2">
                                            <RefreshCw size={14} className="animate-spin" /> Generating your code...
                                        </div>
                                    )}

                                    {/* Connected tools */}
                                    {isConnected && (
                                        <div className="border-t border-slate-700/50 divide-y divide-slate-800">
                                            {testOpen[sess.id] && (
                                                <div className="p-4 sm:p-5 space-y-2 bg-slate-950/30">
                                                    <label htmlFor={`test-${sess.id}`} className="text-xs font-semibold text-slate-300">Send a test message to group</label>
                                                    <div className="flex gap-2">
                                                        <input
                                                            id={`test-${sess.id}`}
                                                            type="text"
                                                            placeholder="1234567-890123@g.us"
                                                            value={testTargets[sess.id] || ''}
                                                            onChange={(e) => setTestTargets(prev => ({ ...prev, [sess.id]: e.target.value }))}
                                                            className={`flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 ${focusRing}`}
                                                        />
                                                        <button onClick={() => handleSendTest(sess.id)} disabled={sendingStates[sess.id]} className={primaryBtn}>
                                                            {sendingStates[sess.id] ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                                                            Send
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="flex items-start gap-3">
                                                    <Users size={16} className="text-slate-400 mt-0.5 shrink-0" />
                                                    <div>
                                                        <div className="text-sm font-medium text-white">Contacts</div>
                                                        <div className="text-xs text-slate-400 mt-0.5">
                                                            {contactSyncInfo.lastSyncedAt
                                                                ? `Last synced ${new Date(contactSyncInfo.lastSyncedAt).toLocaleString()} · ${contactSyncInfo.syncedCount.toLocaleString()} contacts`
                                                                : 'Not synced yet'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleSyncContacts(sess.id)} disabled={syncingContacts[sess.id]} className={secondaryBtn}>
                                                    <RefreshCw size={14} className={syncingContacts[sess.id] ? 'animate-spin' : ''} />
                                                    {syncingContacts[sess.id] ? 'Syncing...' : 'Sync contacts'}
                                                </button>
                                            </div>

                                            <div className="p-4 sm:p-5 space-y-2">
                                                <label htmlFor={`join-${sess.id}`} className="text-sm font-medium text-white flex items-center gap-2">
                                                    <Link2 size={16} className="text-slate-400" /> Join a group
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        id={`join-${sess.id}`}
                                                        type="text"
                                                        placeholder="https://chat.whatsapp.com/..."
                                                        value={inviteLinks[sess.id] || ''}
                                                        onChange={(e) => setInviteLinks(prev => ({ ...prev, [sess.id]: e.target.value }))}
                                                        className={`flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 ${focusRing}`}
                                                    />
                                                    <button onClick={() => handleJoinGroup(sess.id)} disabled={joiningStates[sess.id]} className={secondaryBtn}>
                                                        {joiningStates[sess.id] && <RefreshCw size={14} className="animate-spin" />}
                                                        Join
                                                    </button>
                                                </div>
                                                <p className="text-xs text-slate-400">Paste an invite link or code and this account will join the group.</p>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            );
                        })}
                    </div>

                    {/* Activity */}
                    <div className="xl:col-span-2 glass-card flex flex-col xl:sticky xl:top-6">
                        <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                            <button
                                onClick={() => setLogsOpen(open => !open)}
                                aria-expanded={logsOpen}
                                className={`flex items-center gap-2 text-left rounded-lg ${focusRing} cursor-pointer`}
                            >
                                <History size={18} className="text-slate-400" />
                                <h4 className="font-semibold text-white">Recent activity</h4>
                                <ChevronDown size={16} className={`text-slate-400 transition-transform ${logsOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {logsOpen && (
                                <div className="flex items-center gap-1 text-xs">
                                    {(['all', 'problems'] as const).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setLogFilter(f)}
                                            aria-pressed={logFilter === f}
                                            className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${focusRing} ${logFilter === f ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                        >
                                            {f === 'all' ? 'All' : 'Problems'}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setLogs([])}
                                        className={`px-2.5 py-1 rounded-md font-medium text-slate-400 hover:text-slate-200 cursor-pointer ${focusRing}`}
                                    >
                                        Clear
                                    </button>
                                </div>
                            )}
                        </div>
                        {logsOpen && (
                            <ul className="border-t border-slate-700/50 max-h-[420px] overflow-y-auto divide-y divide-slate-800/70" aria-live="off">
                                {visibleLogs.length === 0 ? (
                                    <li className="p-5 text-sm text-slate-400">
                                        {logFilter === 'problems' ? 'No problems logged.' : 'Nothing yet. Account and posting events show up here as they happen.'}
                                    </li>
                                ) : visibleLogs.map((log, i) => (
                                    <li key={i} className="px-4 sm:px-5 py-2.5 flex gap-3 text-xs leading-relaxed">
                                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${log.type === 'success' ? 'bg-emerald-400' : log.type === 'error' ? 'bg-red-400' : 'bg-slate-600'}`} aria-hidden="true" />
                                        <div className="min-w-0 flex-1">
                                            <p className={`break-words ${log.type === 'error' ? 'text-red-300' : 'text-slate-300'}`}>{log.msg}</p>
                                            <time className="text-slate-500 tabular-nums">{log.time}</time>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppStatus;
