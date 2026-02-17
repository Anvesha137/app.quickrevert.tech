import { useState } from 'react';
import { Plus, X, Sparkles, Send, MessageSquare, ChevronDown, Crown, ArrowRight, Save, Trash, AlertCircle, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { TriggerType, Action, ActionType, ReplyToCommentAction, SendDmAction } from '../../types/automation';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useUpgradeModal } from '../../contexts/UpgradeModalContext';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_TEASER_MESSAGE = "Hey there! I'm so happy you're here... Click below and I'll send you the link in just a sec ✨";
const DEFAULT_NOT_FOLLOWING_MESSAGE = "Oops! Looks like you haven't followed me yet 👀...";

interface ActionConfigProps {
  triggerType: TriggerType;
  actions: Action[];
  onActionsChange: (actions: Action[]) => void;
  onSave: () => void | Promise<void>;
  onBack: () => void | Promise<void>;
  saving: boolean;
  isCondensed?: boolean;
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

const getAvailableActions = (triggerType: TriggerType): { type: ActionType; name: string; icon: any; description: string; color: string }[] => {
  const baseActions = [
    {
      type: 'send_dm' as ActionType,
      name: 'Send DM',
      icon: Send,
      description: 'Send a high-fidelity direct message card',
      color: 'bg-blue-500'
    },
  ];

  if (triggerType === 'post_comment') {
    return [
      {
        type: 'reply_to_comment' as ActionType,
        name: 'Reply To Comment',
        icon: MessageSquare,
        description: 'Auto-reply to comments with random templates',
        color: 'bg-indigo-500'
      },
      ...baseActions,
    ];
  }

  return baseActions;
};

export default function ActionConfig({ triggerType, actions, onActionsChange, onSave, onBack, saving, isCondensed }: ActionConfigProps) {
  const [showActionSelector, setShowActionSelector] = useState(false);
  const { canUseAskToFollow } = useSubscription();
  const { openModal } = useUpgradeModal();

  const availableActions = getAvailableActions(triggerType);

  const addAction = (actionType: ActionType) => {
    let newAction: Action;

    if (actionType === 'reply_to_comment') {
      newAction = {
        type: 'reply_to_comment',
        replyTemplates: [''],
        actionButtons: [],
      } as ReplyToCommentAction;
    } else {
      newAction = {
        type: 'send_dm',
        title: 'Hi👋',
        imageUrl: '',
        subtitle: 'Powered By Quickrevert.tech',
        messageTemplate: '',
        actionButtons: [],
      } as SendDmAction;
    }

    onActionsChange([...actions, newAction]);
    setShowActionSelector(false);
  };

  const updateAction = (index: number, updatedAction: Action) => {
    const newActions = [...actions];
    if (updatedAction.type === 'send_dm') {
      (updatedAction as SendDmAction).subtitle = 'Powered By Quickrevert.tech';
    }
    newActions[index] = updatedAction;
    onActionsChange(newActions);
  };

  const deleteAction = (index: number) => {
    onActionsChange(actions.filter((_, i) => i !== index));
  };

  const addReplyTemplate = (actionIndex: number) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    if (action.replyTemplates.length >= 10) return;
    updateAction(actionIndex, {
      ...action,
      replyTemplates: [...action.replyTemplates, ''],
    });
  };

  const removeReplyTemplate = (actionIndex: number, templateIndex: number) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    if (action.replyTemplates.length <= 1) return;
    const newTemplates = action.replyTemplates.filter((_, i) => i !== templateIndex);
    updateAction(actionIndex, {
      ...action,
      replyTemplates: newTemplates,
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

  const addActionButton = (actionIndex: number) => {
    const action = actions[actionIndex] as SendDmAction;
    updateAction(actionIndex, {
      ...action,
      actionButtons: [...action.actionButtons, { id: Date.now().toString(), text: '', url: '' }],
    });
  };

  const updateActionButton = (actionIndex: number, buttonIndex: number, field: 'text' | 'url', value: string) => {
    const action = actions[actionIndex] as SendDmAction;
    const newButtons = [...action.actionButtons];
    newButtons[buttonIndex] = { ...newButtons[buttonIndex], [field]: value };

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

  const getActionName = (action: Action): string => {
    switch (action.type) {
      case 'reply_to_comment': return 'Reply To Comment';
      case 'ask_to_follow': return 'Ask To Follow';
      case 'send_dm': return 'Send DM';
      default: return 'Action';
    }
  };

  const isActionValid = (action: Action): boolean => {
    if (action.type === 'reply_to_comment') {
      return (action as ReplyToCommentAction).replyTemplates.some(t => t.trim().length > 0);
    }
    const sendDmAction = action as SendDmAction;
    return (sendDmAction.title || '').trim().length > 0;
  };

  const canSave = actions.length > 0 && actions.every(isActionValid);

  return (
    <div className="space-y-10">
      {/* Step Header */}
      {!isCondensed && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <h2 className="text-3xl font-black text-slate-800 mb-2 font-outfit">Design Actions</h2>
            <p className="text-slate-500 font-medium font-outfit">Define what happens when the trigger fires.</p>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-2xl border border-blue-100 shrink-0 self-start">
            <Sparkles className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-black text-blue-700 uppercase tracking-widest leading-none">
              {getTriggerName(triggerType)} Active
            </span>
          </div>
        </div>
      )}

      {isCondensed && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Step 2: Design Actions</h2>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-widest">Create your automated responses</p>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {actions.length === 0 ? (
          <motion.div
            key="empty-actions"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-200"
          >
            <div className="w-20 h-20 bg-white rounded-3xl shadow-xl shadow-slate-200/50 flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-slate-300" />
            </div>
            <p className="text-slate-400 font-bold text-lg mb-8">No actions added yet</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowActionSelector(true)}
              className="px-10 py-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-500/20 flex items-center gap-3"
            >
              <Plus size={20} /> Add Your First Action
            </motion.button>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {actions.map((action, index) => (
              <motion.div
                key={index}
                layout
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-xl shadow-slate-200/40 group overflow-hidden"
              >
                {/* Visual Accent */}
                <div className={cn(
                  "absolute top-0 left-0 w-2 h-full",
                  action.type === 'reply_to_comment' ? "bg-indigo-500" : "bg-blue-500"
                )} />

                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg",
                      action.type === 'reply_to_comment' ? "bg-indigo-500" : "bg-blue-500"
                    )}>
                      {action.type === 'reply_to_comment' ? <MessageSquare size={22} /> : <Send size={22} />}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-800 tracking-tight">
                        {getActionName(action)}
                      </h3>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Action #{index + 1}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteAction(index)}
                    className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-colors"
                  >
                    <Trash size={20} />
                  </button>
                </div>

                {/* --- Action Specific Content --- */}

                {action.type === 'reply_to_comment' && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <label className="block text-sm font-black text-indigo-700 uppercase tracking-widest pl-1">
                        Reply Templates <span className="text-xs text-indigo-400 font-bold">(Up to 10)</span>
                      </label>
                      <div className="grid gap-3">
                        {action.replyTemplates.map((template, templateIndex) => (
                          <div key={templateIndex} className="flex gap-2">
                            <input
                              type="text"
                              value={template}
                              onChange={(e) => updateReplyTemplate(index, templateIndex, e.target.value)}
                              placeholder="e.g., Check your DMs for the link! 👋"
                              className="flex-1 px-6 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50/30 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold text-slate-800 transition-all placeholder:text-slate-300"
                            />
                            {action.replyTemplates.length > 1 && (
                              <button
                                onClick={() => removeReplyTemplate(index, templateIndex)}
                                className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all"
                              >
                                <X size={20} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {action.replyTemplates.length < 10 && (
                        <motion.button
                          whileHover={{ x: 5 }}
                          onClick={() => addReplyTemplate(index)}
                          className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest pl-1 pt-2"
                        >
                          <Plus size={16} /> Add random variation
                        </motion.button>
                      )}
                    </div>
                  </div>
                )}

                {action.type === 'send_dm' && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Card Title</label>
                        <input
                          type="text"
                          value={(action as SendDmAction).title || ''}
                          onChange={(e) => updateAction(index, { ...action, title: e.target.value } as SendDmAction)}
                          placeholder="Hey there! 👋"
                          className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50/30 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-slate-800 transition-all placeholder:text-slate-300"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Image URL</label>
                        <input
                          type="url"
                          value={(action as SendDmAction).imageUrl || ''}
                          onChange={(e) => updateAction(index, { ...action, imageUrl: e.target.value } as SendDmAction)}
                          placeholder="https://example.com/promo.jpg"
                          className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50/30 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-slate-800 transition-all placeholder:text-slate-300"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Branding Subtitle</label>
                      <input
                        type="text"
                        value="Powered By Quickrevert.tech"
                        readOnly
                        className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 bg-slate-100 text-slate-400 font-black text-xs uppercase tracking-widest cursor-not-allowed"
                      />
                    </div>

                    {/* Ask to Follow Toggle */}
                    <div className="relative overflow-hidden rounded-[2rem] border-2 border-slate-100 bg-slate-50/30 p-1">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white rounded-[1.8rem] shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                            (action as SendDmAction).askToFollow ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400"
                          )}>
                            <UserPlus size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-slate-800">Growth Engine: Ask to Follow</h4>
                              {!canUseAskToFollow && (
                                <span className="bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <Crown size={8} /> PREMIUM
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-medium text-slate-400">Force follow verification before reward.</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            disabled={!canUseAskToFollow}
                            checked={(action as SendDmAction).askToFollow || false}
                            onChange={(e) => {
                              if (!canUseAskToFollow) {
                                openModal();
                                return;
                              }
                              updateAction(index, { ...action, askToFollow: e.target.checked } as SendDmAction);
                            }}
                          />
                          <div className="w-14 h-8 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>

                      <AnimatePresence>
                        {(action as SendDmAction).askToFollow && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="p-6 pt-2 space-y-6"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Teaser Section */}
                              <div className="bg-indigo-50/50 rounded-3xl border border-indigo-100 p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                  <h5 className="text-xs font-black text-indigo-700 uppercase tracking-widest">1. Initial Teaser</h5>
                                  <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => updateAction(index, { ...action, teaserMessage: DEFAULT_TEASER_MESSAGE } as SendDmAction)}
                                    className="text-[10px] font-black text-indigo-400 hover:text-indigo-600 uppercase tracking-tighter"
                                  >
                                    Auto-Fill
                                  </motion.button>
                                </div>
                                <textarea
                                  value={(action as SendDmAction).teaserMessage || ''}
                                  onChange={(e) => updateAction(index, { ...action, teaserMessage: e.target.value } as SendDmAction)}
                                  placeholder="Initial message to hook them..."
                                  rows={2}
                                  className="w-full px-4 py-3 rounded-xl border-2 border-indigo-100 bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 font-bold text-slate-800 text-sm transition-all shadow-inner"
                                />
                                <input
                                  type="text"
                                  value={(action as SendDmAction).teaserBtnText || ''}
                                  onChange={(e) => updateAction(index, { ...action, teaserBtnText: e.target.value } as SendDmAction)}
                                  placeholder="Teaser Button Text"
                                  className="w-full px-4 py-3 rounded-xl border-2 border-indigo-100 bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 font-black text-slate-800 text-xs text-center transition-all shadow-sm"
                                />
                              </div>

                              {/* Fail Message Section */}
                              <div className="bg-slate-100/50 rounded-3xl border border-slate-200 p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                  <h5 className="text-xs font-black text-slate-500 uppercase tracking-widest">2. Verification Failed</h5>
                                  <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => updateAction(index, { ...action, askToFollowMessage: DEFAULT_NOT_FOLLOWING_MESSAGE } as SendDmAction)}
                                    className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-tighter"
                                  >
                                    Auto-Fill
                                  </motion.button>
                                </div>
                                <textarea
                                  value={(action as SendDmAction).askToFollowMessage || ''}
                                  onChange={(e) => updateAction(index, { ...action, askToFollowMessage: e.target.value } as SendDmAction)}
                                  placeholder="Message if not following..."
                                  rows={2}
                                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white focus:ring-4 focus:ring-slate-500/10 focus:border-slate-400 font-bold text-slate-800 text-sm transition-all shadow-inner"
                                />
                                <input
                                  type="text"
                                  value={(action as SendDmAction).askToFollowBtnText || ''}
                                  onChange={(e) => updateAction(index, { ...action, askToFollowBtnText: e.target.value } as SendDmAction)}
                                  placeholder="Follow Button Text"
                                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white focus:ring-4 focus:ring-slate-500/10 focus:border-slate-400 font-black text-slate-800 text-xs text-center transition-all shadow-sm"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
                              <Crown size={12} className="text-emerald-600" />
                              <p className="text-[10px] font-bold text-emerald-700">The "Final Reward" buttons below will show ONLY after follow verification succeeds.</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Action Buttons Section */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pl-1">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Action Buttons (Max 3)</label>
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter">Clickable Rewards</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(action as SendDmAction).actionButtons.map((button, buttonIndex) => (
                          <motion.div
                            key={button.id}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-slate-50/50 rounded-3xl border border-slate-100 p-5 space-y-3 shadow-sm relative group/btn"
                          >
                            <button
                              onClick={() => removeActionButton(index, buttonIndex)}
                              className="absolute -top-2 -right-2 w-7 h-7 bg-white text-red-400 rounded-full shadow-lg border border-red-50 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-all opacity-0 group-hover/btn:opacity-100 scale-90 group-hover/btn:scale-100"
                            >
                              <X size={14} />
                            </button>
                            <input
                              type="text"
                              value={button.text}
                              onChange={(e) => updateActionButton(index, buttonIndex, 'text', e.target.value)}
                              placeholder="Button Text"
                              className="w-full px-4 py-2 rounded-xl border-2 border-slate-100 bg-white focus:border-blue-500 font-black text-slate-700 text-xs text-center transition-all"
                            />
                            <div className="relative">
                              <select className="w-full px-4 py-2 rounded-xl border-2 border-slate-100 bg-white focus:border-blue-500 font-bold text-slate-400 text-[10px] appearance-none disabled:opacity-100" disabled>
                                <option>Web URL</option>
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                            </div>
                            <input
                              type="url"
                              value={button.url || ''}
                              onChange={(e) => updateActionButton(index, buttonIndex, 'url', e.target.value)}
                              placeholder="https://..."
                              className="w-full px-4 py-2 rounded-xl border-2 border-slate-100 bg-white focus:border-blue-500 font-medium text-slate-500 text-[10px] transition-all"
                            />
                          </motion.div>
                        ))}

                        {(action as SendDmAction).actionButtons.length < 3 && (
                          <motion.button
                            whileHover={{ scale: 1.02, backgroundColor: '#f8fafc' }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => addActionButton(index)}
                            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-3xl text-slate-400 hover:text-blue-500 hover:border-blue-200 transition-all gap-2"
                          >
                            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center">
                              <Plus size={20} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest">Add Button</span>
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setShowActionSelector(true)}
              className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[2.5rem] text-slate-400 font-black uppercase tracking-widest text-xs hover:border-blue-200 hover:text-blue-500 hover:bg-blue-50/10 transition-all flex items-center justify-center gap-3 mt-4"
            >
              <Plus size={20} /> Add Another Action Step
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      {/* Action Selector Modal */}
      <AnimatePresence>
        {showActionSelector && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowActionSelector(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden"
            >
              <div className="p-10">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-slate-800 font-outfit">Choose Action</h3>
                    <p className="text-sm font-medium text-slate-500">Select how to respond to "{getTriggerName(triggerType)}"</p>
                  </div>
                  <button onClick={() => setShowActionSelector(false)} className="p-3 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-200 transition-colors">
                    <X size={24} />
                  </button>
                </div>

                <div className="grid gap-4">
                  {availableActions.map((option, idx) => (
                    <motion.button
                      key={option.type}
                      whileHover={{ scale: 1.02, x: 5 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => addAction(option.type)}
                      className="group flex items-start gap-6 p-6 rounded-[2rem] border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left"
                    >
                      <div className={cn(
                        "w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-white shadow-lg shrink-0",
                        option.color
                      )}>
                        <option.icon size={30} />
                      </div>
                      <div className="pt-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 text-[10px] font-black flex items-center justify-center">{idx + 1}</span>
                          <h4 className="text-xl font-black text-slate-800">{option.name}</h4>
                        </div>
                        <p className="text-sm font-medium text-slate-500 leading-relaxed">{option.description}</p>
                      </div>
                      <div className="ml-auto self-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight className="text-blue-500" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Navigation Footer */}
      <div className="flex justify-between items-center pt-10 border-t border-slate-100">
        <button
          onClick={onBack}
          className="px-8 py-3.5 text-slate-500 hover:text-slate-800 font-black text-sm uppercase tracking-widest transition-all"
        >
          {isCondensed ? 'Back to Logic' : 'Back'}
        </button>
        <div className="flex items-center gap-4">
          {!canSave && actions.length > 0 && (
            <div className="flex items-center gap-2 text-amber-500 bg-amber-50 px-4 py-2 rounded-xl border border-amber-100">
              <AlertCircle size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Complete all required fields</span>
            </div>
          )}
          <motion.button
            whileHover={canSave && !saving ? { scale: 1.05 } : {}}
            whileTap={canSave && !saving ? { scale: 0.95 } : {}}
            onClick={onSave}
            disabled={!canSave || saving}
            className={cn(
              "px-10 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg flex items-center gap-3 transition-all",
              canSave && !saving
                ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-emerald-500/20"
                : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
            )}
          >
            {saving ? (
              <>Deploying... <Sparkles className="animate-pulse" size={18} /></>
            ) : (
              <>Launch Automation <Save size={18} /></>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
