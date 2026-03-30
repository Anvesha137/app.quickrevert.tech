import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../../contexts/ThemeContext';

export default function DayNightToggle() {
  const { darkMode, toggleDarkMode } = useTheme();

  return (
    <div className="flex items-center select-none">
      {/* Main Toggle Capsule */}
      <div
        onClick={toggleDarkMode}
        className={`relative w-[70px] h-[32px] rounded-full cursor-pointer overflow-hidden transition-colors duration-500 border-2
          ${darkMode ? 'bg-[#1a1a2e] border-white/10' : 'bg-[#a0cdff] border-blue-400/20'}`}
      >
        {/* Background Decorative Layer */}
        <AnimatePresence mode="wait">
          {!darkMode ? (
            <motion.div
              key="day-scene"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              {/* Day Sky Elements */}
              <div className="absolute top-2 left-6 w-2 h-2 bg-white/40 rounded-full blur-[1px]" />
              <div className="absolute top-4 left-12 w-3 h-2 bg-white/60 rounded-full blur-[1px]" />
              
              {/* Hills */}
              <div className="absolute bottom-0 left-0 right-0 h-3 bg-[#86b582] rounded-t-[100%]" />
              <div className="absolute bottom-0 -left-4 w-12 h-4 bg-[#95c391] rounded-t-[100%] translate-y-1" />
              
              {/* Tree */}
              <div className="absolute bottom-1 right-2 w-0.5 h-2.5 bg-[#8b5a2b] rounded-full" />
              <div className="absolute bottom-2.5 right-0.5 w-3.5 h-3.5 bg-[#6a9a5a] rounded-full" />
              <div className="absolute bottom-4 right-1.5 w-2 h-2 bg-[#6a9a5a] rounded-full" />
              
              {/* Sun (Glow behind handle) */}
              <div className={`absolute top-1/2 left-4 -translate-y-1/2 w-10 h-10 bg-yellow-200 rounded-full blur-md opacity-50`} />
            </motion.div>
          ) : (
            <motion.div
              key="night-scene"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              {/* Night Sky Elements (Stars) */}
              <div className="absolute top-3 left-4 w-0.5 h-0.5 bg-white rounded-full animate-pulse" />
              <div className="absolute top-2 left-10 w-1 h-1 bg-white/80 rounded-full" />
              <div className="absolute top-6 left-6 w-0.5 h-0.5 bg-white/60 rounded-full animate-pulse" />
              <div className="absolute top-4 left-16 w-0.5 h-0.5 bg-white rounded-full" />
              
              {/* Dark Hills */}
              <div className="absolute bottom-0 left-0 right-0 h-3 bg-[#2d4a3e] rounded-t-[100%]" />
              <div className="absolute bottom-0 -left-4 w-12 h-4 bg-[#3d5a4e] rounded-t-[100%] translate-y-1" />
              
              {/* Dark Tree */}
              <div className="absolute bottom-1 right-2 w-0.5 h-2.5 bg-[#3b2a1b] rounded-full" />
              <div className="absolute bottom-2.5 right-0.5 w-3.5 h-3.5 bg-[#2a4a3e] rounded-full" />
              
              {/* Moon Glow */}
              <div className="absolute top-1/2 right-4 -translate-y-1/2 w-10 h-10 bg-blue-400 rounded-full blur-md opacity-20" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* The Handle (The "Sun" or "Moon") */}
        <motion.div
          animate={{ x: darkMode ? 38 : 4 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="absolute top-[2px] w-[24px] h-[24px] rounded-full bg-white shadow-lg flex items-center justify-center z-10"
        >
          <AnimatePresence mode="wait">
            {!darkMode ? (
              <motion.div
                key="sun"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 90 }}
                className="w-full h-full bg-yellow-400 rounded-full border-4 border-white"
              />
            ) : (
              <motion.div
                key="moon"
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 90 }}
                className="w-full h-full bg-slate-200 rounded-full border-4 border-white relative overflow-hidden"
              >
                {/* Crates */}
                <div className="absolute top-1 left-2 w-1.5 h-1.5 bg-slate-300/60 rounded-full" />
                <div className="absolute bottom-2 right-2 w-2 h-2 bg-slate-300/60 rounded-full" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
