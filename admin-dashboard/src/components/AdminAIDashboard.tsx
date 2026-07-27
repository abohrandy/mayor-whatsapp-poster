import { useState, useEffect } from 'react';
import {
  DollarSign, Cpu, Key, ToggleLeft, ToggleRight,
  TrendingUp, Users, RefreshCw, Layers, Zap, Save, CheckCircle,
  Activity, ShieldAlert, BarChart3, Settings
} from 'lucide-react';
import axios from 'axios';

const PRIMARY_MODELS = [
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V4 Flash (Default Primary)' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 3.5 Flash' },
  { id: 'thudm/glm-4-9b-chat', name: 'GLM 5.1' },
  { id: 'minimax/minimax-01', name: 'MiniMax M2' }
];

const FALLBACK_MODELS = [
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 3.5 Flash (Fallback 1)' },
  { id: 'thudm/glm-4-9b-chat', name: 'GLM 5.1 (Fallback 2)' },
  { id: 'minimax/minimax-01', name: 'MiniMax M2 (Fallback 3)' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V4 Flash' }
];

const PREMIUM_MODELS = [
  { id: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o Mini' },
  { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Anthropic Claude 3.5 Haiku' },
  { id: 'google/gemini-2.5-flash', name: 'Google Gemini 2.5 Flash' }
];

const StatCard = ({ title, value, icon: Icon, color, subtext }: any) => (
  <div className="glass-card p-5 flex items-start justify-between">
    <div>
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">{title}</p>
      <h3 className="text-2xl font-extrabold text-white">{value}</h3>
      {subtext && <p className="text-[11px] text-slate-500 mt-1">{subtext}</p>}
    </div>
    <div className={`p-3 rounded-xl ${color} bg-opacity-20`}>
      <Icon size={22} className={color.replace('bg-', 'text-')} />
    </div>
  </div>
);

const AdminAIDashboard = () => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'config'>('analytics');
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    openrouter_api_key: '',
    active_model: 'deepseek/deepseek-chat',
    fallback_model_1: 'qwen/qwen-2.5-72b-instruct',
    fallback_model_2: 'thudm/glm-4-9b-chat',
    fallback_model_3: 'minimax/minimax-01',
    disabled_models: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-haiku', 'google/gemini-2.5-flash'],
    ai_enabled: true,
    credits_trial: 50,
    credits_plus: 200,
    credits_unlimited: 1000,
    cost_per_feature: {
      improve: 1,
      rewrite: 1,
      grammar: 1,
      translate: 1,
      expand: 1,
      shorten: 1,
      generate_variations: 1
    }
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [dashRes, logsRes] = await Promise.all([
        axios.get('/api/admin/ai-dashboard'),
        axios.get('/api/admin/ai-request-logs')
      ]);

      setStats(dashRes.data);
      setLogs(logsRes.data || []);

      if (dashRes.data?.aiSettings) {
        const s = dashRes.data.aiSettings;
        let costs = { improve: 1, rewrite: 1, grammar: 1, translate: 1, expand: 1, shorten: 1, generate_variations: 1 };
        try { costs = JSON.parse(s.cost_per_feature || '{}'); } catch {}

        let disabled = ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-haiku', 'google/gemini-2.5-flash'];
        try { disabled = JSON.parse(s.disabled_models || '[]'); } catch {}

        setSettingsForm({
          openrouter_api_key: s.openrouter_api_key || '',
          active_model: s.active_model || 'deepseek/deepseek-chat',
          fallback_model_1: s.fallback_model_1 || s.fallback_model || 'qwen/qwen-2.5-72b-instruct',
          fallback_model_2: s.fallback_model_2 || 'thudm/glm-4-9b-chat',
          fallback_model_3: s.fallback_model_3 || 'minimax/minimax-01',
          disabled_models: disabled,
          ai_enabled: Boolean(s.ai_enabled),
          credits_trial: s.credits_trial || 50,
          credits_plus: s.credits_plus || 200,
          credits_unlimited: s.credits_unlimited || 1000,
          cost_per_feature: { ...costs }
        });
      }
    } catch (err) {
      console.error('Failed to fetch AI dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSaveSuccess(false);
    try {
      await axios.post('/api/admin/ai-settings', settingsForm);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      fetchDashboardData();
    } catch (err: any) {
      alert('Failed to save AI settings: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleDisabledModel = (modelId: string) => {
    const exists = settingsForm.disabled_models.includes(modelId);
    let updated = [...settingsForm.disabled_models];
    if (exists) {
      updated = updated.filter(m => m !== modelId);
    } else {
      updated.push(modelId);
    }
    setSettingsForm({ ...settingsForm, disabled_models: updated });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
        <RefreshCw size={20} className="animate-spin text-indigo-400" />
        <span>Loading Super Admin AI Control Center...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Cpu className="text-indigo-400" size={28} /> Super Admin AI Dashboard
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Super admin controls for OpenRouter configurations, model failovers, cost limits, and real-time spend analytics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'analytics' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 size={14} /> AI Analytics
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'config' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Settings size={14} /> AI Configuration
            </button>
          </div>
          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {activeTab === 'analytics' ? (
        <>
          {/* ── Stat Cards Grid (Spend & Volume) ─────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Today's Spend"
              value={`$${stats?.dailySpend || 0}`}
              icon={DollarSign}
              color="bg-emerald-500"
              subtext="Actual OpenRouter cost today"
            />
            <StatCard
              title="Weekly Spend (7d)"
              value={`$${stats?.weeklySpend || 0}`}
              icon={TrendingUp}
              color="bg-indigo-500"
              subtext="Spend last 7 days"
            />
            <StatCard
              title="Monthly Spend (30d)"
              value={`$${stats?.monthlySpend || 0}`}
              icon={DollarSign}
              color="bg-purple-500"
              subtext="Spend last 30 days"
            />
            <StatCard
              title="Credits Issued vs Used"
              value={`${stats?.creditsUsed || 0} / ${stats?.creditsIssued || 0}`}
              icon={Zap}
              color="bg-amber-500"
              subtext={`Avg Cost / Req: $${stats?.avgCostPerRequest || 0}`}
            />
          </div>

          {/* ── AI Health & Fallback Statistics ─────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-card p-5 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">AI System Health</p>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    stats?.aiHealth?.status === 'Operational' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}>
                    {stats?.aiHealth?.status || 'Operational'}
                  </span>
                  <span className="text-xs text-slate-400">({stats?.aiHealth?.successRate || 100}% Success Rate)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Average Latency: {stats?.aiHealth?.avgLatencyMs || 0} ms</p>
              </div>
              <Activity className="text-emerald-400" size={32} />
            </div>

            <div className="glass-card p-5 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Fallback Statistics</p>
                <h3 className="text-xl font-extrabold text-white">{stats?.fallbackStats?.fallbackCount || 0} Failovers Triggered</h3>
                <p className="text-[11px] text-slate-500 mt-1">Fallback Rate: {stats?.fallbackStats?.fallbackRate || 0}% across {stats?.fallbackStats?.totalRequests || 0} total requests</p>
              </div>
              <ShieldAlert className="text-amber-400" size={32} />
            </div>
          </div>

          {/* ── Leaderboards & Model Cost Breakdowns ───────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Users */}
            <div className="glass-card p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users size={16} className="text-indigo-400" /> Top Users by Cost &amp; Consumption
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/60 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-2">User Email</th>
                      <th className="p-2">Requests</th>
                      <th className="p-2">Credits</th>
                      <th className="p-2">Tokens</th>
                      <th className="p-2">Cost ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {stats?.topUsers?.map((u: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-900/30">
                        <td className="p-2 font-medium text-white">{u.user_email}</td>
                        <td className="p-2">{u.request_count}</td>
                        <td className="p-2 text-indigo-400 font-bold">{u.credits_used}</td>
                        <td className="p-2 text-slate-400">{u.total_tokens}</td>
                        <td className="p-2 text-emerald-400">${parseFloat((u.total_cost || 0).toFixed(4))}</td>
                      </tr>
                    ))}
                    {(!stats?.topUsers || stats.topUsers.length === 0) && (
                      <tr><td colSpan={5} className="p-4 text-center text-slate-500">No AI user activity recorded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Model Usage & Cost Per Model */}
            <div className="glass-card p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu size={16} className="text-purple-400" /> Model Usage &amp; Cost Per Model
              </h3>
              <div className="space-y-3">
                {stats?.modelUsage?.map((m: any, i: number) => (
                  <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <div className="text-xs font-bold text-white font-mono">{m.model_used}</div>
                      <div className="text-[11px] text-slate-400">{m.total_tokens} tokens consumed ({m.count} calls)</div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-emerald-400">${parseFloat((m.total_cost || 0).toFixed(4))}</span>
                      <span className="text-xs text-slate-500 block">total cost</span>
                    </div>
                  </div>
                ))}
                {(!stats?.modelUsage || stats.modelUsage.length === 0) && (
                  <p className="text-xs text-slate-500 text-center py-6">No model usage recorded yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Feature Breakdown ────────────────────────────────────────────── */}
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap size={16} className="text-amber-400" /> Top AI Features Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats?.mostUsedFeatures?.map((f: any, i: number) => (
                <div key={i} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                  <span className="text-xs font-bold text-indigo-300 capitalize">{f.operation}</span>
                  <div className="text-xl font-extrabold text-white">{f.count} calls</div>
                  <div className="text-[11px] text-slate-400 flex justify-between pt-1">
                    <span>{f.credits_used} credits</span>
                    <span className="text-emerald-400">${parseFloat((f.total_cost || 0).toFixed(4))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Request Audit Logs ───────────────────────────────────────────── */}
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers size={16} className="text-purple-400" /> OpenRouter Telemetry &amp; Audit Logs
            </h3>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400 font-semibold sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="p-2">Timestamp</th>
                    <th className="p-2">User Email</th>
                    <th className="p-2">Operation</th>
                    <th className="p-2">Model Used</th>
                    <th className="p-2">Latency</th>
                    <th className="p-2">Tokens</th>
                    <th className="p-2">Cost ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-900/30">
                      <td className="p-2 text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="p-2 font-medium text-white">{log.user_email}</td>
                      <td className="p-2 capitalize font-semibold text-indigo-300">{log.operation}</td>
                      <td className="p-2 font-mono text-[11px] text-amber-300">{log.model_used}</td>
                      <td className="p-2 text-slate-400">{log.response_time_ms || 0} ms</td>
                      <td className="p-2 text-slate-300">{log.total_tokens}</td>
                      <td className="p-2 text-emerald-400">${parseFloat((log.estimated_cost || 0).toFixed(6))}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-slate-500">No telemetry request logs recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* ── AI Configuration Panel ─────────────────────────────────────────── */
        <form onSubmit={handleSaveSettings} className="glass-card p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-700/50 pb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Key size={20} className="text-indigo-400" /> AI System &amp; Model Routing Configurations
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-300">Global AI Status:</span>
              <button
                type="button"
                onClick={() => setSettingsForm({ ...settingsForm, ai_enabled: !settingsForm.ai_enabled })}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  settingsForm.ai_enabled
                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-600/30 text-rose-300 border border-rose-500/40'
                }`}
              >
                {settingsForm.ai_enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                {settingsForm.ai_enabled ? 'AI Enabled' : 'AI Disabled'}
              </button>
            </div>
          </div>

          {/* OpenRouter API Key */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300">OpenRouter API Key</label>
            <input
              type="password"
              placeholder="sk-or-v1-..."
              value={settingsForm.openrouter_api_key}
              onChange={e => setSettingsForm({ ...settingsForm, openrouter_api_key: e.target.value })}
              className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="text-[10px] text-slate-500">API key is encrypted in database and never exposed to non-super-admin users.</p>
          </div>

          {/* Primary & Fallback Models */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Primary Model</label>
              <select
                value={settingsForm.active_model}
                onChange={e => setSettingsForm({ ...settingsForm, active_model: e.target.value })}
                className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
              >
                {PRIMARY_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Fallback 1</label>
              <select
                value={settingsForm.fallback_model_1}
                onChange={e => setSettingsForm({ ...settingsForm, fallback_model_1: e.target.value })}
                className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
              >
                {FALLBACK_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Fallback 2</label>
              <select
                value={settingsForm.fallback_model_2}
                onChange={e => setSettingsForm({ ...settingsForm, fallback_model_2: e.target.value })}
                className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
              >
                {FALLBACK_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Fallback 3</label>
              <select
                value={settingsForm.fallback_model_3}
                onChange={e => setSettingsForm({ ...settingsForm, fallback_model_3: e.target.value })}
                className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
              >
                {FALLBACK_MODELS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Model Enable / Disable Toggles */}
          <div className="border-t border-slate-700/50 pt-6 space-y-3">
            <h4 className="text-sm font-bold text-slate-300">Enable / Disable Premium Models</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PREMIUM_MODELS.map(pm => {
                const isDisabled = settingsForm.disabled_models.includes(pm.id);
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => toggleDisabledModel(pm.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                      isDisabled
                        ? 'bg-slate-900/60 border-slate-800 text-slate-500'
                        : 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200'
                    }`}
                  >
                    <span>{pm.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDisabled ? 'bg-slate-800 text-slate-400' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {isDisabled ? 'Disabled' : 'Enabled'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feature Costs */}
          <div className="border-t border-slate-700/50 pt-6 space-y-3">
            <h4 className="text-sm font-bold text-slate-300">Credit Cost Per AI Feature</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.keys(settingsForm.cost_per_feature).map(feat => (
                <div key={feat} className="space-y-1">
                  <label className="text-xs text-slate-400 capitalize">{feat.replace('_', ' ')}</label>
                  <input
                    type="number"
                    min={1}
                    value={(settingsForm.cost_per_feature as any)[feat] || 1}
                    onChange={e => setSettingsForm({
                      ...settingsForm,
                      cost_per_feature: {
                        ...settingsForm.cost_per_feature,
                        [feat]: parseInt(e.target.value) || 1
                      }
                    })}
                    className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Credits Per Subscription Tier */}
          <div className="border-t border-slate-700/50 pt-6 space-y-3">
            <h4 className="text-sm font-bold text-slate-300">Credits Per Subscription Tier</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Trial Tier Limit</label>
                <input
                  type="number"
                  min={0}
                  value={settingsForm.credits_trial}
                  onChange={e => setSettingsForm({ ...settingsForm, credits_trial: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Plus Tier Limit</label>
                <input
                  type="number"
                  min={0}
                  value={settingsForm.credits_plus}
                  onChange={e => setSettingsForm({ ...settingsForm, credits_plus: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Unlimited Tier Limit</label>
                <input
                  type="number"
                  min={0}
                  value={settingsForm.credits_unlimited}
                  onChange={e => setSettingsForm({ ...settingsForm, credits_unlimited: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* Save Action */}
          <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-700/50">
            {saveSuccess && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle size={14} /> AI Configurations Saved!
              </span>
            )}
            <button
              type="submit"
              disabled={savingSettings}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
            >
              {savingSettings ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              Save AI Configuration Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default AdminAIDashboard;
