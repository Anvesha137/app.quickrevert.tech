import { Zap, Image, Mail, Check, Diamond } from 'lucide-react';
import { TriggerType } from '../../types/automation';

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
    icon: Zap,
    title: 'Post Comment',
    description: 'When someone comments on your post',
    badges: ['Reply to Comment', 'Send DM'],
  },
  {
    type: 'story_reply' as TriggerType,
    icon: Image,
    title: 'Story Reply',
    description: 'When someone replies to your story',
    badges: ['Send DM'],
  },
  {
    type: 'user_directed_messages' as TriggerType,
    icon: Mail,
    title: 'Direct Message',
    description: 'When someone sends you a DM',
    badges: ['Auto Reply'],
  },
];

export default function TriggerSelection({
  selectedTrigger,
  onTriggerSelect,
  onNext,
  readOnly
}: TriggerSelectionProps) {

  const handleSelect = (type: TriggerType) => {
    if (readOnly) return;
    onTriggerSelect(type);
    onNext(type); // pass type so parent knows it's selected immediately
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-8 cursor-pointer" onClick={() => !readOnly && onTriggerSelect(null as any)}>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            Trigger Configuration
          </h2>
          <p className="text-slate-500 text-sm mt-1 flex items-center gap-1">
            Choose what starts this automation <span className="text-slate-300">ⓘ</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {triggers.map((trigger) => {
          const Icon = trigger.icon;
          const isSelected = selectedTrigger === trigger.type;

          return (
            <button
              key={trigger.type}
              onClick={() => handleSelect(trigger.type)}
              disabled={readOnly}
              className={`relative p-5 text-left rounded-3xl transition-all flex flex-col items-start gap-4 border-2 ${isSelected
                  ? 'bg-gradient-to-br from-blue-500 to-purple-600 border-transparent shadow-md shadow-purple-500/20'
                  : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm'
                } ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {/* Top row: Icon and Title */}
              <div className="w-full flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-white text-blue-500' : 'bg-slate-50 text-slate-500'
                  }`}>
                  <Icon size={24} className={isSelected ? 'text-blue-500' : 'text-pink-400'} />
                </div>
                <h3 className={`text-lg font-bold flex-1 ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                  {trigger.title}
                </h3>

                {/* Selection Indicator */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${isSelected ? 'bg-white border-white' : 'border-slate-200'
                  }`}>
                  {isSelected && <Check size={14} className="text-purple-600 stroke-[3]" />}
                </div>
              </div>

              {/* Description */}
              <p className={`text-sm ${isSelected ? 'text-white/90' : 'text-slate-500'}`}>
                {trigger.description}
              </p>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mt-auto pt-2">
                {trigger.badges.map((badge, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-50 text-slate-600'
                      }`}
                  >
                    <Diamond size={10} className={isSelected ? 'text-white/70' : 'text-slate-400'} />
                    {badge}
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
