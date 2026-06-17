import React, { useState } from 'react';
import axios from 'axios';
import { CreditCard, LogOut, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';

interface SubscriptionProps {
  user: any;
  onLogout: () => void;
  onSubscriptionSuccess: () => void;
}

const Subscription: React.FC<SubscriptionProps> = ({ user, onLogout, onSubscriptionSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/payments/initialize');
      if (res.data.authorization_url) {
        // Redirect to Paystack Checkout
        window.location.href = res.data.authorization_url;
      } else {
        throw new Error('Paystack authorization URL missing in response.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to initiate Paystack checkout.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Decorative background gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[120px]"></div>

      <div className="glass-card w-full max-w-md p-8 relative z-10 space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1 bg-indigo-500/15 border border-indigo-500/20 px-2.5 py-1 rounded-full text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
            <Sparkles size={10} /> Subscription Required
          </div>
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-white flex items-center gap-1 text-xs cursor-pointer"
          >
            <LogOut size={14} /> Log Out
          </button>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">Active Plan Required</h2>
          <p className="text-sm text-slate-400">
            Subscribe <span className="text-primary font-semibold">{user.email}</span> to unlock SaaS features and manage multiple WhatsApp connections.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-3 rounded-lg text-center">
            {error}
          </div>
        )}

        {/* Pricing Plan Card */}
        <div className="bg-slate-900/50 border border-indigo-500/30 rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/5 rounded-full blur-xl"></div>
          <div className="space-y-4">
            <div>
              <h4 className="text-indigo-400 text-xs font-bold uppercase tracking-widest">Premium Plan</h4>
              <div className="flex items-baseline gap-1 mt-1 text-white">
                <span className="text-3xl font-extrabold">₦5,000</span>
                <span className="text-slate-500 text-xs font-semibold">/ month</span>
              </div>
            </div>

            <div className="h-px bg-slate-800"></div>

            <ul className="space-y-2.5 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-indigo-400" />
                Connect multiple WhatsApp numbers
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-indigo-400" />
                Unlimited scheduled announcements
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-indigo-400" />
                Programmatically join WhatsApp groups
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-indigo-400" />
                Image & Video posting with variations
              </li>
            </ul>
          </div>
        </div>

        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          {loading ? <RefreshCw size={16} className="animate-spin" /> : <CreditCard size={16} />}
          {loading ? 'Redirecting to Paystack...' : 'Subscribe via Paystack'}
        </button>

        <button
          onClick={onSubscriptionSuccess}
          className="w-full py-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/50 hover:border-slate-700 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <RefreshCw size={12} />
          I've subscribed / Refresh Status
        </button>

        <p className="text-[10px] text-slate-500 text-center">
          Subscriptions are handled securely via Paystack. You can cancel at any time.
        </p>
      </div>
    </div>
  );
};

export default Subscription;
