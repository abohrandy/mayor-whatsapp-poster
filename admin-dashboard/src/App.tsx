import { useState, useEffect } from 'react';
import { LayoutDashboard, Megaphone, MessageSquare, Settings as SettingsIcon, Bell, User, Users, History, LogOut, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import Announcements from './components/Announcements';
import WhatsAppStatus from './components/WhatsAppStatus';
import Settings from './components/Settings';
import ActivityLogs from './components/ActivityLogs';
import PostingProfiles from './components/PostingProfiles';
import Login from './components/Login';
import Signup from './components/Signup';
import Subscription from './components/Subscription';
import UserManagement from './components/UserManagement';

// Setup global axios headers interceptor
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [openNewAnnouncementModal, setOpenNewAnnouncementModal] = useState(false);

  // Authentication & Subscription states
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any | null>(null);
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [checkingAuth, setCheckingAuth] = useState(!!localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      checkCurrentUser();
    }
  }, [token]);

  const checkCurrentUser = async () => {
    try {
      const res = await axios.get('/api/auth/me');
      setUser(res.data.user);
    } catch (err) {
      console.error('Failed to verify token', err);
      handleLogout();
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLoginSuccess = (newToken: string, loggedUser: any) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(loggedUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setActiveTab('dashboard');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return (
        <Dashboard
          setActiveTab={setActiveTab}
          triggerNewAnnouncement={() => {
            setActiveTab('announcements');
            setOpenNewAnnouncementModal(true);
          }}
        />
      );
      case 'announcements': return (
        <Announcements
          openNewModalOnMount={openNewAnnouncementModal}
          setOpenNewModalOnMount={setOpenNewAnnouncementModal}
        />
      );
      case 'profiles': return <PostingProfiles />;
      case 'activity': return <ActivityLogs />;
      case 'whatsapp': return <WhatsAppStatus />;
      case 'settings': return <Settings />;
      case 'users': return <UserManagement />;
      default: return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'announcements', label: 'Announcements', Icon: Megaphone },
    { id: 'profiles', label: 'Posting Profiles', Icon: Users },
    { id: 'activity', label: 'Activity Logs', Icon: History },
    { id: 'whatsapp', label: 'WhatsApp Status', Icon: MessageSquare },
    { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  ];

  if (user && user.is_admin) {
    navItems.push({ id: 'users', label: 'User Management', Icon: ShieldCheck });
  }

  const tabLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    announcements: 'Announcements',
    profiles: 'Posting Profiles',
    activity: 'Activity Logs',
    whatsapp: 'WhatsApp Status',
    settings: 'Settings',
    users: 'User Management',
  };

  // 1. Loading state
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-slate-400 text-sm">Verifying your account...</p>
      </div>
    );
  }

  // 2. Unauthenticated views
  if (!token || !user) {
    if (authView === 'signup') {
      return (
        <Signup
          onSignupSuccess={handleLoginSuccess}
          onNavigateToLogin={() => setAuthView('login')}
        />
      );
    }
    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        onNavigateToSignup={() => setAuthView('signup')}
      />
    );
  }

  // 3. Billing subscription lock
  if (user.subscription_status !== 'active') {
    return (
      <Subscription
        user={user}
        onLogout={handleLogout}
        onSubscriptionSuccess={checkCurrentUser}
      />
    );
  }

  // 4. Authenticated main workspace
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 glass-sidebar flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-slate-700/50">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
            WhatsApp Poster
          </h1>
          <p className="text-xs text-slate-500 mt-1">SaaS Multi-Account Poster</p>
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

        {/* User profile footer with Logout button */}
        <div className="p-4 border-t border-slate-700/50 space-y-3">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/20 border border-slate-700/30">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-white">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div className="truncate flex-1">
              <p className="text-xs font-semibold text-white truncate">{user.email}</p>
              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Premium Member</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 rounded-lg transition-all cursor-pointer"
          >
            <LogOut size={14} /> Log Out
          </button>
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
              SaaS Panel
            </button>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  );
}

export default App;
