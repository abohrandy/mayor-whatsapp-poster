import { useState } from 'react';
import { LayoutDashboard, Megaphone, MessageSquare, Settings as SettingsIcon, Bell, User, History } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Announcements from './components/Announcements';
import WhatsAppStatus from './components/WhatsAppStatus';
import Settings from './components/Settings';
import ActivityLogs from './components/ActivityLogs';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard setActiveTab={setActiveTab} />;
      case 'announcements': return <Announcements />;
      case 'activity': return <ActivityLogs />;
      case 'whatsapp': return <WhatsAppStatus />;
      case 'settings': return <Settings />;
      default: return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'announcements', label: 'Announcements', Icon: Megaphone },
    { id: 'activity', label: 'Activity Logs', Icon: History },
    { id: 'whatsapp', label: 'WhatsApp Status', Icon: MessageSquare },
    { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  ];

  const tabLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    announcements: 'Announcements',
    activity: 'Activity Logs',
    whatsapp: 'WhatsApp Status',
    settings: 'Settings',
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 glass-sidebar flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-slate-700/50">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
            Mayor Poster
          </h1>
          <p className="text-xs text-slate-500 mt-1">WhatsApp Announcements</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map(({ id, label, Icon }) => (
            <button
              key={id}
              id={`nav-${id}`}
              onClick={() => setActiveTab(id)}
              className={`w-full nav-link ${activeTab === id ? 'active' : ''}`}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700/50">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold">
              MP
            </div>
            <div>
              <p className="text-sm font-medium">Admin User</p>
              <p className="text-xs text-slate-500">Administrator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        <header className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-white">{tabLabels[activeTab]}</h2>
          <div className="flex items-center gap-4">
            <button id="btn-notifications" className="p-2 text-slate-400 hover:text-white glass-card">
              <Bell size={20} />
            </button>
            <div className="h-4 w-px bg-slate-700"></div>
            <button id="btn-admin" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 glass-card">
              <User size={18} />
              Admin
            </button>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  );
}

export default App;
