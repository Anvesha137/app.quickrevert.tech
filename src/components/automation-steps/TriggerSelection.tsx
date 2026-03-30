import { MessageSquare, Image, Mail, ChevronRight, Bot } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { TriggerType } from '../../types/automation';
import { useTheme } from '../../contexts/ThemeContext';
import { useSubscription } from '../../contexts/SubscriptionContext';

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TriggerSelectionProps {
  selectedTrigger: TriggerType | null;
  onTriggerSelect: (trigger: TriggerType) => void;
  onNext: (trigger?: TriggerType) => void;
  onBack: () => void | Promise<void>;
  isCondensed?: boolean;
  readOnly?: boolean;
}

const triggers = [
  {
    type: 'post_comment' as TriggerType,
    icon: MessageSquare,
    title: 'User comments on your post or reel',
    colorFrom: 'from-blue-500',
    colorTo: 'to-purple-600',
  },
  {
    type: 'story_reply' as TriggerType,
    icon: Image,
    title: 'User replies to your story',
    colorFrom: 'from-blue-500',
    colorTo: 'to-purple-600',
  },
  {
    type: 'user_directed_messages' as TriggerType,
    icon: Mail,
    title: 'User sends you a DM',
    colorFrom: 'from-blue-500',
    colorTo: 'to-purple-600',
  },
];

export default function TriggerSelection({
  selectedTrigger,
  onTriggerSelect,
  onNext,
  readOnly
}: TriggerSelectionProps) {
  const { darkMode } = useTheme();
  const { isPremium } = useSubscription();

  const handleSelect = (type: TriggerType) => {
    if (readOnly) return;
    onTriggerSelect(type);
    onNext(type); // pass type so parent knows it's selected immediately
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-4 mb-8">
        <div className={cn(
          "w-14 h-14 rounded-2xl flex flex-shrink-0 items-center justify-center text-white shadow-lg",
          darkMode 
            ? `bg-gradient-to-br ${isPremium ? 'from-indigo-600 to-violet-700 shadow-indigo-500/50' : 'from-blue-500 to-purple-600 shadow-purple-500/50'}` 
            : "bg-gradient-to-br from-blue-500 to-purple-600 shadow-purple-500/30"
        )}>
          <Bot size={28} className="text-white" />
        </div>
        <div>
          <h2 className={cn("text-xl md:text-2xl font-bold tracking-tight transition-colors", darkMode ? "text-white" : "text-slate-800")}>
            Trigger Configuration
          </h2>
          <p className={cn("text-sm mt-1 transition-colors", darkMode ? "text-white/40" : "text-slate-500")}>
            Choose an event that will start the automation flow
          </p>
        </div>
      </div>

      <div className={cn("h-[1px] my-8 w-full transition-colors", darkMode ? "bg-white/10" : "bg-slate-100")}></div>

      <h3 className={cn("font-semibold mb-4 text-sm transition-colors", darkMode ? "text-white/40" : "text-slate-500")}>Select trigger type</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {triggers.map((trigger) => {
          const Icon = trigger.icon;
          const isSelected = selectedTrigger === trigger.type;

          return (
            <button
              key={trigger.type}
              onClick={() => handleSelect(trigger.type)}
              disabled={readOnly}
              className={cn(
                "flex items-center p-4 border rounded-2xl transition-all group",
                isSelected
                  ? (darkMode ? "border-purple-400 bg-white/10" : "border-purple-400 bg-purple-50")
                  : (darkMode ? "border-white/5 bg-transparent hover:border-white/20 hover:bg-white/[0.02]" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"),
                readOnly ? "opacity-70 cursor-not-allowed" : "cursor-pointer"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white mr-4 shadow-md",
                trigger.colorFrom,
                trigger.colorTo
              )}>
                <Icon size={24} />
              </div>
              <span className={cn(
                "font-semibold flex-1 text-left text-sm md:text-base",
                darkMode ? "text-white" : "text-slate-700"
              )}>
                {trigger.title}
              </span>
              <ChevronRight className={cn(
                "transition-colors",
                isSelected ? (darkMode ? "text-white" : "text-purple-500") : (darkMode ? "text-white/20 group-hover:text-white/50" : "text-slate-300 group-hover:text-slate-500")
              )} />
            </button>
          );
        })}
      </div>

      {readOnly && selectedTrigger && (
        <div className="flex justify-end mt-8">
          <button
            onClick={() => onNext(selectedTrigger)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-md",
              darkMode 
                ? `bg-gradient-to-r ${isPremium ? 'from-indigo-600 to-violet-700 shadow-indigo-500/50' : 'from-blue-500 to-purple-600 shadow-purple-500/50'} text-white hover:brightness-110` 
                : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-purple-500/20"
            )}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
