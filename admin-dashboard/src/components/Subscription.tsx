import React, { useState } from 'react';
import axios from 'axios';
import { CreditCard, LogOut, RefreshCw, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';

interface SubscriptionProps {
  user: any;
  onLogout: () => void;
  onSubscriptionSuccess: () => void;
}

const Subscription: React.FC<SubscriptionProps> = ({ user, onLogout, onSubscriptionSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trialLoading, setTrialLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/payments/initialize');
      if (res.data.authorization_url) {
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

  const handleStartTrial = async () => {
    setTrialLoading(true);
    setError(null);
    try {
      await axios.post('/api/payments/start-trial');
      onSubscriptionSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start Free Trial.');
    } finally {
      setTrialLoading(false);
    }
  };

  // Determine trial state
  const isTrial = user.tier === 'trial';
  const trialEnds = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
  const isTrialExpired = trialEnds ? trialEnds < new Date() : true;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Decorative background gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[120px]"></div>

      <div className="glass-card w-full max-w-4xl p-8 relative z-10 space-y-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5 bg-indigo-500/15 border border-indigo-500/20 px-3 py-1 rounded-full text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles size={12} /> Plan Selection & Verification
          </div>
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-white flex items-center gap-1 text-xs cursor-pointer"
          >
            <LogOut size={14} /> Log Out
          </button>
        </div>

        <div className="text-center space-y-2 max-w-lg mx-auto">
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Select a Subscription Plan</h2>
          <p className="text-sm text-slate-400">
            Please choose a plan for <span className="text-primary font-semibold">{user.email}</span> to unlock messaging capabilities and manage WhatsApp connections.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg text-center max-w-md mx-auto">
            {error}
          </div>
        )}

        {/* Plan Selection Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Free Trial Column */}
          <div className={`rounded-2xl p-6 border flex flex-col justify-between ${
            isTrial && !isTrialExpired
              ? 'bg-slate-900/30 border-yellow-500/40 relative'
              : 'bg-slate-900/10 border-slate-800'
          }`}>
            {isTrial && !isTrialExpired && (
              <span className="absolute -top-3 left-6 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-yellow-500/30 uppercase tracking-wide">
                Current Active Plan
              </span>
            )}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">Free Trial</h3>
                <p className="text-xs text-slate-400 mt-1">Try out the poster service for 14 days</p>
                <div className="flex items-baseline gap-1 mt-3 text-white">
                  <span className="text-3xl font-black">Free</span>
                  <span className="text-slate-500 text-xs font-semibold">/ 14 days</span>
                </div>
              </div>

              <div className="h-px bg-slate-800/80"></div>

              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-indigo-400" />
                  Connect max <strong>1 WhatsApp number</strong>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-indigo-400" />
                  Post to max <strong>3 target groups</strong> per message
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-indigo-400" />
                  <strong>12-hour</strong> anti-spam repost limit
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-indigo-400" />
                  Standard message logs
                </li>
              </ul>
            </div>

            <div className="pt-6">
              {isTrial && !isTrialExpired ? (
                <button
                  onClick={onSubscriptionSuccess}
                  className="w-full py-2.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold rounded-lg text-xs hover:bg-yellow-500 hover:text-slate-950 transition-all cursor-pointer text-center"
                >
                  Proceed to Dashboard (Active Trial)
                </button>
              ) : !user.trial_ends_at ? (
                <button
                  onClick={handleStartTrial}
                  disabled={trialLoading}
                  className="w-full py-2.5 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold rounded-lg text-xs transition-all cursor-pointer text-center flex items-center justify-center gap-2"
                >
                  {trialLoading && <RefreshCw size={14} className="animate-spin" />}
                  Start 14-day Free Trial
                </button>
              ) : (
                <div className="w-full py-2.5 bg-slate-800/50 text-slate-500 border border-slate-700/30 font-semibold rounded-lg text-xs text-center">
                  Trial Expired
                </div>
              )}
            </div>
          </div>

          {/* Premium Plan Column */}
          <div className={`rounded-2xl p-6 border flex flex-col justify-between ${
            !isTrial || isTrialExpired
              ? 'bg-slate-900/50 border-primary/50 relative shadow-xl shadow-primary/5'
              : 'bg-slate-900/20 border-slate-800'
          }`}>
            {(!isTrial || isTrialExpired) && (
              <span className="absolute -top-3 left-6 bg-primary/20 text-indigo-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-primary/30 uppercase tracking-wide">
                Recommended Plan
              </span>
            )}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">Premium Plan</h3>
                <p className="text-xs text-slate-400 mt-1">Scale up your outreach to multiple groups</p>
                <div className="flex items-baseline gap-1 mt-3 text-white">
                  <span className="text-3xl font-black">₦5,000</span>
                  <span className="text-slate-500 text-xs font-semibold">/ month</span>
                </div>
              </div>

              <div className="h-px bg-slate-800/80"></div>

              <ul className="space-y-2.5 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-indigo-400" />
                  Connect <strong>multiple WhatsApp numbers</strong>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-indigo-400" />
                  Post to max <strong>50 target groups</strong> per message
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-indigo-400" />
                  <strong>6-hour</strong> anti-spam repost limit
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-indigo-400" />
                  Priority sending and retry support
                </li>
              </ul>
            </div>

            <div className="pt-6 space-y-2">
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg text-xs transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <CreditCard size={14} />}
                {loading ? 'Redirecting to Paystack...' : 'Subscribe via Paystack'}
              </button>

              <button
                onClick={onSubscriptionSuccess}
                className="w-full py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-400 border border-slate-700/50 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <RefreshCw size={10} /> Verify Subscription Status
              </button>
            </div>
          </div>
        </div>

        {/* Serious Compliance Disclaimer */}
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3 items-start">
          <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={18} />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wide">
              Strict Zero-Tolerance Anti-Spam & Abuse Agreement
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              We do not tolerate spamming, aggressive advertising, harassment, or any illegal activities. Users must comply with local regulations and WhatsApp's Terms of Service. Violators' sessions will be deleted and accounts will be permanently suspended immediately without refund or warning.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Subscription;
