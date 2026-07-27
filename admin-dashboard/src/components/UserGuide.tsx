import { useState } from 'react';
import { HelpCircle, MessageSquare, Users, Megaphone, ShieldAlert, PlayCircle, BookOpen } from 'lucide-react';

const UserGuide = () => {
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({
    1: false,
    2: false,
    3: false,
  });

  const toggleStep = (stepId: number) => {
    setCompletedSteps(prev => ({
      ...prev,
      [stepId]: !prev[stepId]
    }));
  };

  const steps = [
    {
      id: 1,
      title: "Step 1: Link your WhatsApp Account",
      icon: MessageSquare,
      color: "text-indigo-400 bg-indigo-500/10",
      description: "Link your WhatsApp account to the dashboard using a secure QR code scan.",
      instructions: [
        "Go to the WhatsApp Status page from the sidebar menu.",
        "Click the '+ Add Account' button to request a new QR code.",
        "Open WhatsApp on your mobile phone and go to Linked Devices.",
        "Scan the QR code shown on the screen to connect."
      ],
      tip: "To prevent auto-disconnects, open WhatsApp on your mobile phone and connect it to the internet at least once every 14 days."
    },
    {
      id: 2,
      title: "Step 2: Create an Audience List",
      icon: Users,
      color: "text-emerald-400 bg-emerald-500/10",
      description: "Group your WhatsApp target groups under a single audience list for quick scheduling.",
      instructions: [
        "Go to the Audience Lists page.",
        "Click the '+ Add Audience List' button.",
        "Provide a clear name (e.g., 'Real Estate Groups' or 'Marketing List').",
        "Select the groups you want to associate with this audience list and click save."
      ],
      tip: "Only groups that your connected WhatsApp account is currently participating in will appear in the selection list."
    },
    {
      id: 3,
      title: "Step 3: Schedule your first Campaign",
      icon: Megaphone,
      color: "text-amber-400 bg-amber-500/10",
      description: "Create announcements, add spin-tax variations, and schedule campaigns.",
      instructions: [
        "Go to the Announcements page and click '+ New Announcement'.",
        "Select your connected WhatsApp number and choose your Audience List.",
        "Upload media files and add text variations to cycle through during posts.",
        "Configure schedule timing (one-time or recurring) and click save."
      ],
      tip: "Use Caption Variations (Spin-tax) and upload multiple media files to prevent WhatsApp from flagging your messages as duplicate spam."
    }
  ];

  return (
    <div className="space-y-8">
      {/* Title Panel */}
      <div className="glass-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <BookOpen className="text-primary" /> Quick Start Tutorial
          </h2>
          <p className="text-sm text-slate-400">Follow this simple step-by-step walkthrough to get started with the poster app.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs font-bold text-primary">
          <HelpCircle size={14} /> Guide Active
        </div>
      </div>

      {/* Step Progress Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {steps.map(step => {
          const StepIcon = step.icon;
          const isDone = completedSteps[step.id];

          return (
            <div 
              key={step.id} 
              className={`glass-card p-6 flex flex-col justify-between border transition-all ${
                isDone ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800'
              }`}
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className={`p-2.5 rounded-xl ${step.color}`}>
                    <StepIcon size={20} />
                  </div>
                  <button 
                    onClick={() => toggleStep(step.id)}
                    className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded cursor-pointer transition-all border ${
                      isDone 
                        ? 'bg-emerald-500 text-white border-emerald-600' 
                        : 'bg-slate-800/50 hover:bg-slate-700 text-slate-400 border-slate-700'
                    }`}
                  >
                    {isDone ? '✓ Completed' : 'Mark Done'}
                  </button>
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{step.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">{step.description}</p>
                </div>
                <ol className="space-y-2 list-decimal list-inside text-xs text-slate-300 bg-slate-900/30 p-3 rounded-lg border border-slate-800/40">
                  {step.instructions.map((inst, index) => (
                    <li key={index} className="leading-relaxed pl-1">{inst}</li>
                  ))}
                </ol>
              </div>

              {step.tip && (
                <div className="mt-4 p-3 bg-slate-900/40 rounded-lg border border-slate-800 flex items-start gap-2">
                  <ShieldAlert size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-slate-400 leading-relaxed"><strong className="text-amber-400">Pro Tip:</strong> {step.tip}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Best Practices Section */}
      <div className="glass-card p-6">
        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
          <PlayCircle size={20} className="text-primary" /> Anti-Spam Best Practices (Avoid Account Bans)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300">
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold">1</div>
              <div>
                <h4 className="font-bold text-white mb-0.5">Use Caption Spin-tax</h4>
                <p className="text-slate-400 leading-relaxed">Always create at least 2 or 3 caption variations for recurring posts. This rotates your text copy so WhatsApp’s filters don't flag you for sending duplicate automated messages.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold">2</div>
              <div>
                <h4 className="font-bold text-white mb-0.5">Configure Send Delays</h4>
                <p className="text-slate-400 leading-relaxed">Go to the **Settings** page and set a spacing delay (we recommend 5 to 10 seconds) between group messages to emulate human pacing.</p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold">3</div>
              <div>
                <h4 className="font-bold text-white mb-0.5">Keep Your Mobile Phone Connected</h4>
                <p className="text-slate-400 leading-relaxed">WhatsApp requires the primary mobile phone where your WhatsApp account is logged in to connect to the internet and open WhatsApp occasionally (at least once every 14 days).</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold">4</div>
              <div>
                <h4 className="font-bold text-white mb-0.5">Stagger Scheduling</h4>
                <p className="text-slate-400 leading-relaxed">Avoid scheduling multiple campaigns to run simultaneously. Spread them out to ensure smooth, uninterrupted deliveries.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserGuide;
