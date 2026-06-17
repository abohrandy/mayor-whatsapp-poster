import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Globe, Clock, MessageCircle } from 'lucide-react';
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
  'Asia/London',
];

const Settings = () => {
  const [settings, setSettings] = useState({
    timezone: 'Africa/Lagos',
    default_post_time: '08:00',
    send_delay_seconds: 5,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [testGroupId, setTestGroupId] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE_URL}/settings`);
      if (res.data) setSettings(res.data);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load settings.' });
    } finally { setLoading(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      await axios.post(`${API_BASE_URL}/settings`, settings);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally { setSaving(false); }
  };

  const handleTestMessage = async () => {
    if (!testGroupId.trim()) {
      alert('Please enter a WhatsApp Group ID to test.');
      return;
    }
    setTesting(true);
    try {
      await axios.post(`${API_BASE_URL}/whatsapp/send-test`, { groupId: testGroupId });
      alert('Test message sent successfully!');
    } catch (err: any) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally { setTesting(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* System Configuration */}
      <div className="glass-card p-6">
        <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <Globe className="text-primary" size={24} />
          System Configuration
        </h3>

        <form id="settings-form" onSubmit={handleSave} className="space-y-6">
          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Timezone
            </label>
            <select
              id="select-timezone"
              value={settings.timezone}
              onChange={e => setSettings({ ...settings, timezone: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition-colors"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Used by the scheduler to calculate correct post times.
            </p>
          </div>

          {/* Default Post Time */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
              <Clock size={15} /> Default Post Time
            </label>
            <input
              id="input-default-time"
              type="time"
              value={settings.default_post_time}
              onChange={e => setSettings({ ...settings, default_post_time: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition-colors"
            />
            <p className="mt-1 text-xs text-slate-500">
              Pre-filled in the announcement form when creating new posts.
            </p>
          </div>

          {/* Message Send Delay */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
              <Clock size={15} /> Message Send Delay (seconds)
            </label>
            <input
              id="input-send-delay"
              type="number"
              min="1"
              max="120"
              value={settings.send_delay_seconds || 5}
              onChange={e => setSettings({ ...settings, send_delay_seconds: parseInt(e.target.value) || 5 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition-colors"
            />
            <p className="mt-1 text-xs text-slate-500">
              Delay between sending messages to individual groups (prevents rate limiting / error 420). Recommended: 5-10 seconds.
            </p>
          </div>

          {/* Save */}
          <div className="flex items-center justify-between pt-2">
            {message.text && (
              <span className={`text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {message.text}
              </span>
            )}
            <button
              id="btn-save-settings"
              type="submit"
              disabled={saving}
              className="ml-auto px-6 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg flex items-center gap-2 transition-all font-medium disabled:opacity-50"
            >
              {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
              Save Settings
            </button>
          </div>
        </form>
      </div>

      {/* Test Message */}
      <div className="glass-card p-6">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <MessageCircle className="text-primary" size={24} />
          Test Connection
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Send a test message to a specific group to verify WhatsApp is connected and working.
        </p>
        <div className="flex gap-3">
          <input
            id="input-test-group"
            type="text"
            value={testGroupId}
            onChange={e => setTestGroupId(e.target.value)}
            placeholder="e.g. 1234567890-1234567890@g.us"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition-colors"
          />
          <button
            id="btn-send-test"
            onClick={handleTestMessage}
            disabled={testing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 transition-all"
          >
            {testing ? <RefreshCw size={16} className="animate-spin" /> : null}
            Send Test
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
