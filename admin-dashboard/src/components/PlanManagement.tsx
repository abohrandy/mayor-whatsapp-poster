import { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Plus, Pencil, Trash2, RefreshCw, Search, CheckCircle, XCircle } from 'lucide-react';

interface SubscriptionPlan {
  id: number;
  name: string;
  slug: string;
  price: number;
  duration_days: number;
  max_groups: number;
  max_sessions: number;
  spam_interval_hours: number;
  paystack_plan_code: string | null;
  is_trial: number;
  is_active: number;
  created_at: string;
}

interface PlanFormData {
  name: string;
  slug: string;
  price: number;
  duration_days: number;
  max_groups: number;
  max_sessions: number;
  spam_interval_hours: number;
  paystack_plan_code: string;
  is_trial: boolean;
}

const defaultFormData: PlanFormData = {
  name: '',
  slug: '',
  price: 0,
  duration_days: 30,
  max_groups: 5,
  max_sessions: 1,
  spam_interval_hours: 12,
  paystack_plan_code: '',
  is_trial: false,
};

const formatNaira = (kobo: number): string => {
  const naira = kobo / 100;
  return `₦${naira.toLocaleString('en-NG')}`;
};

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const PlanManagement = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/plans');
      setPlans(res.data.plans || []);
    } catch (err: any) {
      console.error('Failed to fetch plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormData(defaultFormData);
    setModalOpen(true);
  };

  const openEditModal = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      slug: plan.slug,
      price: plan.price / 100,
      duration_days: plan.duration_days,
      max_groups: plan.max_groups,
      max_sessions: plan.max_sessions,
      spam_interval_hours: plan.spam_interval_hours,
      paystack_plan_code: plan.paystack_plan_code || '',
      is_trial: plan.is_trial === 1,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPlan(null);
    setFormData(defaultFormData);
  };

  const handleFormChange = (field: keyof PlanFormData, value: string | number | boolean) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'name' && typeof value === 'string') {
        updated.slug = slugify(value);
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        slug: formData.slug,
        price: Math.round(formData.price * 100),
        duration_days: formData.duration_days,
        max_groups: formData.max_groups,
        max_sessions: formData.max_sessions,
        spam_interval_hours: formData.spam_interval_hours,
        paystack_plan_code: formData.paystack_plan_code || null,
        is_trial: formData.is_trial ? 1 : 0,
      };

      if (editingPlan) {
        await axios.put(`/api/admin/plans/${editingPlan.id}`, payload);
      } else {
        await axios.post('/api/admin/plans', payload);
      }

      closeModal();
      await fetchPlans();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (planId: number) => {
    if (!window.confirm('Are you sure you want to delete this plan? This action cannot be undone.')) return;
    setDeletingId(planId);
    try {
      await axios.delete(`/api/admin/plans/${planId}`);
      await fetchPlans();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete plan.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredPlans = plans.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPlans = plans.length;
  const activePlans = plans.filter(p => p.is_active === 1).length;
  const trialPlans = plans.filter(p => p.is_trial === 1).length;

  return (
    <div className="space-y-6">
      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Plans</p>
            <h3 className="text-3xl font-extrabold text-white mt-1">{totalPlans}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Package size={24} />
          </div>
        </div>

        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Plans</p>
            <h3 className="text-3xl font-extrabold text-emerald-400 mt-1">{activePlans}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <CheckCircle size={24} />
          </div>
        </div>

        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trial Plans</p>
            <h3 className="text-3xl font-extrabold text-yellow-400 mt-1">{trialPlans}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center">
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
              placeholder="Search plans by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary placeholder-slate-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-primary/25"
            >
              <Plus size={14} />
              Create New Plan
            </button>
            <button
              onClick={fetchPlans}
              disabled={loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 hover:border-slate-700 text-xs text-slate-300 font-bold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Plans Table */}
        <div className="overflow-x-auto">
          {loading && plans.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
              <p className="text-slate-500 text-xs">Loading subscription plans...</p>
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              No subscription plans found.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-[10px] font-bold uppercase tracking-wider bg-slate-900/10">
                  <th className="px-6 py-4">Plan Name</th>
                  <th className="px-6 py-4">Slug</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4">Duration</th>
                  <th className="px-6 py-4">Max Groups</th>
                  <th className="px-6 py-4">Max Sessions</th>
                  <th className="px-6 py-4">Spam Hours</th>
                  <th className="px-6 py-4">Paystack Code</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300 text-xs">
                {filteredPlans.map(plan => {
                  const isActive = plan.is_active === 1;
                  return (
                    <tr key={plan.id} className="hover:bg-slate-900/20 transition-colors">
                      <td className="px-6 py-4 font-semibold text-white">{plan.name}</td>
                      <td className="px-6 py-4 text-slate-400 font-mono">{plan.slug}</td>
                      <td className="px-6 py-4 text-white font-mono font-medium">
                        {plan.is_trial === 1 ? (
                          <span className="text-yellow-400">Free</span>
                        ) : (
                          formatNaira(plan.price)
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400">{plan.duration_days} days</td>
                      <td className="px-6 py-4 text-white font-mono">{plan.max_groups}</td>
                      <td className="px-6 py-4 text-white font-mono">{plan.max_sessions}</td>
                      <td className="px-6 py-4 text-slate-400">{plan.spam_interval_hours}h</td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-[10px]">
                        {plan.paystack_plan_code || '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(plan)}
                            className="px-3 py-1.5 rounded text-[10px] font-bold transition-all bg-indigo-500/10 hover:bg-indigo-600 text-indigo-400 hover:text-white cursor-pointer flex items-center gap-1"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(plan.id)}
                            disabled={deletingId === plan.id}
                            className="px-3 py-1.5 rounded text-[10px] font-bold transition-all bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white disabled:opacity-50 cursor-pointer flex items-center gap-1"
                          >
                            {deletingId === plan.id ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div
            className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {editingPlan ? 'Edit Plan' : 'Create New Plan'}
              </h3>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-white transition-colors cursor-pointer text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Plan Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => handleFormChange('name', e.target.value)}
                  placeholder="e.g. Premium Plan"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary placeholder-slate-600 transition-colors"
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Slug
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={e => handleFormChange('slug', e.target.value)}
                  placeholder="auto-generated-from-name"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary placeholder-slate-600 transition-colors font-mono"
                />
              </div>

              {/* Price & Duration Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Price (₦ Naira)
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={e => handleFormChange('price', parseFloat(e.target.value) || 0)}
                    min={0}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary placeholder-slate-600 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Duration (Days)
                  </label>
                  <input
                    type="number"
                    value={formData.duration_days}
                    onChange={e => handleFormChange('duration_days', parseInt(e.target.value) || 0)}
                    min={1}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary placeholder-slate-600 transition-colors"
                  />
                </div>
              </div>

              {/* Max Groups & Max Sessions Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Max Groups
                  </label>
                  <input
                    type="number"
                    value={formData.max_groups}
                    onChange={e => handleFormChange('max_groups', parseInt(e.target.value) || 0)}
                    min={1}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary placeholder-slate-600 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Max Sessions
                  </label>
                  <input
                    type="number"
                    value={formData.max_sessions}
                    onChange={e => handleFormChange('max_sessions', parseInt(e.target.value) || 0)}
                    min={1}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary placeholder-slate-600 transition-colors"
                  />
                </div>
              </div>

              {/* Spam Interval */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Spam Interval (Hours)
                </label>
                <input
                  type="number"
                  value={formData.spam_interval_hours}
                  onChange={e => handleFormChange('spam_interval_hours', parseInt(e.target.value) || 0)}
                  min={1}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary placeholder-slate-600 transition-colors"
                />
              </div>

              {/* Paystack Plan Code */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Paystack Plan Code <span className="text-slate-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.paystack_plan_code}
                  onChange={e => handleFormChange('paystack_plan_code', e.target.value)}
                  placeholder="PLN_xxxxxxxxxxxxx"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-primary placeholder-slate-600 transition-colors font-mono"
                />
              </div>

              {/* Is Trial Checkbox */}
              <div className="flex items-center gap-3 py-1">
                <input
                  type="checkbox"
                  id="is_trial"
                  checked={formData.is_trial}
                  onChange={e => handleFormChange('is_trial', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="is_trial" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  This is a trial plan (free)
                </label>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-xs text-slate-300 font-bold rounded-lg transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name.trim() || !formData.slug.trim()}
                className="px-5 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-primary/25"
              >
                {saving && <RefreshCw size={14} className="animate-spin" />}
                {editingPlan ? 'Update Plan' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanManagement;
