import { MessageSquare, Image, Mail, ArrowRight, Zap, Sparkles } from 'lucide-react';
import { motion } from "motion/react";
import { TriggerType } from '../../types/automation';

interface TriggerSelectionProps {
  selectedTrigger: TriggerType | null;
  onTriggerSelect: (trigger: TriggerType) => void;
  onNext: () => void;
  onBack: () => void | Promise<void>;
  isCondensed?: boolean;
}

const triggers = [
  {
    type: 'post_comment' as TriggerType,
    icon: MessageSquare,
    title: 'Post Comment',
    description: 'When someone comments on a post',
    actions: ['Reply to Comment', 'Send Direct Message'],
    color: 'blue',
  },
  {
    type: 'story_reply' as TriggerType,
    icon: Image,
    title: 'Story Reply',
    description: 'When someone replies to your story',
    actions: ['Send Direct Message'],
    color: 'indigo',
  },
  {
    type: 'user_directed_messages' as TriggerType,
    icon: Mail,
    title: 'User Direct Message',
    description: 'When someone sends you a direct message',
    actions: ['Reply to Direct Message'],
    color: 'violet',
  },
];

export default function TriggerSelection({
  selectedTrigger,
  onTriggerSelect,
  onNext,
  onBack,
  isCondensed
}: TriggerSelectionProps) {
  const handleNext = () => {
    if (selectedTrigger) {
      onNext();
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-black text-slate-800 mb-2 font-outfit">
            {isCondensed ? 'Select Trigger Type' : 'Choose Your Event'}
          </h2>
          <p className="text-slate-500 font-medium">
            Select the spark that ignites this automation.
          </p>
        </div>
        {!isCondensed && (
          <div className="bg-amber-50 px-4 py-2 rounded-2xl border border-amber-100 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
            <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Single Trigger</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 gap-5">
        {triggers.map((trigger, index) => {
          const Icon = trigger.icon;
          const isSelected = selectedTrigger === trigger.type;

          return (
            <motion.button
              key={trigger.type}
              whileHover={{ scale: 1.01, y: -2 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onTriggerSelect(trigger.type)}
              className={`w-full text-left p-8 rounded-3xl transition-all relative overflow-hidden group ${isSelected
                ? 'bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl shadow-blue-600/20'
                : 'bg-white/50 border-2 border-slate-100 hover:border-blue-200 hover:bg-white hover:shadow-lg'
                }`}
            >
              {isSelected && (
                <div className="absolute top-0 right-0 p-8 opacity-20 transition-transform group-hover:scale-110">
                  <Sparkles size={60} />
                </div>
              )}

              <div className="flex items-start gap-6 relative z-10">
                <div className={`flex items-center justify-center w-16 h-16 rounded-2xl shadow-inner transition-colors duration-300 ${isSelected ? 'bg-white/20' : 'bg-slate-50 text-blue-500'
                  }`}>
                  <Icon className={`w-8 h-8 ${isSelected ? 'text-white' : 'text-blue-500'}`} />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-[10px] font-black w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${isSelected ? 'bg-white/20 border-white/40' : 'bg-slate-100 border-slate-200 text-slate-500'
                      }`}>
                      {index + 1}
                    </span>
                    <h3 className={`text-xl font-black tracking-tight ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                      {trigger.title}
                    </h3>
                  </div>
                  <p className={`font-medium mb-4 ${isSelected ? 'text-blue-50' : 'text-slate-500'}`}>
                    {trigger.description}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {trigger.actions.map((action) => (
                      <span key={action} className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border transition-colors ${isSelected
                        ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                        : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-white hover:border-slate-200'
                        }`}>
                        {action}
                      </span>
                    ))}
                  </div>
                </div>

                <div className={`self-center p-2 rounded-xl transition-all ${isSelected ? 'bg-white/20' : 'opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0'
                  }`}>
                  <ArrowRight size={24} className={isSelected ? 'text-white' : 'text-blue-500'} />
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="flex justify-between items-center pt-6">
        <button
          onClick={onBack}
          className="px-8 py-3.5 text-slate-500 hover:text-slate-800 font-black text-sm uppercase tracking-widest transition-all"
        >
          {isCondensed ? 'Exit' : 'Back'}
        </button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleNext}
          disabled={!selectedTrigger}
          className="px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-2xl hover:shadow-xl hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-black text-sm uppercase tracking-widest shadow-lg flex items-center gap-3"
        >
          {isCondensed ? 'Set Logic & Actions' : 'Configure logic'} <ArrowRight size={18} />
        </motion.button>
      </div>
    </div>
  );
}
