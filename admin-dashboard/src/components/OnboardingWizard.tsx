import { useState } from 'react';
import { X, MessageSquare, Users, Megaphone, ShieldAlert, Sparkles, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface OnboardingWizardProps {
  onClose: (dontShowAgain: boolean) => void;
}

const STEPS = [
  {
    icon: Sparkles,
    color: 'text-primary bg-primary/10',
    title: 'Welcome to WhatsApp Group Poster',
    description: "Let's get you set up in three quick steps so you can start posting to your groups safely and automatically.",
    instructions: [] as string[],
    tip: null as string | null,
  },
  {
    icon: MessageSquare,
    color: 'text-indigo-400 bg-indigo-500/10',
    title: 'Step 1: Link your WhatsApp Account',
    description: 'Link your WhatsApp account to the dashboard using a secure QR code scan.',
    instructions: [
      "Go to the WhatsApp Status page from the sidebar menu.",
      "Click the '+ Add Account' button to request a new QR code.",
      "Open WhatsApp on your mobile phone and go to Linked Devices.",
      "Scan the QR code shown on the screen to connect."
    ],
    tip: "To prevent auto-disconnects, open WhatsApp on your mobile phone and connect it to the internet at least once every 14 days.",
  },
  {
    icon: Users,
    color: 'text-emerald-400 bg-emerald-500/10',
    title: 'Step 2: Create a Group List',
    description: 'Group your WhatsApp groups together so you can target them all at once when posting.',
    instructions: [
      "Go to the Audience page from the sidebar menu.",
      "Open the 'Group Lists' tab and click '+ Create Group List'.",
      "Give it a clear name (e.g., 'Marketing Groups' or 'Real Estate Leads').",
      "Select which WhatsApp groups belong in it and click save."
    ],
    tip: "Only groups that your connected WhatsApp account is currently participating in will appear in the selection list.",
  },
  {
    icon: Megaphone,
    color: 'text-amber-400 bg-amber-500/10',
    title: 'Step 3: Schedule your first Campaign',
    description: 'Create announcements, add spin-tax variations, and schedule campaigns.',
    instructions: [
      "Go to the Announcements page and click '+ New Announcement'.",
      "Select your connected WhatsApp number and choose your target Group(s) or Group List.",
      "Upload media files and add text variations to cycle through during posts.",
      "Configure schedule timing (one-time or recurring) and click save."
    ],
    tip: "Use Caption Variations (Spin-tax) and upload multiple media files to prevent WhatsApp from flagging your messages as duplicate spam.",
  },
];

const OnboardingWizard = ({ onClose }: OnboardingWizardProps) => {
  const [stepIndex, setStepIndex] = useState(0);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const step = STEPS[stepIndex];
  const StepIcon = step.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg p-6 relative border border-slate-700/50 shadow-2xl">
        <button
          onClick={() => onClose(true)}
          className="absolute top-4 right-4 text-slate-500 hover:text-white cursor-pointer"
          title="Skip tour"
        >
          <X size={18} />
        </button>

        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${step.color}`}>
          <StepIcon size={24} />
        </div>

        <h2 className="text-lg font-black text-white mb-1.5">{step.title}</h2>
        <p className="text-sm text-slate-400 leading-relaxed mb-4">{step.description}</p>

        {step.instructions.length > 0 && (
          <ol className="space-y-2 list-decimal list-inside text-xs text-slate-300 bg-slate-900/40 p-3 rounded-lg border border-slate-800/40 mb-4">
            {step.instructions.map((inst, i) => (
              <li key={i} className="leading-relaxed pl-1">{inst}</li>
            ))}
          </ol>
        )}

        {step.tip && (
          <div className="p-3 bg-slate-900/40 rounded-lg border border-slate-800 flex items-start gap-2 mb-4">
            <ShieldAlert size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-400 leading-relaxed"><strong className="text-amber-400">Pro Tip:</strong> {step.tip}</p>
          </div>
        )}

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === stepIndex ? 'w-6 bg-primary' : 'w-1.5 bg-slate-700'}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => onClose(true)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-300 cursor-pointer"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-800/60 hover:bg-slate-700 rounded-lg border border-slate-700 cursor-pointer"
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
            {!isLast ? (
              <button
                onClick={() => setStepIndex(i => Math.min(STEPS.length - 1, i + 1))}
                className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-white bg-primary hover:brightness-110 rounded-lg cursor-pointer"
              >
                {isFirst ? 'Get Started' : 'Next'} <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => onClose(true)}
                className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer"
              >
                <Check size={14} /> Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
