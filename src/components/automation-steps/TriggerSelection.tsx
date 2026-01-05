import { MessageSquare, Image, Mail } from 'lucide-react';
import { TriggerType } from '../../types/automation';

interface TriggerSelectionProps {
  selectedTrigger: TriggerType | null;
  onTriggerSelect: (trigger: TriggerType) => void;
  onNext: () => void;
  onBack: () => void;
}

const triggers = [
  {
    type: 'post_comment' as TriggerType,
    icon: MessageSquare,
    title: 'Post Comment',
    description: 'When someone comments on a post',
    actions: ['Reply to Comment', 'Ask to Follow', 'Send Direct Message'],
  },
  {
    type: 'story_reply' as TriggerType,
    icon: Image,
    title: 'Story Reply',
    description: 'When someone replies to your story',
    actions: ['Ask to Follow', 'Send Direct Message'],
  },
  {
    type: 'user_directed_messages' as TriggerType,
    icon: Mail,
    title: 'User Direct Message',
    description: 'When someone sends you a direct message',
    actions: ['Ask to Follow', 'Reply to Direct Message'],
  },
];

export default function TriggerSelection({
  selectedTrigger,
  onTriggerSelect,
  onNext,
  onBack,
}: TriggerSelectionProps) {
  const handleNext = () => {
    if (selectedTrigger) {
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Trigger: What starts the automation</h2>
        <p className="text-gray-600">
          Choose Your Trigger
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Select what event will start your automation. You can only have one trigger per automation.
        </p>
      </div>

      <div className="space-y-4">
        {triggers.map((trigger, index) => {
          const Icon = trigger.icon;
          const isSelected = selectedTrigger === trigger.type;

          return (
            <button
              key={trigger.type}
              onClick={() => onTriggerSelect(trigger.type)}
              className={`w-full text-left p-6 border-2 rounded-xl transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 flex-shrink-0">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-sm font-semibold text-gray-700">
                      {index + 1}
                    </span>
                    <h3 className="text-lg font-semibold text-gray-900">{trigger.title}</h3>
                  </div>
                  <p className="text-gray-600 mb-3">{trigger.description}</p>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Available actions:</p>
                    <ul className="space-y-1">
                      {trigger.actions.map((action) => (
                        <li key={action} className="text-sm text-gray-600 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!selectedTrigger}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
