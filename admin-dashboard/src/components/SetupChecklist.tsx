import { useEffect, useState } from 'react';
import { MessageSquare, Users, Megaphone, CheckCircle2, Circle, ArrowUpRight } from 'lucide-react';
import axios from 'axios';

interface Progress {
  whatsapp_linked: boolean;
  group_list_created: boolean;
  post_scheduled: boolean;
  all_complete: boolean;
}

interface SetupChecklistProps {
  setActiveTab: (tab: string) => void;
  triggerNewAnnouncement: () => void;
}

// Shown on the Dashboard until a new account has actually finished real setup (not just
// clicked through the onboarding modal). Disappears the moment all three steps are true.
const SetupChecklist = ({ setActiveTab, triggerNewAnnouncement }: SetupChecklistProps) => {
  const [progress, setProgress] = useState<Progress | null>(null);

  const fetchProgress = async () => {
    try {
      const res = await axios.get('/api/onboarding/progress');
      setProgress(res.data);
    } catch (err) {
      console.error('Failed to load setup progress', err);
    }
  };

  useEffect(() => {
    fetchProgress();
    const interval = setInterval(fetchProgress, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!progress || progress.all_complete) return null;

  const steps = [
    {
      done: progress.whatsapp_linked,
      icon: MessageSquare,
      label: 'Link your WhatsApp account',
      action: () => setActiveTab('whatsapp'),
      cta: 'Connect',
    },
    {
      done: progress.group_list_created,
      icon: Users,
      label: 'Create a Group List',
      action: () => setActiveTab('audience'),
      cta: 'Create',
    },
    {
      done: progress.post_scheduled,
      icon: Megaphone,
      label: 'Schedule your first post',
      action: () => {
        setActiveTab('announcements');
        triggerNewAnnouncement();
      },
      cta: 'Schedule',
    },
  ];
  const doneCount = steps.filter(s => s.done).length;

  return (
    <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-white text-sm">Finish setting up your account</h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            {doneCount === 0
              ? "Three quick steps and you're ready to post."
              : `${doneCount} of ${steps.length} done — almost there.`}
          </p>
        </div>
        <div className="shrink-0 flex gap-1">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`h-1.5 w-8 rounded-full transition-colors ${s.done ? 'bg-emerald-400' : 'bg-slate-700'}`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((s, i) => (
          <div
            key={i}
            className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${s.done ? 'bg-emerald-500/5' : 'bg-slate-900/40'}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {s.done ? (
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              ) : (
                <Circle size={18} className="text-slate-600 shrink-0" />
              )}
              <s.icon size={16} className={s.done ? 'text-emerald-400 shrink-0' : 'text-indigo-400 shrink-0'} />
              <span className={`text-sm truncate ${s.done ? 'text-slate-400 line-through' : 'text-slate-200 font-medium'}`}>
                {s.label}
              </span>
            </div>
            {!s.done && (
              <button
                onClick={s.action}
                className="shrink-0 text-xs font-black text-indigo-400 hover:text-white uppercase tracking-wider bg-indigo-500/10 hover:bg-indigo-500/30 border border-indigo-500/30 px-3 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1"
              >
                {s.cta} <ArrowUpRight size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SetupChecklist;
