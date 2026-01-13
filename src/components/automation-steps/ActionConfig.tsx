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
    { type: 'ask_to_follow' as ActionType, name: 'Ask To Follow', icon: UserPlus, description: 'Encourage users to follow your account' },
    { type: 'send_dm' as ActionType, name: 'Send DM', icon: Send, description: 'Send a direct message to the user' },
  ];

  if (triggerType === 'post_comment') {
    return [
      { type: 'reply_to_comment' as ActionType, name: 'Reply To Comment', icon: MessageSquare, description: 'Reply to the comment automatically' },
      ...baseActions,
    ];
  } else if (triggerType === 'user_directed_messages') {
    return [
      ...baseActions,
      { type: 'reply_to_comment' as ActionType, name: 'Reply to Direct Message', icon: MessageSquare, description: 'Reply to the direct message' },
    ];
  }

  return baseActions;
};

export default function ActionConfig({ triggerType, actions, onActionsChange, onSave, onBack, saving }: ActionConfigProps) {
  const [showActionSelector, setShowActionSelector] = useState(false);
  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(null);

  const availableActions = getAvailableActions(triggerType);

  const addAction = (actionType: ActionType) => {
    let newAction: Action;

    if (actionType === 'reply_to_comment') {
      // For "Reply to Direct Message" (user_directed_messages), use the new format
      if (triggerType === 'user_directed_messages') {
        newAction = {
          type: 'reply_to_comment',
          title: 'Hi👋', // Default title since it's required
          imageUrl: '',
          subtitle: '',
          replyTemplates: [], // Keep empty for DM replies
          actionButtons: [],
        } as ReplyToCommentAction;
      } else {
        // For regular comment replies, use the old format
        newAction = {
          type: 'reply_to_comment',
          replyTemplates: [''],
          actionButtons: [],
        } as ReplyToCommentAction;
      }
    } else if (actionType === 'ask_to_follow') {
      newAction = {
        type: 'ask_to_follow',
        messageTemplate: '',
        followButtonText: '✅ I am following',
      } as AskToFollowAction;
    } else {
      newAction = {
        type: 'send_dm',
        title: 'Hi👋', // Default title since it's required
        imageUrl: '',
        subtitle: '',
        messageTemplate: '', // Keep for backward compatibility
        actionButtons: [],
      } as SendDmAction;
    }

    onActionsChange([...actions, newAction]);
    setEditingActionIndex(actions.length);
    setShowActionSelector(false);
  };

  const updateAction = (index: number, updatedAction: Action) => {
    const newActions = [...actions];
    newActions[index] = updatedAction;
    onActionsChange(newActions);
  };

  const deleteAction = (index: number) => {
    onActionsChange(actions.filter((_, i) => i !== index));
    if (editingActionIndex === index) {
      setEditingActionIndex(null);
    }
  };

  const addReplyTemplate = (index: number) => {
    const action = actions[index] as ReplyToCommentAction;
    updateAction(index, {
      ...action,
      replyTemplates: [...action.replyTemplates, ''],
    });
  };

  const updateReplyTemplate = (actionIndex: number, templateIndex: number, value: string) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    const newTemplates = [...action.replyTemplates];
    newTemplates[templateIndex] = value;
    updateAction(actionIndex, {
      ...action,
      replyTemplates: newTemplates,
    });
  };

  const removeReplyTemplate = (actionIndex: number, templateIndex: number) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    updateAction(actionIndex, {
      ...action,
      replyTemplates: action.replyTemplates.filter((_, i) => i !== templateIndex),
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
    // If action is changed to calendar, set url to 'calendar'
    if (field === 'action' && value === 'calendar') {
      newButtons[buttonIndex].url = 'calendar';
    }
    // If action is changed to web_url, clear url if it was 'calendar'
    if (field === 'action' && value === 'web_url' && newButtons[buttonIndex].url === 'calendar') {
      newButtons[buttonIndex].url = '';
    }
    // If action is changed to postback, clear url
    if (field === 'action' && value === 'postback') {
      newButtons[buttonIndex].url = '';
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

  const addReplyButton = (actionIndex: number) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    const newButton = { id: Date.now().toString(), text: '', url: '' };
    const currentButtons = action.actionButtons || [];
    updateAction(actionIndex, {
      ...action,
      actionButtons: [...currentButtons, newButton],
    });
  };

  const updateReplyButton = (actionIndex: number, buttonIndex: number, field: 'text' | 'url', value: string) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    const currentButtons = action.actionButtons || [];
    const newButtons = [...currentButtons];
    newButtons[buttonIndex] = { ...newButtons[buttonIndex], [field]: value };
    updateAction(actionIndex, {
      ...action,
      actionButtons: newButtons,
    });
  };

  const removeReplyButton = (actionIndex: number, buttonIndex: number) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    const currentButtons = action.actionButtons || [];
    updateAction(actionIndex, {
      ...action,
      actionButtons: currentButtons.filter((_, i) => i !== buttonIndex),
    });
  };

  const getActionName = (action: Action): string => {
    if (action.type === 'reply_to_comment') {
      return triggerType === 'user_directed_messages' ? 'Reply to Direct Message' : 'Reply To Comment';
    } else if (action.type === 'ask_to_follow') {
      return 'Ask To Follow';
    } else {
      return 'Send DM';
    }
  };

  const isActionValid = (action: Action): boolean => {
    if (action.type === 'reply_to_comment') {
      // For "Reply to Direct Message", require title (like SendDmAction)
      if (triggerType === 'user_directed_messages') {
        return (action.title || '').trim().length > 0;
      }
      // For regular comment replies, require at least one reply template
      return action.replyTemplates.some(t => t.trim().length > 0);
    } else if (action.type === 'ask_to_follow') {
      return action.messageTemplate.trim().length > 0 && action.followButtonText.trim().length > 0;
    } else {
      const sendDmAction = action as SendDmAction;
      // Title is required
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
                  {triggerType === 'user_directed_messages' ? (
                    // New format for "Reply to Direct Message"
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Title <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={(action as ReplyToCommentAction).title || ''}
                          onChange={(e) => updateAction(index, { ...action, title: e.target.value } as ReplyToCommentAction)}
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
                          value={(action as ReplyToCommentAction).imageUrl || ''}
                          onChange={(e) => updateAction(index, { ...action, imageUrl: e.target.value } as ReplyToCommentAction)}
                          placeholder="https://i.ibb.co/N29QzF6Z/QR-Logo.png"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="mt-1 text-xs text-gray-500">URL of the image to display in the message card (optional)</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Subheading
                        </label>
                        <textarea
                          value={(action as ReplyToCommentAction).subtitle || ''}
                          onChange={(e) => updateAction(index, { ...action, subtitle: e.target.value } as ReplyToCommentAction)}
                          placeholder="Thank you for reaching out! We've received your enquiry and one of our team members will get back to you soon."
                          rows={4}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        />
                        <p className="mt-1 text-xs text-gray-500">The main message text that appears below the title (optional)</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Action Buttons ({((action as ReplyToCommentAction).actionButtons || []).length}/3)
                        </label>
                        {(action as ReplyToCommentAction).actionButtons && (action as ReplyToCommentAction).actionButtons!.length > 0 && (
                          <div className="space-y-3 mb-3">
                            {(action as ReplyToCommentAction).actionButtons!.map((button, buttonIndex) => (
                              <div key={button.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium text-gray-700">Button {buttonIndex + 1}</span>
                                  <button
                                    onClick={() => removeReplyButton(index, buttonIndex)}
                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                  >
                                    <X size={18} />
                                  </button>
                                </div>
                                <div className="space-y-3">
                                  <input
                                    type="text"
                                    value={button.text}
                                    onChange={(e) => updateReplyButton(index, buttonIndex, 'text', e.target.value)}
                                    placeholder="Button text"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  />
                                  {button.url ? (
                                    <>
                                      <input
                                        type="url"
                                        value={button.url === 'calendar' ? '' : (button.url || '')}
                                        onChange={(e) => updateReplyButton(index, buttonIndex, 'url', e.target.value)}
                                        placeholder="https://example.com"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      />
                                      <p className="text-sm text-gray-600 bg-blue-50 p-2 rounded border border-blue-100">
                                        🔗 This button will open a web URL
                                      </p>
                                    </>
                                  ) : (
                                    <p className="text-sm text-gray-600 bg-blue-50 p-2 rounded border border-blue-100">
                                      💬 This button will send a postback that triggers a reply action in the workflow
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {(action as ReplyToCommentAction).actionButtons && (action as ReplyToCommentAction).actionButtons!.length < 3 && (
                          <button
                            onClick={() => addReplyButton(index)}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                          >
                            <Sparkles size={16} />
                            Add Action Button
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    // Old format for regular comment replies
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Reply Templates (Random Selection) <span className="text-red-500">*</span>
                        </label>
                        <p className="text-sm text-gray-600 mb-3">
                          I will choose one reply randomly to keep the comments more natural and engaging.
                        </p>
                        <div className="space-y-3">
                          {(action as ReplyToCommentAction).replyTemplates.map((template, templateIndex) => (
                            <div key={templateIndex} className="flex gap-2">
                              <input
                                type="text"
                                value={template}
                                onChange={(e) => updateReplyTemplate(index, templateIndex, e.target.value)}
                                placeholder="e.g., Check your DMs 👋"
                                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              {(action as ReplyToCommentAction).replyTemplates.length > 1 && (
                                <button
                                  onClick={() => removeReplyTemplate(index, templateIndex)}
                                  className="px-3 py-2 text-gray-500 hover:text-red-600 transition-colors"
                                >
                                  <X size={20} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => addReplyTemplate(index)}
                          className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                        >
                          <Plus size={16} />
                          Add Another Reply
                        </button>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Action Buttons ({((action as ReplyToCommentAction).actionButtons || []).length}/3)
                        </label>
                        {(action as ReplyToCommentAction).actionButtons && (action as ReplyToCommentAction).actionButtons!.length > 0 && (
                          <div className="space-y-3 mb-3">
                            {(action as ReplyToCommentAction).actionButtons!.map((button, buttonIndex) => (
                              <div key={button.id} className="p-4 bg-gray-50 rounded-lg">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-medium text-gray-700">Button {buttonIndex + 1}</span>
                                  <button
                                    onClick={() => removeReplyButton(index, buttonIndex)}
                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                  >
                                    <X size={18} />
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    value={button.text}
                                    onChange={(e) => updateReplyButton(index, buttonIndex, 'text', e.target.value)}
                                    placeholder="Button text"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  />
                                  <input
                                    type="url"
                                    value={button.url || ''}
                                    onChange={(e) => updateReplyButton(index, buttonIndex, 'url', e.target.value)}
                                    placeholder="Button URL (optional)"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {(action as ReplyToCommentAction).actionButtons && (action as ReplyToCommentAction).actionButtons!.length < 3 && (
                          <button
                            onClick={() => addReplyButton(index)}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                          >
                            <Sparkles size={16} />
                            Add Action Button
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {action.type === 'ask_to_follow' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Message Template <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={(action as AskToFollowAction).messageTemplate}
                      onChange={(e) => updateAction(index, { ...action, messageTemplate: e.target.value } as AskToFollowAction)}
                      placeholder="Follow me for exciting offers and exclusive content! 🚀"
                      rows={3}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Follow Button Text <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={(action as AskToFollowAction).followButtonText}
                      onChange={(e) => updateAction(index, { ...action, followButtonText: e.target.value } as AskToFollowAction)}
                      placeholder="✅ I am following"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    This action encourages users to follow your account.
                  </p>
                </div>
              )}

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
                    <textarea
                      value={(action as SendDmAction).subtitle || (action as SendDmAction).messageTemplate || ''}
                      onChange={(e) => {
                        const updatedAction = { ...action, subtitle: e.target.value, messageTemplate: e.target.value } as SendDmAction;
                        updateAction(index, updatedAction);
                      }}
                      placeholder="Thank you for reaching out! We've received your enquiry and one of our team members will get back to you soon."
                      rows={4}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                    <p className="mt-1 text-xs text-gray-500">The main message text that appears below the title (optional)</p>
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