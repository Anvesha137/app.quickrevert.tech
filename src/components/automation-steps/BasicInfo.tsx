import { motion } from "motion/react";

interface BasicInfoProps {
  name: string;
  onNameChange: (name: string) => void;
  onNext: () => void;
}

export default function BasicInfo({ name, onNameChange, onNext }: BasicInfoProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onNext();
    }
  };

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-black text-slate-800 mb-2">Automation Name</h2>
        <p className="text-slate-500 font-medium">
          Give your strategy a clear name to identify its purpose.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-3">
          <label htmlFor="name" className="block text-sm font-black text-slate-700 uppercase tracking-widest pl-1">
            Name your creation <span className="text-blue-500 font-black">*</span>
          </label>
          <div className="relative group">
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., Smart Comment Handler"
              className="w-full px-6 py-4 border-2 border-slate-100 bg-white/50 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-lg font-bold text-slate-800 placeholder-slate-300 transition-all shadow-sm hover:bg-white"
              required
              autoFocus
            />
          </div>
        </div>

        <div className="flex justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={!name.trim()}
            className="px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl hover:shadow-xl hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-black text-sm uppercase tracking-widest shadow-lg"
          >
            Design Trigger
          </motion.button>
        </div>
      </form>
    </div>
  );
}
