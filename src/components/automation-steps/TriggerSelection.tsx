import { MessageSquare, Image, Mail, ChevronRight, Zap } from 'lucide-react';
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

  const handleSelect = (type: TriggerType) => {
    if (readOnly) return;
    onTriggerSelect(type);
    onNext(type); // pass type so parent knows it's selected immediately
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex flex-shrink-0 items-center justify-center text-white shadow-lg shadow-purple-500/30">
          <Zap size={28} className="fill-white" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
            Trigger Configuration
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Choose an event that will start the automation flow
          </p>
        </div>
      </div>

      <div className="h-[1px] bg-slate-100 my-8 w-full"></div>

      <h3 className="text-slate-500 font-semibold mb-4 text-sm">Select trigger type</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {triggers.map((trigger) => {
          const Icon = trigger.icon;
          const isSelected = selectedTrigger === trigger.type;

          return (
            <button
              key={trigger.type}
              onClick={() => handleSelect(trigger.type)}
              disabled={readOnly}
              className={`flex items-center p-4 border rounded-2xl transition-all group ${isSelected
                ? 'border-purple-400 bg-purple-50'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                } ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${trigger.colorFrom} ${trigger.colorTo} flex items-center justify-center text-white mr-4 shadow-md`}>
                <Icon size={24} />
              </div>
              <span className="font-semibold text-slate-700 flex-1 text-left text-sm md:text-base">
                {trigger.title}
              </span>
              <ChevronRight className={`transition-colors ${isSelected ? 'text-purple-500' : 'text-slate-300 group-hover:text-slate-500'}`} />
            </button>
          );
        })}
      </div>

      {readOnly && selectedTrigger && (
        <div className="flex justify-end mt-8">
          <button
            onClick={() => onNext(selectedTrigger)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-md shadow-purple-500/20"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
