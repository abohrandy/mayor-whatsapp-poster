import React, { useState, useEffect } from 'react';
import {
  Save, RefreshCw, Globe, Clock, MessageCircle, Sliders, Shield,
  Bell, Sparkles, Key, CheckCircle, AlertCircle, Link, Moon, User
} from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = '/api';

const TIMEZONES = [
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
];

const AI_TONES = [
  'Professional',
  'Casual & Friendly',
  'Persuasive Sales',
  'Promotional / Urgent',
  'Informative',
  'Witty & Engaging'
];

const LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Arabic',
  'Yoruba',
  'Igbo',
  'Hausa'
];

const Settings = () => {
  const [activeTab, setActiveTab] = useState<'automation' | 'ai' | 'notifications' | 'test' | 'security'>('automation');
  const [settings, setSettings] = useState({
    timezone: 'Africa/Lagos',
    default_post_time: '08:00',
    send_delay_seconds: 5,
    randomize_delay: true,
    auto_retry: true,
    max_retries: 3,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
    ai_tone: 'Professional',
    ai_language: 'English',
    notify_email_failures: true,
    notify_email_disconnects: true,
    notify_email_low_credits: true,
    webhook_url: ''
  });

  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [passMessage, setPassMessage] = useState({ type: '', text: '' });

  const [testGroupId, setTestGroupId] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchSettingsAndProfile();
  }, []);

  const fetchSettingsAndProfile = async () => {
    try {
      setLoading(true);
      const [settRes, meRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/settings`),
        axios.get(`${API_BASE_URL}/auth/me`).catch(() => ({ data: null }))
      ]);

      if (settRes.data) {
        setSettings({
          ...settRes.data,
          randomize_delay: Boolean(settRes.data.randomize_delay),
          auto_retry: Boolean(settRes.data.auto_retry),
          quiet_hours_enabled: Boolean(settRes.data.quiet_hours_enabled),
          notify_email_failures: Boolean(settRes.data.notify_email_failures),
          notify_email_disconnects: Boolean(settRes.data.notify_email_disconnects),
          notify_email_low_credits: Boolean(settRes.data.notify_email_low_credits)
        });
      }

      if (meRes?.data?.user) {
        setUserProfile(meRes.data.user);
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to load settings.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      await axios.post(`${API_BASE_URL}/settings`, settings);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPassMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setChangingPass(true);
    setPassMessage({ type: '', text: '' });
    try {
      await axios.post(`${API_BASE_URL}/auth/change-password`, {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password
      });
      setPassMessage({ type: 'success', text: 'Password changed successfully!' });
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setTimeout(() => setPassMessage({ type: '', text: '' }), 3000);
    } catch (err: any) {
      setPassMessage({ type: 'error', text: err.response?.data?.error || 'Failed to change password.' });
    } finally {
      setChangingPass(false);
    }
  };

  const handleTestMessage = async () => {
    if (!testGroupId.trim()) {
      alert('Please enter a WhatsApp Group ID or phone number to test.');
      return;
    }
    setTesting(true);
    try {
      await axios.post(`${API_BASE_URL}/whatsapp/send-test`, { groupId: testGroupId });
      alert('Test message sent successfully!');
    } catch (err: any) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Sliders className="text-indigo-400" size={26} /> System &amp; Account Settings
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage automation delays, AI defaults, notifications, security credentials, and bridge connections.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto">
          <button
            onClick={() => setActiveTab('automation')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'automation' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock size={14} /> Automation
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ai' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles size={14} /> AI Writing
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'notifications' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bell size={14} /> Alerts &amp; Webhooks
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'test' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageCircle size={14} /> Bridge Test
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'security' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield size={14} /> Account &amp; Security
          </button>
        </div>
      </div>

      {/* Main Settings Form */}
      {activeTab !== 'security' && activeTab !== 'test' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* ── Tab 1: Automation & Safety Rules ──────────────────────────────── */}
          {activeTab === 'automation' && (
            <div className="glass-card p-6 space-y-6">
              <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Globe className="text-indigo-400" size={20} /> Scheduler &amp; Rate Limiting Rules
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Timezone */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">System Timezone</label>
                  <select
                    value={settings.timezone}
                    onChange={e => setSettings({ ...settings, timezone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">Used by campaign schedulers for local post delivery timing.</p>
                </div>

                {/* Default Post Time */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Default Post Time</label>
                  <input
                    type="time"
                    value={settings.default_post_time}
                    onChange={e => setSettings({ ...settings, default_post_time: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500">Default time pre-filled when scheduling new announcements.</p>
                </div>

                {/* Message Send Delay */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Base Send Delay (seconds)</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={settings.send_delay_seconds}
                    onChange={e => setSettings({ ...settings, send_delay_seconds: parseInt(e.target.value) || 5 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500">Delay between messages to prevent WhatsApp rate limits (Recommended: 5-10s).</p>
                </div>

                {/* Max Retries */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Max Auto-Retries for Failed Posts</label>
                  <select
                    value={settings.max_retries}
                    onChange={e => setSettings({ ...settings, max_retries: parseInt(e.target.value) || 3 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value={1}>1 Retry</option>
                    <option value={2}>2 Retries</option>
                    <option value={3}>3 Retries (Recommended)</option>
                    <option value={5}>5 Retries</option>
                  </select>
                  <p className="text-[11px] text-slate-500">Number of automatic retry attempts before marking a job failed.</p>
                </div>
              </div>

              {/* Checkbox Safety Toggles */}
              <div className="border-t border-slate-800 pt-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Anti-Ban &amp; Safety Controls</h4>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.randomize_delay}
                    onChange={e => setSettings({ ...settings, randomize_delay: e.target.checked })}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Randomize Send Delay (+1s to +5s Jitter)</span>
                    <span className="text-[11px] text-slate-400">Adds subtle random timing variations to mimic human posting behavior and reduce anti-spam triggers.</span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.auto_retry}
                    onChange={e => setSettings({ ...settings, auto_retry: e.target.checked })}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Enable Automatic Job Queue Retries</span>
                    <span className="text-[11px] text-slate-400">Automatically re-queues transient network failures for retry.</span>
                  </div>
                </label>
              </div>

              {/* Quiet Hours */}
              <div className="border-t border-slate-800 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Moon size={14} className="text-indigo-400" /> Quiet Hours (Night Pause Window)
                    </span>
                    <span className="text-[11px] text-slate-400">Pause automated dispatching during late hours.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.quiet_hours_enabled}
                    onChange={e => setSettings({ ...settings, quiet_hours_enabled: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                {settings.quiet_hours_enabled && (
                  <div className="grid grid-cols-2 gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Pause Starting At</label>
                      <input
                        type="time"
                        value={settings.quiet_hours_start}
                        onChange={e => setSettings({ ...settings, quiet_hours_start: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Resume Dispatch At</label>
                      <input
                        type="time"
                        value={settings.quiet_hours_end}
                        onChange={e => setSettings({ ...settings, quiet_hours_end: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab 2: AI & Content Preferences ──────────────────────────────── */}
          {activeTab === 'ai' && (
            <div className="glass-card p-6 space-y-6">
              <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Sparkles className="text-purple-400" size={20} /> AI Copywriter &amp; Formatting Preferences
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Default Writing Tone</label>
                  <select
                    value={settings.ai_tone}
                    onChange={e => setSettings({ ...settings, ai_tone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {AI_TONES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">Default tone pre-applied to AI text expansions and enhancements.</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-300">Default AI Target Language</label>
                  <select
                    value={settings.ai_language}
                    onChange={e => setSettings({ ...settings, ai_language: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">Target language used during text translation operations.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 3: Notifications & Webhooks ───────────────────────────────── */}
          {activeTab === 'notifications' && (
            <div className="glass-card p-6 space-y-6">
              <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Bell className="text-amber-400" size={20} /> Email Notifications &amp; Webhook Triggers
              </h3>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Email Notification Rules</h4>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notify_email_failures}
                    onChange={e => setSettings({ ...settings, notify_email_failures: e.target.checked })}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Email Alerts on Campaign Failure</span>
                    <span className="text-[11px] text-slate-400">Receive instant email alerts if a broadcast fails delivery.</span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notify_email_disconnects}
                    onChange={e => setSettings({ ...settings, notify_email_disconnects: e.target.checked })}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Email Alerts on Session Disconnect</span>
                    <span className="text-[11px] text-slate-400">Receive alert emails if your linked WhatsApp session gets logged out.</span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notify_email_low_credits}
                    onChange={e => setSettings({ ...settings, notify_email_low_credits: e.target.checked })}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Low AI Credit Balance Warnings</span>
                    <span className="text-[11px] text-slate-400">Get notified when AI credits drop below 10%.</span>
                  </div>
                </label>
              </div>

              {/* Webhook Endpoint */}
              <div className="border-t border-slate-800 pt-5 space-y-2">
                <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Link size={14} className="text-indigo-400" /> Webhook Event URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://your-domain.com/webhooks/whatsapp-events"
                  value={settings.webhook_url}
                  onChange={e => setSettings({ ...settings, webhook_url: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-[10px] text-slate-500">Real-time HTTP POST payload sent when posts are dispatched or fail.</p>
              </div>
            </div>
          )}

          {/* Save Action Footer */}
          <div className="flex items-center justify-between pt-2">
            {message.text && (
              <span className={`text-xs font-semibold flex items-center gap-1 ${
                message.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {message.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {message.text}
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="ml-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-2 transition-all font-bold text-xs cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              Save All Settings
            </button>
          </div>
        </form>
      )}

      {/* ── Tab 4: Connection Test ────────────────────────────────────────── */}
      {activeTab === 'test' && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <MessageCircle className="text-emerald-400" size={20} /> Bridge Connection Diagnostics
          </h3>
          <p className="text-xs text-slate-400">
            Send a test message to a specific WhatsApp Group ID or phone number to verify that your session bridge is active.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <input
              type="text"
              value={testGroupId}
              onChange={e => setTestGroupId(e.target.value)}
              placeholder="e.g. 1234567890-1234567890@g.us or 2348012345678"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
            <button
              onClick={handleTestMessage}
              disabled={testing}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
            >
              {testing ? <RefreshCw size={16} className="animate-spin" /> : null}
              Send Test Message
            </button>
          </div>
        </div>
      )}

      {/* ── Tab 5: Account & Security ──────────────────────────────────────── */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <User className="text-indigo-400" size={20} /> Profile Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block">Account Email:</span>
                <span className="text-white font-bold">{userProfile?.email || 'Current User'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Subscription Tier:</span>
                <span className="text-indigo-300 font-bold uppercase">{userProfile?.tier || 'Active'}</span>
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Key className="text-amber-400" size={20} /> Update Security Password
            </h3>

            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Current Password</label>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={e => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {passMessage.text && (
                  <span className={`text-xs font-semibold flex items-center gap-1 ${
                    passMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {passMessage.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                    {passMessage.text}
                  </span>
                )}
                <button
                  type="submit"
                  disabled={changingPass}
                  className="ml-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {changingPass ? <RefreshCw size={16} className="animate-spin" /> : <Key size={16} />}
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
