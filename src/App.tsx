import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Automations from './components/Automations';
import AutomationCreate from './components/AutomationCreate';
import ConnectedAccounts from './components/ConnectedAccounts';
import Contacts from './components/Contacts';
import ActivityLog from './components/ActivityLog';
import Billing from './components/Billing';
import Settings from './components/Settings';
import Login from './components/Login';

function AppContent() {
  const { user, loading } = useAuth();

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <Routes>
        <Route path="/" element={<div className="ml-64 flex-1"><Dashboard /></div>} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/automation" element={<div className="ml-64 flex-1"><Automations /></div>} />
        <Route path="/automation/create" element={<div className="ml-64 flex-1"><AutomationCreate /></div>} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/activity" element={<ActivityLog />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/connect-accounts" element={<div className="ml-64 flex-1"><ConnectedAccounts /></div>} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
