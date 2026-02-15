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

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <MobileNav />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<div className="ml-0 md:ml-64 pb-20 md:pb-0 flex-1"><Dashboard /></div>} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/automation" element={<div className="ml-0 md:ml-64 pb-20 md:pb-0 flex-1"><Automations /></div>} />
          <Route path="/automation/create" element={<div className="ml-0 md:ml-64 pb-20 md:pb-0 flex-1"><AutomationCreate /></div>} />
          <Route path="/contacts" element={<Contacts />} />

          <Route path="/billing" element={<Billing />} />
          <Route path="/connect-accounts" element={<div className="ml-0 md:ml-64 pb-20 md:pb-0 flex-1"><ConnectedAccounts /></div>} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </ErrorBoundary>
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
      <ThemeProvider>
        <UpgradeModalProvider>
          <BrowserRouter>
            <AppContent />
            <UpgradeModal />
            <CelebrationModal />
          </BrowserRouter>
        </UpgradeModalProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
