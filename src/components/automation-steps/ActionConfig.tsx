import { useState } from 'react';
import { Plus, X, Sparkles, UserPlus, Send, MessageSquare, Trash2, ChevronDown } from 'lucide-react';
import { TriggerType, Action, ActionType, ReplyToCommentAction, AskToFollowAction, SendDmAction } from '../../types/automation';

interface ActionConfigProps {
  triggerType: TriggerType;
  actions: Action[];
  onActionsChange: (actions: Action[]) => void;
  onSave: () => void;
  onBack: () => void;
  saving: boolean;
}

const getTriggerName = (type: TriggerType): string => {
  switch (type) {
    case 'post_comment':
      return 'Post Comment';
    case 'story_reply':
      return 'Story Reply';
    case 'user_directed_messages':
      return 'User Direct Message';
  }
};

const getAvailableActions = (triggerType: TriggerType): { type: ActionType; name: string; icon: any; description: string }[] => {
  const baseActions = [
    { type: 'send_dm' as ActionType, name: 'Send DM', icon: Send, description: 'Send a direct message to the user' },
  ];

  if (triggerType === 'post_comment') {
    return [
      { type: 'reply_to_comment' as ActionType, name: 'Reply To Comment', icon: MessageSquare, description: 'Reply to the comment automatically' },
      ...baseActions,
    ];
  }

  // Ask to Follow is disabled.
  // Reply to Direct Message is disabled for DM triggers.

  return baseActions;
};

export default function ActionConfig({ triggerType, actions, onActionsChange, onSave, onBack, saving }: ActionConfigProps) {
  const [showActionSelector, setShowActionSelector] = useState(false);
  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(null);

  const availableActions = getAvailableActions(triggerType);

  const addAction = (actionType: ActionType) => {
    let newAction: Action;

    if (actionType === 'reply_to_comment') {
      newAction = {
        type: 'reply_to_comment',
        replyTemplates: [''],
        actionButtons: [],
      } as ReplyToCommentAction;
    } else if (actionType === 'ask_to_follow') {
      // Should not be reachable, but keeping for type safety
      newAction = {
        type: 'ask_to_follow',
        messageTemplate: '',
        followButtonText: '✅ I am following',
      } as AskToFollowAction;
    } else {
      newAction = {
        type: 'send_dm',
        title: 'Hi👋',
        imageUrl: '',
        subtitle: 'Powered By Quickrevert.tech', // Hardcoded subtitle
        messageTemplate: '',
        actionButtons: [],
      } as SendDmAction;
    }

    onActionsChange([...actions, newAction]);
    setEditingActionIndex(actions.length);
    setShowActionSelector(false);
  };

  const updateAction = (index: number, updatedAction: Action) => {
    const newActions = [...actions];
    // Enforce hardcoded subtitle for SendDmAction updates
    if (updatedAction.type === 'send_dm') {
      (updatedAction as SendDmAction).subtitle = 'Powered By Quickrevert.tech';
    }
    newActions[index] = updatedAction;
    onActionsChange(newActions);
  };

  const deleteAction = (index: number) => {
    onActionsChange(actions.filter((_, i) => i !== index));
    if (editingActionIndex === index) {
      setEditingActionIndex(null);
    }
  };

  // addReplyTemplate and removeReplyTemplate removed as we restricted to 1 template

  const updateReplyTemplate = (actionIndex: number, templateIndex: number, value: string) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    const newTemplates = [...action.replyTemplates];
    newTemplates[templateIndex] = value;
    updateAction(actionIndex, {
      ...action,
      replyTemplates: newTemplates,
    });
  };

  const addActionButton = (actionIndex: number) => {
    const action = actions[actionIndex] as SendDmAction;
    updateAction(actionIndex, {
      ...action,
      actionButtons: [...action.actionButtons, { id: Date.now().toString(), text: '', url: '' }],
    });
  };

  const updateActionButton = (actionIndex: number, buttonIndex: number, field: 'text' | 'url' | 'action', value: string) => {
    const action = actions[actionIndex] as SendDmAction;
    const newButtons = [...action.actionButtons];
    newButtons[buttonIndex] = { ...newButtons[buttonIndex], [field]: value };

    if (field === 'action' && value === 'calendar') {
      newButtons[buttonIndex].url = 'calendar';
    }
    if (field === 'action' && value === 'web_url' && newButtons[buttonIndex].url === 'calendar') {
      newButtons[buttonIndex].url = '';
    }
    if (field === 'action' && value === 'postback') {
      newButtons[buttonIndex].url = '';

      const buttonText = newButtons[buttonIndex].text || `Button ${buttonIndex + 1}`;
      const newAction: SendDmAction = {
        type: 'send_dm',
        title: buttonText,
        imageUrl: '',
        subtitle: 'Powered By Quickrevert.tech',
        messageTemplate: '',
        actionButtons: [],
      };

      const updatedSourceAction = { ...action, actionButtons: newButtons };
      const newActionsList = [...actions];
      newActionsList[actionIndex] = updatedSourceAction;
      newActionsList.push(newAction);

      onActionsChange(newActionsList);
      return;
    }

    updateAction(actionIndex, {
      ...action,
      actionButtons: newButtons,
    });
  };

  const removeActionButton = (actionIndex: number, buttonIndex: number) => {
    const action = actions[actionIndex] as SendDmAction;
    updateAction(actionIndex, {
      ...action,
      actionButtons: action.actionButtons.filter((_, i) => i !== buttonIndex),
    });
  };

  // Reply Buttons logic removed

  const getActionName = (action: Action): string => {
    if (action.type === 'reply_to_comment') {
      return 'Reply To Comment';
    } else if (action.type === 'ask_to_follow') {
      return 'Ask To Follow';
    } else {
      return 'Send DM';
    }
  };

  const isActionValid = (action: Action): boolean => {
    if (action.type === 'reply_to_comment') {
      return action.replyTemplates.some(t => t.trim().length > 0);
    } else if (action.type === 'ask_to_follow') {
      return action.messageTemplate.trim().length > 0 && action.followButtonText.trim().length > 0;
    } else {
      const sendDmAction = action as SendDmAction;
      const hasTitle = (sendDmAction.title || '').trim().length > 0;
      return hasTitle;
    }
  };

  const canSave = actions.length > 0 && actions.every(isActionValid);

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-medium text-blue-900">
          <span className="font-semibold">{getTriggerName(triggerType)}</span> Trigger configured - Add actions below
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Configure Actions</h2>
        <p className="text-gray-600">
          Add one or more actions that will execute when the trigger fires
        </p>
      </div>

      {actions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 mb-4">No actions added yet</p>
          <button
            onClick={() => setShowActionSelector(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2 font-medium"
          >
            <Plus size={20} />
            Add Action
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {actions.map((action, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-6 bg-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                    {index + 1}
                  </span>
                  {getActionName(action)}
                </h3>
                <button
                  onClick={() => deleteAction(index)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              {action.type === 'reply_to_comment' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Reply Template <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-3">
                      {(action as ReplyToCommentAction).replyTemplates.map((template, templateIndex) => (
                        <div key={templateIndex} className="flex gap-2">
                          <input
                            type="text"
                            value={template}
                            onChange={(e) => updateReplyTemplate(index, templateIndex, e.target.value)}
                            placeholder="e.g., Check your DMs 👋"
                            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          // If index > 0, we shouldn't render it technically based on requirement, but array might have old data. 
                          // We heavily restricted adding, so this map will usually have 1 item.
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Action Buttons section removed */}
                </div>
              )}

              {/* Ask to Follow Removed */}

              {action.type === 'send_dm' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={(action as SendDmAction).title || ''}
                      onChange={(e) => updateAction(index, { ...action, title: e.target.value } as SendDmAction)}
                      placeholder="Hi👋"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">The title that appears at the top of the message card</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Image URL
                    </label>
                    <input
                      type="url"
                      value={(action as SendDmAction).imageUrl || ''}
                      onChange={(e) => updateAction(index, { ...action, imageUrl: e.target.value } as SendDmAction)}
                      placeholder="https://i.ibb.co/N29QzF6Z/QR-Logo.png"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500">URL of the image to display in the message card</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Subtitle
                    </label>
                    <input
                      type="text"
                      value={(action as SendDmAction).subtitle || "Powered By Quickrevert.tech"}
                      readOnly
                      disabled
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-gray-500">This text cannot be changed.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Action Buttons ({(action as SendDmAction).actionButtons.length}/3)
                    </label>
                    {(action as SendDmAction).actionButtons.length > 0 && (
                      <div className="space-y-3 mb-3">
                        {(action as SendDmAction).actionButtons.map((button, buttonIndex) => (
                          <div key={button.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-medium text-gray-700">Button {buttonIndex + 1}</span>
                              <button
                                onClick={() => removeActionButton(index, buttonIndex)}
                                className="text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <X size={18} />
                              </button>
                            </div>
                            <div className="space-y-3">
                              <input
                                type="text"
                                value={button.text}
                                onChange={(e) => updateActionButton(index, buttonIndex, 'text', e.target.value)}
                                placeholder="Button text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              <div className="relative">
                                <select
                                  value={(button as any).action || (button.url ? 'web_url' : 'postback')}
                                  onChange={(e) => updateActionButton(index, buttonIndex, 'action', e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white pr-10"
                                >
                                  <option value="postback">Reply (Postback)</option>
                                  <option value="web_url">Web URL</option>
                                  <option value="calendar">Book Calendar</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                              </div>
                              {((button as any).action === 'web_url' || (!(button as any).action && button.url && button.url !== 'calendar')) && (
                                <input
                                  type="url"
                                  value={button.url === 'calendar' ? '' : (button.url || '')}
                                  onChange={(e) => updateActionButton(index, buttonIndex, 'url', e.target.value)}
                                  placeholder="https://example.com"
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                              )}
                              {((button as any).action === 'calendar' || (!(button as any).action && button.url === 'calendar')) && (
                                <p className="text-sm text-gray-600 bg-blue-50 p-2 rounded border border-blue-100">
                                  📅 This button will open your calendar booking link
                                </p>
                              )}
                              {((button as any).action === 'postback' || (!(button as any).action && !button.url)) && (
                                <p className="text-sm text-gray-600 bg-blue-50 p-2 rounded border border-blue-100">
                                  💬 This button will send a postback that triggers a reply action in the workflow
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {(action as SendDmAction).actionButtons.length < 3 && (
                      <button
                        onClick={() => addActionButton(index)}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                      >
                        <Sparkles size={16} />
                        Add Action Button
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={() => setShowActionSelector(true)}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            Add Another Action
          </button>
        </div>
      )}

      {showActionSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Choose Action Type</h3>
              <button
                onClick={() => setShowActionSelector(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <p className="text-gray-600 mb-6">
              Available actions for "{getTriggerName(triggerType)}" trigger:
            </p>
            <div className="space-y-3">
              {availableActions.map((actionOption, index) => {
                const Icon = actionOption.icon;
                return (
                  <button
                    key={actionOption.type}
                    onClick={() => addAction(actionOption.type)}
                    className="w-full text-left p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all flex items-start gap-4"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 flex-shrink-0">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-sm font-semibold text-gray-700">
                          {index + 1}
                        </span>
                        <h4 className="font-semibold text-gray-900">{actionOption.name}</h4>
                      </div>
                      <p className="text-sm text-gray-600">{actionOption.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Back
        </button>
        <button
          onClick={onSave}
          disabled={!canSave || saving}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
        >
          {saving ? 'Saving...' : 'Save Automation'}
        </button>
      </div>
    </div>
  );
}