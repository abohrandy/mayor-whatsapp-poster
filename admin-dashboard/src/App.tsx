import { useState, useEffect } from 'react';
import { LayoutDashboard, Megaphone, MessageSquare, Settings as SettingsIcon, Bell, User, Users, History, LogOut, ShieldCheck, Sun, Moon, Menu, X, Package, HelpCircle } from 'lucide-react';
import axios from 'axios';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import Announcements from './components/Announcements';
import WhatsAppStatus from './components/WhatsAppStatus';
import Settings from './components/Settings';
import ActivityLogs from './components/ActivityLogs';
import AudienceModule from './components/AudienceModule';
import Login from './components/Login';
import Signup from './components/Signup';
import Subscription from './components/Subscription';
import UserManagement from './components/UserManagement';
import PlanManagement from './components/PlanManagement';
import AdminAIDashboard from './components/AdminAIDashboard';
import JobQueueView from './components/JobQueueView';
import UserGuide from './components/UserGuide';
import OnboardingWizard from './components/OnboardingWizard';
import { Cpu, Layers } from 'lucide-react';
import { useNotifications } from './hooks/useNotifications';

// Setup global axios headers interceptor
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  // Setup local and push notifications listener for mobile app
  useNotifications();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [openNewAnnouncementModal, setOpenNewAnnouncementModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Theme states
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

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

  // Onboarding wizard: auto-shows once for a user until dismissed/completed,
  // and can be restarted on demand from Settings regardless of that state.
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingAutoChecked, setOnboardingAutoChecked] = useState(false);

  useEffect(() => {
    if (user && !user.is_admin && !onboardingAutoChecked) {
      setOnboardingAutoChecked(true);
      if (user.onboarding_enabled && !user.onboarding_completed) {
        setShowOnboarding(true);
      }
    }
  }, [user, onboardingAutoChecked]);

  const closeOnboarding = async () => {
    setShowOnboarding(false);
    try {
      await axios.patch('/api/auth/onboarding', { completed: true });
      setUser((prev: any) => prev ? { ...prev, onboarding_completed: true } : prev);
    } catch (err) {
      console.error('Failed to save onboarding state', err);
    }
  };

  const restartOnboarding = async () => {
    try {
      await axios.patch('/api/auth/onboarding', { completed: false, enabled: true });
      setUser((prev: any) => prev ? { ...prev, onboarding_completed: false, onboarding_enabled: true } : prev);
    } catch (err) {
      console.error('Failed to restart onboarding', err);
    }
    setShowOnboarding(true);
  };

  const setOnboardingEnabled = async (enabled: boolean) => {
    try {
      await axios.patch('/api/auth/onboarding', { enabled });
      setUser((prev: any) => prev ? { ...prev, onboarding_enabled: enabled } : prev);
    } catch (err) {
      console.error('Failed to update onboarding preference', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setActiveTab('dashboard');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return user?.is_admin ? (
          <AdminDashboard setActiveTab={setActiveTab} />
        ) : (
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
      case 'audience':
      case 'audience-lists':
      case 'profiles': return <AudienceModule />;
      case 'activity': return <ActivityLogs />;
      case 'jobs': return <JobQueueView />;
      case 'whatsapp': return <WhatsAppStatus />;
      case 'settings': return (
        <Settings
          user={user}
          onRestartOnboarding={restartOnboarding}
          onToggleOnboardingEnabled={setOnboardingEnabled}
        />
      );
      case 'users': return <UserManagement />;
      case 'plans': return <PlanManagement />;
      case 'ai-control': return <AdminAIDashboard />;
      case 'guide': return <UserGuide />;
      default:
        return user?.is_admin ? (
          <AdminDashboard setActiveTab={setActiveTab} />
        ) : (
          <Dashboard setActiveTab={setActiveTab} />
        );
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'announcements', label: 'Announcements', Icon: Megaphone },
    { id: 'audience', label: 'Audience', Icon: Users },
    { id: 'jobs', label: 'Job Queue', Icon: Layers },
    { id: 'activity', label: 'Activity Logs', Icon: History },
    { id: 'whatsapp', label: 'WhatsApp Status', Icon: MessageSquare },
    { id: 'settings', label: 'Settings', Icon: SettingsIcon },
    { id: 'guide', label: 'User Guide', Icon: HelpCircle },
  ];

  if (user && user.is_admin) {
    navItems.push({ id: 'users', label: 'User Management', Icon: ShieldCheck });
    navItems.push({ id: 'plans', label: 'Subscription Plans', Icon: Package });
    navItems.push({ id: 'ai-control', label: 'AI Control Center', Icon: Cpu });
  }

  const tabLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    announcements: 'Announcements',
    audience: 'Audience Management',
    'audience-lists': 'Audience Lists',
    profiles: 'Audience Lists',
    jobs: 'Job Queue & Telemetry',
    activity: 'Activity Logs',
    whatsapp: 'WhatsApp Status',
    settings: 'Settings',
    users: 'User Management',
    plans: 'Subscription Plans',
    'ai-control': 'AI Control Center',
    guide: 'User Guide',
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

  // 3. Billing subscription lock / Trial Expired lock / Manually-granted access expired
  const isTrialExpired = user.tier === 'trial' && user.trial_ends_at && new Date(user.trial_ends_at) < new Date();
  const isManualAccessExpired = user.manual_expires_at && new Date(user.manual_expires_at) < new Date();
  const isAdmin = user.is_admin;
  if (!isAdmin && (user.subscription_status !== 'active' || isTrialExpired || isManualAccessExpired)) {
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
    <div className="flex min-h-screen bg-background relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-10 md:hidden backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-64 glass-sidebar flex flex-col fixed h-full z-20 transition-transform duration-300 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-6 border-b border-slate-700/50">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
            WhatsApp Group Poster
          </h1>
          <p className="text-xs text-slate-500 mt-1">SaaS Multi-Account Poster</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map(({ id, label, Icon }) => (
            <button
              key={id}
              id={`nav-${id}`}
              onClick={() => {
                setActiveTab(id);
                setIsSidebarOpen(false); // Close sidebar on mobile link select
              }}
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
              {user.is_admin ? (
                <p className="text-[10px] text-green-400 font-bold uppercase tracking-wider">Super Admin</p>
              ) : user.tier === 'trial' ? (
                <p className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">
                  Trial: {(() => {
                    if (!user.trial_ends_at) return '0 days';
                    const diff = new Date(user.trial_ends_at).getTime() - new Date().getTime();
                    return `${Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))} days left`;
                  })()}
                </p>
              ) : (
                <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Plus Member</p>
              )}
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
      <main className="flex-1 ml-0 md:ml-64 p-4 md:p-8 transition-all min-w-0">
        <header className="flex justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="p-2 text-slate-400 hover:text-white glass-card md:hidden cursor-pointer"
              title="Toggle Menu"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h2 className="text-xl md:text-2xl font-bold text-white truncate">{tabLabels[activeTab]}</h2>
          </div>
          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            <button
              id="btn-theme-toggle"
              onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
              className="p-2 text-slate-400 hover:text-white glass-card cursor-pointer"
              title="Toggle Light/Dark Mode"
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <button id="btn-notifications" className="p-2 text-slate-400 hover:text-white glass-card">
              <Bell size={20} />
            </button>
            <div className="h-4 w-px bg-slate-700"></div>
            <button id="btn-admin" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 glass-card">
              <User size={18} />
              <span className="hidden sm:inline">SaaS Panel</span>
            </button>
          </div>
        </header>

        {renderContent()}
      </main>

      {showOnboarding && <OnboardingWizard onClose={closeOnboarding} />}
    </div>
  );
}

export default App;
