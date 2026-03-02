import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { UpgradeModalProvider } from './contexts/UpgradeModalContext';
import { SubscriptionProvider, useSubscription } from './contexts/SubscriptionContext';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './components/Login';
import { Toaster } from 'sonner';
import { isSupabaseConfigured } from './lib/supabase';

// Lazy load heavy components
const Dashboard = lazy(() => import('./components/Dashboard'));
const Automations = lazy(() => import('./components/Automations'));
const AutomationCreate = lazy(() => import('./components/AutomationCreate'));
const ConnectedAccounts = lazy(() => import('./components/ConnectedAccounts'));
const Contacts = lazy(() => import('./components/Contacts'));
const Billing = lazy(() => import('./components/Billing'));
const Settings = lazy(() => import('./components/Settings'));
const Pricing = lazy(() => import('./components/Pricing'));
const UpgradeModal = lazy(() => import('./components/UpgradeModal'));
const CelebrationModal = lazy(() => import('./components/CelebrationModal'));
const PlanBanner = lazy(() => import('./components/PlanBanner'));
const Sidebar = lazy(() => import('./components/Sidebar'));
const MobileNav = lazy(() => import('./components/MobileNav'));

// Lightweight loading component
const PageLoader = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-gray-600 font-medium tracking-tight">Loading...</p>
    </div>
  </div>
);


function AppContent() {
  const { user, loading } = useAuth();
  const { isPremium, loading: subLoading } = useSubscription();
  const location = useLocation();

  if (loading || (user && subLoading)) {
    return <PageLoader />;
  }

  if (!user) {
    return <Login />;
  }

  // Standalone pages (no sidebar)
  if (location.pathname === '/pricing') {
    // Premium users should never see the pricing page — send them to dashboard
    if (isPremium) {
      return <Navigate to="/" replace />;
    }
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
    <div className="min-h-screen bg-slate-50 font-outfit">
      <div className={`transition-all duration-300 ${!isPremium ? 'pt-6' : ''}`}>
        <PlanBanner />
        <Sidebar />
        <MobileNav />
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1"><Dashboard /></div>} />
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/automation" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1"><Automations /></div>} />
              <Route path="/automation/create" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1"><AutomationCreate /></div>} />
              <Route path="/automation/view/:id" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1"><AutomationCreate readOnly /></div>} />
              <Route path="/automation/edit/:id" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1"><AutomationCreate /></div>} />
              <Route path="/contacts" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1"><Contacts /></div>} />
              <Route path="/billing" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1"><Billing /></div>} />
              <Route path="/connect-accounts" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1"><ConnectedAccounts /></div>} />
              <Route path="/settings" element={<div className="ml-0 md:ml-80 pb-20 md:pb-0 flex-1"><Settings /></div>} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}



function App() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-outfit">
        <div className="max-w-md w-full bg-white rounded-[2rem] shadow-xl p-8 border border-slate-100">
          <div className="flex items-center justify-center w-16 h-16 bg-red-50 rounded-2xl mx-auto mb-6">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-center text-slate-900 mb-3 tracking-tight">Configuration Error</h2>
          <p className="text-slate-500 text-center mb-8 font-medium">
            The application is missing required Supabase configuration.
          </p>
          <div className="bg-slate-50 rounded-2xl p-6 text-sm text-slate-700 mb-8 border border-slate-100">
            <p className="font-bold text-slate-900 mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Missing Environment Variables:
            </p>
            <ul className="space-y-2 font-mono text-xs pl-3.5">
              <li className="flex items-center gap-2 text-red-600 bg-red-50/50 py-1 px-2 rounded-lg border border-red-100 w-fit">VITE_SUPABASE_URL</li>
              <li className="flex items-center gap-2 text-red-600 bg-red-50/50 py-1 px-2 rounded-lg border border-red-100 w-fit">VITE_SUPABASE_ANON_KEY</li>
            </ul>
          </div>
          <p className="text-[10px] text-slate-400 text-center uppercase font-bold tracking-widest">
            Check your .env file or deployment config
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
              <Suspense fallback={<PageLoader />}>
                <AppContent />
                <UpgradeModal />
                <CelebrationModal />
              </Suspense>
              <Toaster richColors position="top-right" />
            </BrowserRouter>
          </UpgradeModalProvider>
        </ThemeProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
