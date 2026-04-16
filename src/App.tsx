import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { UpgradeModalProvider } from './contexts/UpgradeModalContext';
import { UIStyleProvider, useUIStyle } from './contexts/UIStyleContext';
import AutomationCreate from './components/AutomationCreate';
import AutomationCreateMillennial from './components/AutomationCreate_millennial';
import { TooltipProvider } from './components/ui/tooltip';
import Login from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import Dashboard from './components/Dashboard';
import Automations from './components/Automations';

import MyAccount from './components/MyAccount';
import LeadManager from './components/LeadManager';
import Billing from './components/Billing';
import Pricing from './components/Pricing';
import DeletionStatus from './components/DeletionStatus';
import ResetPassword from './components/ResetPassword';
import UpgradeModal from './components/UpgradeModal';
import CelebrationModal from './components/CelebrationModal';
import PlanBanner from './components/PlanBanner';
import { SubscriptionProvider, useSubscription } from './contexts/SubscriptionContext';
import { PageSkeleton } from './components/ui/PageSkeleton';


function AppContent() {
  const { user, loading } = useAuth();
  const { isPremium, loading: subLoading } = useSubscription();
  const location = useLocation();

  // Public routes — accessible without auth (required by Meta policy)
  if (location.pathname === '/deletion-status' || location.pathname === '/reset-password') {
    return (
      <Routes>
        <Route path="/deletion-status" element={<DeletionStatus />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    );
  }

  if (loading || (user && subLoading)) {
    return <PageSkeleton />;
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

// Preserves query params (like ?instagram_connected=true) when redirecting
function RedirectWithParams({ to }: { to: string }) {
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  return <Navigate to={`${to}${search ? '?' + search : ''}`} replace />;
}

function AuthenticatedApp() {
  const { isPremium } = useSubscription();
  const { uiStyle } = useUIStyle();
  const { darkMode } = useTheme();
  const CreatePage = uiStyle === 'millennial' ? AutomationCreateMillennial : AutomationCreate;
  const isMillennial = uiStyle === 'millennial';

  if (isMillennial) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-2 md:p-3 transition-colors duration-500 ${darkMode ? 'bg-[#0A0A0A]' : 'bg-white'}`}>
        {/* Outer rounded card container */}
        <div className={`w-full max-w-[1600px] h-[calc(100vh-1rem)] md:h-[calc(100vh-1.5rem)] rounded-3xl shadow-2xl flex overflow-hidden relative border-[4px] ring-1 transition-all duration-500 ${darkMode ? 'bg-white border-white/5 ring-white/5' : 'bg-[#0F1117] border-white ring-gray-100'}`}>
          {/* Left Sidebar */}
          <Sidebar millennial />
          <MobileNav />

          {/* Right Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden p-2 md:p-3">
            <div className={`flex-1 rounded-[1.25rem] overflow-hidden shadow-xl transition-all duration-500 border ${darkMode ? 'bg-black border-white/5' : 'bg-white border-transparent'}`}>
              <ErrorBoundary>
                <div className={`h-full overflow-y-auto pb-24 md:pb-0 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/dashboard" element={<Navigate to="/" replace />} />
                    <Route path="/automation" element={<Automations />} />
                    <Route path="/automation/create" element={<CreatePage />} />
                    <Route path="/automation/view/:id" element={<CreatePage readOnly />} />
                    <Route path="/automation/edit/:id" element={<CreatePage />} />
                    <Route path="/lead-manager" element={<LeadManager />} />
                    <Route path="/contacts" element={<Navigate to="/lead-manager" replace />} />
                    <Route path="/billing" element={<Billing />} />
                    <Route path="/account" element={<MyAccount />} />
                    <Route path="/settings" element={<Navigate to="/account" replace />} />
                    <Route path="/connect-accounts" element={<RedirectWithParams to="/account" />} />
                  </Routes>
                </div>
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Gen Z / default layout
  return (
    <div className={`min-h-screen transition-colors duration-500 ${darkMode ? 'bg-black' : 'bg-slate-50'}`}>
      <div className={`${!isPremium ? 'pt-6' : ''}`}>
        <PlanBanner />
        <Sidebar />
        <MobileNav />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1 transition-colors duration-500"><Dashboard /></div>} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/automation" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1 transition-colors duration-500"><Automations /></div>} />
            <Route path="/automation/create" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1 transition-colors duration-500"><CreatePage /></div>} />
            <Route path="/automation/view/:id" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1 transition-colors duration-500"><CreatePage readOnly /></div>} />
            <Route path="/automation/edit/:id" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1 transition-colors duration-500"><CreatePage /></div>} />
            <Route path="/lead-manager" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1 transition-colors duration-500"><LeadManager /></div>} />
            <Route path="/contacts" element={<Navigate to="/lead-manager" replace />} />
            <Route path="/billing" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1 transition-colors duration-500"><Billing /></div>} />
            <Route path="/account" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1 transition-colors duration-500"><MyAccount /></div>} />
            <Route path="/settings" element={<Navigate to="/account" replace />} />
            <Route path="/connect-accounts" element={<RedirectWithParams to="/account" />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </div>
  );
}


import { Toaster } from 'sonner';
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
          <UIStyleProvider>
            <UpgradeModalProvider>
              <BrowserRouter>
                <TooltipProvider>
                  <AppContent />

                  <UpgradeModal />
                  <CelebrationModal />
                  <Toaster richColors position="top-right" />
                </TooltipProvider>
              </BrowserRouter>
            </UpgradeModalProvider>
          </UIStyleProvider>
        </ThemeProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
