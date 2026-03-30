import { useState } from 'react';
import { User, Link2, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../contexts/ThemeContext';
import Settings from './Settings';
import ConnectedAccounts from './ConnectedAccounts';

type TabType = 'connected' | 'settings';

export default function MyAccount() {
  const { darkMode } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('connected');

  const tabs = [
    { id: 'connected', name: 'Connected Accounts', icon: Link2 },
    { id: 'settings', name: 'Profile Settings', icon: SettingsIcon },
  ];

  return (
    <div className={`flex-1 flex flex-col h-full transition-colors duration-500 ${darkMode ? 'bg-black text-white' : 'bg-[#fafbff] text-gray-900'}`}>
      {/* Header Section */}
      <div className={`pt-10 pb-6 border-b transition-colors ${darkMode ? 'border-white/5' : 'border-gray-100'}`}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center gap-4 mb-8">
            <div className={`p-3 rounded-2xl ${darkMode ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-100 shadow-sm'}`}>
              <User className={`w-8 h-8 ${darkMode ? 'text-white' : 'text-blue-600'}`} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">My Account</h1>
              <p className={`text-sm font-medium ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Manage your connections and profile details</p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className={`flex p-1.5 rounded-2xl w-fit transition-colors ${darkMode ? 'bg-white/5 border border-white/10' : 'bg-gray-100/50 border border-gray-100 shadow-inner'}`}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 overflow-hidden ${
                    isActive 
                      ? (darkMode ? 'text-white' : 'text-blue-600') 
                      : (darkMode ? 'text-white/40 hover:text-white/60' : 'text-gray-500 hover:text-gray-700')
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className={`absolute inset-0 shadow-lg ${darkMode ? 'bg-white/10' : 'bg-white'}`}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <Icon className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">{tab.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth">
        <div className="max-w-5xl mx-auto p-6 transition-all">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {activeTab === 'connected' ? (
                <ConnectedAccounts isNested={true} />
              ) : (
                <Settings isNested={true} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
