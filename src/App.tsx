import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { UpgradeModalProvider } from './contexts/UpgradeModalContext';
import Login from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import Dashboard from './components/Dashboard';
import Automations from './components/Automations';
import AutomationCreate from './components/AutomationCreate';
import ConnectedAccounts from './components/ConnectedAccounts';
import Contacts from './components/Contacts';
import Billing from './components/Billing';
import Settings from './components/Settings';
import Pricing from './components/Pricing';
import UpgradeModal from './components/UpgradeModal';
import CelebrationModal from './components/CelebrationModal';
import { Search, Bell } from 'lucide-react';
import PlanBanner from './components/PlanBanner';
import { SubscriptionProvider, useSubscription } from './contexts/SubscriptionContext';


function AppContent() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Standalone pages (no sidebar)
  if (location.pathname === '/pricing') {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/pricing" element={<Pricing />} />
        </Routes>
      </ErrorBoundary>
    );
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { isPremium } = useSubscription();

  return (
    <div className="min-h-screen bg-gray-50 flex font-outfit">
      {/* Sidebar */}
      <div className="hidden md:flex flex-col w-64 flex-shrink-0 p-4 h-screen sticky top-0">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="bg-white/70 backdrop-blur-md border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-40">
          <div className="hidden sm:block">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">QuickRevert</h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative hidden lg:block">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Search analytics..."
                className="pl-12 pr-6 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-300 w-64 transition-all"
              />
            </div>

            <div className="flex items-center gap-3">
              <button className="relative w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center hover:bg-gray-100 transition-all group">
                <Bell size={18} className="text-gray-500 group-hover:rotate-12 transition-transform" />
                <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-rose-500 border-2 border-white rounded-full" />
              </button>

              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-400 to-indigo-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-black cursor-pointer transform hover:scale-105 transition-transform">
                AR
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-8">
          <div className={`transition-all duration-300 ${!isPremium ? 'pt-2' : ''}`}>
            <PlanBanner />
            <MobileNav />
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/automation" element={<Automations />} />
                <Route path="/automation/create" element={<AutomationCreate />} />
                <Route path="/automation/edit/:id" element={<AutomationCreate />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/connect-accounts" element={<ConnectedAccounts />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}


import { isSupabaseConfigured } from './lib/supabase';

function App() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-center text-gray-900 mb-2">Configuration Error</h2>
          <p className="text-gray-600 text-center mb-6">
            The application is missing required Supabase configuration.
          </p>
          <div className="bg-gray-50 rounded p-4 text-sm text-gray-700 mb-6">
            <p className="font-semibold mb-2">Missing Environment Variables:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>VITE_SUPABASE_URL</li>
              <li>VITE_SUPABASE_ANON_KEY</li>
            </ul>
          </div>
          <p className="text-xs text-gray-500 text-center">
            If you are deploying this app, verify that these variables are set in your deployment configuration (Build Arguments for Docker/Static sites).
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <ThemeProvider>
          <UpgradeModalProvider>
            <BrowserRouter>
              <AppContent />
              <UpgradeModal />
              <CelebrationModal />
            </BrowserRouter>
          </UpgradeModalProvider>
        </ThemeProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
