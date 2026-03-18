<<<<<<< HEAD
import { useEffect } from 'react';
import { Send, MessageSquare, Lock, AlertCircle, Rocket, X, Plus, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TriggerType, Action, ReplyToCommentAction, SendDmAction } from '../../types/automation';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useUpgradeModal } from '../../contexts/UpgradeModalContext';
=======
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Sparkles, Send, MessageSquare, ArrowRight, Save, Trash, AlertCircle, UserPlus, Crown, GitBranch } from 'lucide-react';
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
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e

interface ActionConfigProps {
  triggerType: TriggerType;
  actions: Action[];
  onActionsChange: (actions: Action[]) => void;
  onSave: () => void | Promise<void>;
<<<<<<< HEAD
  saving: boolean;
  readOnly?: boolean;
}

const DEFAULT_TEASER_MESSAGE = "Hey there! I'm so happy you're here... Click below and I'll send you the link in just a sec ✨";
const DEFAULT_NOT_FOLLOWING_MESSAGE = "Oops! Looks like you haven't followed me yet 👀...";

export default function ActionConfig({ triggerType, actions, onActionsChange, onSave, saving, readOnly }: ActionConfigProps) {
  const { canUseAskToFollow } = useSubscription();
  const { openModal } = useUpgradeModal();

  const hasReply = actions.some(a => a.type === 'reply_to_comment');
  const hasDm = actions.some(a => a.type === 'send_dm');
  const dmAction = actions.find(a => a.type === 'send_dm') as SendDmAction | undefined;
  const replyAction = actions.find(a => a.type === 'reply_to_comment') as ReplyToCommentAction | undefined;

  const hasFollowGate = dmAction?.askToFollow || false;

  // Cleanup askToFollow if user_directed_messages
  useEffect(() => {
    if (triggerType === 'user_directed_messages' && hasFollowGate) {
      updateDmAction({ askToFollow: false });
    }
  }, [triggerType, actions]);

  const toggleReply = () => {
    if (readOnly) return;
    if (hasReply) {
      onActionsChange(actions.filter(a => a.type !== 'reply_to_comment'));
    } else {
      onActionsChange([...actions, { type: 'reply_to_comment', replyTemplates: [''], actionButtons: [] } as ReplyToCommentAction]);
    }
  };

  const toggleDm = () => {
    if (readOnly) return;
    if (hasDm) {
      // If we turn off DM, Follow Gate is functionally off too, but we just remove the action
      onActionsChange(actions.filter(a => a.type !== 'send_dm'));
    } else {
      onActionsChange([...actions, {
        type: 'send_dm', title: '', imageUrl: '', subtitle: 'Powered By Quickrevert.tech', messageTemplate: '', actionButtons: [], askToFollow: false
      } as SendDmAction]);
    }
  };

  const toggleFollowGate = () => {
    if (readOnly) return;
    if (!canUseAskToFollow) {
      openModal();
      return;
    }
    if (!hasDm) {
       // if DM is off, toggle it ON first and add follow gate
       onActionsChange([...actions, {
         type: 'send_dm', title: '', imageUrl: '', subtitle: 'Powered By Quickrevert.tech', messageTemplate: '', actionButtons: [], askToFollow: true,
         teaserMessage: DEFAULT_TEASER_MESSAGE, askToFollowMessage: DEFAULT_NOT_FOLLOWING_MESSAGE
       } as SendDmAction]);
       return;
    }
    updateDmAction({ askToFollow: !hasFollowGate, teaserMessage: !hasFollowGate ? DEFAULT_TEASER_MESSAGE : '', askToFollowMessage: !hasFollowGate ? DEFAULT_NOT_FOLLOWING_MESSAGE : '' });
  };

  const updateDmAction = (updates: Partial<SendDmAction>) => {
    if (readOnly) return;
    const newActions = [...actions];
    const index = newActions.findIndex(a => a.type === 'send_dm');
    if (index >= 0) {
      newActions[index] = { ...newActions[index], ...updates } as SendDmAction;
      onActionsChange(newActions);
    }
  };

  const updateReplyAction = (updates: Partial<ReplyToCommentAction>) => {
    if (readOnly) return;
    const newActions = [...actions];
    const index = newActions.findIndex(a => a.type === 'reply_to_comment');
    if (index >= 0) {
      newActions[index] = { ...newActions[index], ...updates } as ReplyToCommentAction;
      onActionsChange(newActions);
    }
  };

  // Validators
  const isReplyValid = replyAction ? replyAction.replyTemplates.some(t => t.trim().length > 0) : true;
  const isDmValid = dmAction ? (dmAction.title || '').trim().length > 0 : true;
  const canSave = actions.length > 0 && isReplyValid && isDmValid;

  return (
    <div className="space-y-5 md:space-y-6 pb-24 w-full">
      
      {/* Header section */}
      <div>
        <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
          <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-[16px] md:rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-200">
            <Zap className="w-5 h-5 md:w-6 md:h-6 fill-purple-200 text-purple-200" />
          </div>
          <div className="pt-0.5 md:pt-1">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">What should happen automatically?</h2>
            <p className="text-xs md:text-sm text-gray-400 font-medium leading-relaxed mt-0.5">Turn on one or both — they run together when the trigger fires.</p>
          </div>
        </div>

        {/* Toggles Card */}
        <div className="bg-white rounded-2xl md:rounded-3xl border-2 border-purple-100 p-1.5 md:p-2 space-y-1.5 md:space-y-2">
          
          {/* Reply Toggle */}
          {triggerType === 'post_comment' && (
            <div className={`rounded-xl md:rounded-2xl border-2 transition-all overflow-hidden ${hasReply ? 'border-purple-200 bg-purple-50/30' : 'border-transparent bg-white hover:bg-gray-50'}`}>
              <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={toggleReply}>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-[14px] md:rounded-xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                  <MessageSquare className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-[14px] md:text-[15px] mb-0.5 md:mb-1">Reply to the comment</h3>
                  <p className="text-[11px] md:text-xs text-gray-400 font-medium">QuickRevert will post a comment reply automatically</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                  <input type="checkbox" className="sr-only peer" checked={hasReply} readOnly />
                  <div className="w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-purple-600 shadow-inner"></div>
                </label>
              </div>

              {/* Reply Expanded config */}
              <AnimatePresence>
                {hasReply && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                    <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-sm space-y-3">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Comment Reply Templates</label>
                      {replyAction?.replyTemplates.map((template, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            type="text"
                            value={template}
                            onChange={(e) => {
                              const newT = [...replyAction.replyTemplates];
                              newT[i] = e.target.value;
                              updateReplyAction({ replyTemplates: newT });
                            }}
                            disabled={readOnly}
                            className={`w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-semibold text-sm transition-all ${readOnly ? 'opacity-70 bg-gray-50 cursor-not-allowed' : ''}`}
                            placeholder="e.g. Check your DMs for the link!"
                          />
                          {replyAction.replyTemplates.length > 1 && !readOnly && (
                            <button onClick={() => updateReplyAction({ replyTemplates: replyAction.replyTemplates.filter((_, idx) => idx !== i) })} className="p-2 bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
=======
  onBack: () => void | Promise<void>;
  saving: boolean;
  isCondensed?: boolean;
  readOnly?: boolean;
}

const getAvailableActions = (triggerType: TriggerType): { type: ActionType; name: string; icon: any; description: string }[] => {
  const baseActions = [
    { type: 'send_dm' as ActionType, name: 'Send DM', icon: Send, description: 'Send a direct message card' },
  ];
  if (triggerType === 'post_comment') {
    return [
      { type: 'reply_to_comment' as ActionType, name: 'Reply To Comment', icon: MessageSquare, description: 'Auto-reply to comments with random templates' },
      ...baseActions,
    ];
  }
  return baseActions;
};

export default function ActionConfig({ triggerType, actions, onActionsChange, onSave, onBack, saving, readOnly }: ActionConfigProps) {
  const [showActionSelector, setShowActionSelector] = useState(false);
  const { canUseAskToFollow } = useSubscription();
  const { openModal } = useUpgradeModal();

  const availableActions = getAvailableActions(triggerType);

  // Reset askToFollow if trigger type is "User sends you a DM"
  useEffect(() => {
    if (triggerType === 'user_directed_messages') {
      const needsUpdate = actions.some(a => a.type === 'send_dm' && (a as SendDmAction).askToFollow);
      if (needsUpdate) {
        onActionsChange(actions.map(a =>
          a.type === 'send_dm' ? { ...a, askToFollow: false } : a
        ));
      }
    }
  }, [triggerType, actions, onActionsChange]);

  const addAction = (actionType: ActionType) => {
    let newAction: Action;
    if (actionType === 'reply_to_comment') {
      newAction = { type: 'reply_to_comment', replyTemplates: [''], actionButtons: [] } as ReplyToCommentAction;
    } else {
      newAction = {
        type: 'send_dm', title: 'Hi👋', imageUrl: '',
        subtitle: 'Powered By Quickrevert.tech', messageTemplate: '', actionButtons: [],
      } as SendDmAction;
    }
    onActionsChange([...actions, newAction]);
    setShowActionSelector(false);
  };

  const updateAction = (index: number, updatedAction: Action) => {
    if (readOnly) return;
    const newActions = [...actions];
    // Copy the action and update it immutably
    newActions[index] = { ...updatedAction };
    onActionsChange(newActions);
  };

  const deleteAction = (index: number) => {
    if (readOnly) return;
    onActionsChange(actions.filter((_, i) => i !== index));
  };

  const addReplyTemplate = (actionIndex: number) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    if (action.replyTemplates.length >= 10) return;
    updateAction(actionIndex, { ...action, replyTemplates: [...action.replyTemplates, ''] });
  };

  const removeReplyTemplate = (actionIndex: number, templateIndex: number) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    if (action.replyTemplates.length <= 1) return;
    updateAction(actionIndex, { ...action, replyTemplates: action.replyTemplates.filter((_, i) => i !== templateIndex) });
  };

  const updateReplyTemplate = (actionIndex: number, templateIndex: number, value: string) => {
    const action = actions[actionIndex] as ReplyToCommentAction;
    const newTemplates = [...action.replyTemplates];
    newTemplates[templateIndex] = value;
    updateAction(actionIndex, { ...action, replyTemplates: newTemplates });
  };

  const addActionButton = (actionIndex: number) => {
    const action = actions[actionIndex] as SendDmAction;
    updateAction(actionIndex, { ...action, actionButtons: [...action.actionButtons, { id: Date.now().toString(), text: '', url: '', buttonType: 'web_url' }] });
  };

  const removeActionButton = (actionIndex: number, buttonIndex: number) => {
    const action = actions[actionIndex] as SendDmAction;
    updateAction(actionIndex, { ...action, actionButtons: action.actionButtons.filter((_, i) => i !== buttonIndex) });
  };

  const isActionValid = (action: Action): boolean => {
    if (action.type === 'reply_to_comment') return (action as ReplyToCommentAction).replyTemplates.some(t => t.trim().length > 0);
    const sendDmAction = action as SendDmAction;
    return (sendDmAction.title || '').trim().length > 0;
  };

  const canSave = actions.length > 0 && actions.every(isActionValid);


  return (
    <div className="space-y-4">
      {/* Gradient bar (same as trigger section) */}
      <div className="h-[3px] w-full bg-gradient-to-r from-purple-500 via-blue-500 to-orange-400 rounded-full mb-2"></div>

      {/* What do you want to reply - section header */}
      {triggerType === 'post_comment' && (
        <div className="space-y-2">
          <p className="text-slate-800 font-semibold text-base">What do you want to reply to those comments?</p>

          <AnimatePresence mode="popLayout">
            {actions.filter(a => a.type === 'reply_to_comment').length === 0 ? (
              <motion.button
                key="add-reply-placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !readOnly && addAction('reply_to_comment')}
                disabled={readOnly}
                className="w-full border-2 border-dashed border-slate-200 rounded-xl py-8 flex flex-col items-center gap-2 text-slate-400 hover:border-purple-300 hover:text-purple-500 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-purple-50 flex items-center justify-center transition-colors">
                  <MessageSquare size={20} />
                </div>
                <span className="text-sm font-semibold">Setup Comment Replies</span>
              </motion.button>
            ) : (
              actions.map((action, index) => {
                if (action.type !== 'reply_to_comment') return null;
                return (
                  <motion.div
                    key={index}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="border border-slate-200 bg-white rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
                          <MessageSquare size={16} />
                        </div>
                        <span className="font-semibold text-slate-700 text-sm">Comment Reply Templates</span>
                      </div>
                      {!readOnly && (
                        <button onClick={() => deleteAction(index)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                          <Trash size={16} />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {(action as ReplyToCommentAction).replyTemplates.map((template, templateIndex) => (
                        <div key={templateIndex} className="flex gap-2">
                          <input
                            type="text"
                            value={template}
                            onChange={(e) => updateReplyTemplate(index, templateIndex, e.target.value)}
                            placeholder="e.g., Check your DMs for the link! 👋"
                            disabled={readOnly}
                            className={`flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 text-sm transition-all placeholder:text-slate-400 ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
                          />
                          {(action as ReplyToCommentAction).replyTemplates.length > 1 && !readOnly && (
                            <button onClick={() => removeReplyTemplate(index, templateIndex)} className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all">
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
<<<<<<< HEAD
                      {!readOnly && replyAction && replyAction.replyTemplates.length < 5 && (
                        <button onClick={() => updateReplyAction({ replyTemplates: [...replyAction.replyTemplates, ''] })} className="text-purple-600 font-bold text-[13px] flex items-center gap-1">
=======
                      {(action as ReplyToCommentAction).replyTemplates.length < 10 && !readOnly && (
                        <button onClick={() => addReplyTemplate(index)} className="flex items-center gap-1.5 text-purple-600 font-semibold text-xs pt-1">
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
                          <Plus size={14} /> Add variation
                        </button>
                      )}
                    </div>
                  </motion.div>
<<<<<<< HEAD
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Follow Gate Toggle */}
          {triggerType !== 'user_directed_messages' && (
            <div className={`rounded-xl md:rounded-2xl border-2 transition-all overflow-hidden ${hasFollowGate ? 'border-purple-200 bg-purple-50/30' : 'border-transparent bg-white hover:bg-gray-50'}`}>
              <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={toggleFollowGate}>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-[14px] md:rounded-xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                  <Lock className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-bold text-gray-900 text-[14px] md:text-[15px]">Follow Gate</h3>
                    <span className="bg-[#10b981] text-white text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 md:px-2 md:py-1 rounded-md uppercase tracking-wider">RECOMMENDED</span>
                    {!canUseAskToFollow && (
                      <span className="bg-purple-600 text-white text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 md:px-2 md:py-1 rounded-md uppercase tracking-wider">PREMIUM</span>
                    )}
                  </div>
                  <p className="text-[11px] md:text-xs text-gray-400 font-medium">Ask them to follow you before they receive the DM</p>
                  {!hasDm && <p className="text-[10px] md:text-[11px] text-orange-500 italic mt-1 font-semibold">Enable "Send them a DM" below to activate the Follow Gate.</p>}
                </div>
                <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                  <input type="checkbox" className="sr-only peer" checked={hasFollowGate} readOnly />
                  <div className="w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-purple-600 shadow-inner"></div>
                </label>
              </div>

              {/* Follow Gate Expanded config */}
              <AnimatePresence>
                {hasFollowGate && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                    <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-sm space-y-4">
                       <div className="space-y-2">
                         <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Initial Teaser Message</label>
                         <textarea
                           value={dmAction?.teaserMessage || ''}
                           onChange={(e) => updateDmAction({ teaserMessage: e.target.value })}
                           disabled={readOnly}
                           rows={2}
                           className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-sm transition-all"
                         />
                       </div>
                       <div className="space-y-2">
                         <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Verification Failed (Not Following)</label>
                         <textarea
                           value={dmAction?.askToFollowMessage || ''}
                           onChange={(e) => updateDmAction({ askToFollowMessage: e.target.value })}
                           disabled={readOnly}
                           rows={2}
                           className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-sm transition-all"
                         />
                       </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Send DM Toggle */}
          <div className={`rounded-xl md:rounded-2xl border-2 transition-all overflow-hidden ${hasDm ? 'border-purple-200 bg-purple-50/30' : 'border-transparent bg-white hover:bg-gray-50'}`}>
              <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={toggleDm}>
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-[14px] md:rounded-xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                <Send className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-[14px] md:text-[15px] mb-0.5 md:mb-1">Send them a DM</h3>
                <p className="text-[11px] md:text-xs text-gray-400 font-medium">QuickRevert will automatically slip into their DMs</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={hasDm} readOnly />
                <div className="w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-purple-600 shadow-inner"></div>
              </label>
            </div>

            {/* DM Expanded config */}
            <AnimatePresence>
              {hasDm && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                  <div className="bg-white p-4 rounded-xl border border-purple-100 shadow-sm space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Direct Message Content</label>
                       <textarea
                         value={dmAction?.title || ''}
                         onChange={(e) => updateDmAction({ title: e.target.value })}
                         disabled={readOnly}
                         rows={4}
                         placeholder="Hey! Thanks for your comment so much. Here is the link you asked for..."
                         className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-sm transition-all"
                       />
                       <p className="text-right text-[10px] text-gray-400 font-bold">{(dmAction?.title || '').length} / 640</p>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Image URL (Optional)</label>
                       <input
                         type="url"
                         value={dmAction?.imageUrl || ''}
                         onChange={(e) => updateDmAction({ imageUrl: e.target.value })}
                         disabled={readOnly}
                         placeholder="https://yourapp.com/image.jpg"
                         className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-sm transition-all"
                       />
                    </div>

                    {/* Action buttons simple list */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                       <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Buttons (Max 3)</label>
                       {dmAction?.actionButtons.map((btn, i) => (
                         <div key={i} className="flex flex-col gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                            <div className="flex justify-between items-center mb-1">
                               <span className="text-[10px] font-bold text-gray-500">Button {i + 1}</span>
                               {!readOnly && (
                                 <button onClick={() => updateDmAction({ actionButtons: dmAction.actionButtons.filter((_, idx) => idx !== i) })} className="text-gray-400 hover:text-red-500 transition-colors"><X size={14}/></button>
                               )}
                            </div>
                            <input
                              type="text"
                              placeholder="Button Text"
                              value={btn.text}
                              onChange={(e) => {
                                 const btns = [...dmAction.actionButtons];
                                 btns[i].text = e.target.value;
                                 updateDmAction({ actionButtons: btns });
                              }}
                              disabled={readOnly}
                              className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-3 py-1.5 outline-none text-gray-900 font-medium text-[13px] transition-all"
                            />
                            <input
                              type="url"
                              placeholder="URL Link"
                              value={btn.url}
                              onChange={(e) => {
                                 const btns = [...dmAction.actionButtons];
                                 btns[i].url = e.target.value;
                                 updateDmAction({ actionButtons: btns });
                              }}
                              disabled={readOnly}
                              className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-3 py-1.5 outline-none text-gray-900 font-medium text-[13px] transition-all"
                            />
                         </div>
                       ))}
                       {!readOnly && (dmAction?.actionButtons.length || 0) < 3 && (
                         <button onClick={() => updateDmAction({ actionButtons: [...(dmAction?.actionButtons || []), { id: Date.now().toString(), text: '', url: '', buttonType: 'web_url' }] })} className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-purple-600 font-bold text-[13px] hover:bg-purple-50 hover:border-purple-200 transition-all">
                            + Add Link Button
                         </button>
                       )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* Validation Error Message */}
        <AnimatePresence>
          {actions.length === 0 && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-4 p-4 bg-[#fffbeb] border border-[#fef3c7] rounded-xl flex items-center gap-3">
              <AlertCircle size={20} className="text-orange-400 shrink-0" />
              <p className="text-orange-700 font-bold text-sm">Please turn on at least one action above to continue.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Global Action Button (Launch) for Step 2 fixed at the bottom */}
      <div className="fixed md:absolute bottom-0 left-0 right-0 px-5 md:px-12 bg-gradient-to-t from-white via-white to-transparent pt-16 pb-6 z-10 pointer-events-none flex justify-center">
         {readOnly ? (
            <div className="pointer-events-auto w-full md:max-w-xl">
              <button disabled className="w-full py-4 md:py-5 rounded-full font-bold text-lg flex justify-center items-center gap-2 transition-all shadow-none bg-gray-100 text-gray-400">
                 View Only
              </button>
            </div>
         ) : (
            <div className="pointer-events-auto w-full md:max-w-xl">
              <button
                 onClick={onSave}
                 disabled={!canSave || saving}
                 className={`w-full py-4 md:py-5 rounded-full font-bold text-lg md:text-xl flex justify-center items-center gap-2 transition-all shadow-lg
                  ${canSave
                    ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-200 hover:shadow-xl hover:-translate-y-1'
                    : 'bg-gray-100 text-gray-400 shadow-none'}`}
              >
                {saving ? 'Loading...' : 'Launch Automation'} {!saving && <Rocket className={`w-5 h-5 md:w-6 md:h-6 ${canSave ? "text-orange-400" : "text-gray-400"}`} />}
              </button>
            </div>
         )}
      </div>
=======
                );
              })
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ──────────── Follow Gate ──────────── */}
      {actions.filter(a => a.type === 'send_dm').map((action, _rawIndex) => {
        const index = actions.indexOf(action);
        return (
          <div key={index} className="space-y-4">
            {/* Follow Gate */}
            {triggerType !== 'user_directed_messages' && (
              <>
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
                      (action as SendDmAction).askToFollow ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white" : "bg-slate-100 text-slate-400"
                    )}>
                      <UserPlus size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 text-base">Follow Gate</p>
                        <span className="bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                          RECOMMENDED
                        </span>
                        {!canUseAskToFollow && (
                          <span className="bg-gradient-to-r from-blue-500 to-purple-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Crown size={8} /> PREMIUM
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-xs">Require users to follow you before they can access your automation</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      disabled={!canUseAskToFollow || readOnly}
                      checked={(action as SendDmAction).askToFollow || false}
                      onChange={(e) => {
                        if (!canUseAskToFollow) { openModal(); return; }
                        updateAction(index, { ...action, askToFollow: e.target.checked } as SendDmAction);
                      }}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-purple-600"></div>
                  </label>
                </div>

                {/* Follow Gate expanded fields */}
                <AnimatePresence>
                  {(action as SendDmAction).askToFollow && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border border-slate-100 rounded-xl p-4 space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">1. Initial Teaser</label>
                            {!readOnly && (
                              <button onClick={() => updateAction(index, { ...action, teaserMessage: DEFAULT_TEASER_MESSAGE } as SendDmAction)} className="text-[10px] text-purple-500 hover:text-purple-700 font-semibold">Auto-Fill</button>
                            )}
                          </div>
                          <textarea
                            value={(action as SendDmAction).teaserMessage || ''}
                            onChange={(e) => updateAction(index, { ...action, teaserMessage: e.target.value } as SendDmAction)}
                            placeholder="Initial message to hook them..."
                            rows={2}
                            disabled={readOnly}
                            className={`w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
                          />
                          <input type="text" value={(action as SendDmAction).teaserBtnText || ''} onChange={(e) => updateAction(index, { ...action, teaserBtnText: e.target.value } as SendDmAction)} placeholder="Teaser Button Text" disabled={readOnly} className={`w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-center text-slate-700 transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`} />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">2. Verification Failed</label>
                            {!readOnly && (
                              <button onClick={() => updateAction(index, { ...action, askToFollowMessage: DEFAULT_NOT_FOLLOWING_MESSAGE } as SendDmAction)} className="text-[10px] text-slate-500 hover:text-slate-700 font-semibold">Auto-Fill</button>
                            )}
                          </div>
                          <textarea value={(action as SendDmAction).askToFollowMessage || ''} onChange={(e) => updateAction(index, { ...action, askToFollowMessage: e.target.value } as SendDmAction)} placeholder="Message if not following..." rows={2} disabled={readOnly} className={`w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`} />
                          <input type="text" value={(action as SendDmAction).askToFollowBtnText || ''} onChange={(e) => updateAction(index, { ...action, askToFollowBtnText: e.target.value } as SendDmAction)} placeholder="Follow Button Text" disabled={readOnly} className={`w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-center text-slate-700 transition-all focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}


            {/* ─── Gradient bar ─── */}
            <div className="h-[3px] w-full bg-gradient-to-r from-purple-500 via-blue-500 to-orange-400 rounded-full"></div>

            {/* Response Flow header */}
            <div className="flex items-center gap-3 py-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                <GitBranch size={18} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 text-base">Response Flow</p>
                <p className="text-slate-400 text-xs">Configure automated DM responses</p>
              </div>
            </div>

            {/* DM action card fields */}
            <div className="border border-slate-200 bg-white rounded-xl p-4 space-y-4">
              {!readOnly && (
                <div className="mb-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Message</label>
                </div>
              )}

              {/* Opening message / title */}
              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-medium">Simple Text Message</label>
                <textarea
                  value={(action as SendDmAction).title || ''}
                  onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }}
                  onChange={(e) => updateAction(index, { ...action, title: e.target.value } as SendDmAction)}
                  placeholder="Hey! Thanks for your comment 😊"
                  disabled={readOnly}
                  rows={3}
                  className={`w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 text-sm transition-all placeholder:text-slate-400 resize-none ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
                />
                <p className="text-xs text-slate-400 text-right">{((action as SendDmAction).title || '').length}/640</p>
              </div>

              {/* Image URL (optional) */}
              <div className="space-y-1">
                <label className="text-xs text-slate-500 font-medium">Image URL (optional)</label>
                <input
                  type="url"
                  value={(action as SendDmAction).imageUrl || ''}
                  onChange={(e) => updateAction(index, { ...action, imageUrl: e.target.value } as SendDmAction)}
                  placeholder="https://example.com/promo.jpg"
                  disabled={readOnly}
                  className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 text-sm transition-all placeholder:text-slate-400 ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
                />
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                {(action as SendDmAction).actionButtons.map((button, buttonIndex) => {
                  const btnType = button.buttonType || 'web_url';
                  return (
                    <motion.div key={button.id} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 group/btn">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={button.text}
                          onChange={(e) => {
                            const a = actions[index] as SendDmAction;
                            const newButtons = [...a.actionButtons];
                            newButtons[buttonIndex] = { ...newButtons[buttonIndex], text: e.target.value };
                            updateAction(index, { ...a, actionButtons: newButtons });
                          }}
                          placeholder="Button Label"
                          disabled={readOnly}
                          className={`px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs text-center font-semibold focus:border-purple-500 transition-all ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
                        />
                        {btnType === 'web_url' && (
                          <input
                            type="url"
                            value={button.url || ''}
                            onChange={(e) => {
                              const a = actions[index] as SendDmAction;
                              const newButtons = [...a.actionButtons];
                              newButtons[buttonIndex] = { ...newButtons[buttonIndex], url: e.target.value };
                              updateAction(index, { ...a, actionButtons: newButtons });
                            }}
                            placeholder="https://your-link.com"
                            disabled={readOnly}
                            className={`px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs focus:border-purple-500 transition-all ${readOnly ? 'cursor-not-allowed opacity-70' : ''}`}
                          />
                        )}
                      </div>
                      {!readOnly && (
                        <button onClick={() => removeActionButton(index, buttonIndex)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover/btn:opacity-100">
                          <X size={14} />
                        </button>
                      )}
                    </motion.div>
                  );
                })}

                {(action as SendDmAction).actionButtons.length < 3 && !readOnly && (
                  <button
                    onClick={() => addActionButton(index)}
                    className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-semibold hover:border-purple-300 hover:text-purple-500 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> Add Button (Optional)
                  </button>
                )}
              </div>

              {/* Branding */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider text-center">Powered By Quickrevert.tech</p>
              </div>
            </div>

            {/* Delete DM action */}
            {!readOnly && (
              <button onClick={() => deleteAction(index)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors">
                <Trash size={14} /> Remove Response Flow
              </button>
            )}
          </div>
        );
      })}

      {/* Add DM action if none yet */}
      {actions.filter(a => a.type === 'send_dm').length === 0 && (
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => !readOnly && addAction('send_dm')}
          disabled={readOnly}
          className={`w-full border-2 border-dashed border-slate-200 rounded-xl py-8 flex flex-col items-center gap-2 text-slate-400 hover:border-purple-300 hover:text-purple-500 transition-all group ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-purple-50 flex items-center justify-center transition-colors">
            <Send size={20} />
          </div>
          <span className="text-sm font-semibold">Setup Response Flow</span>
          <span className="text-xs text-slate-400">Configure automated DM responses</span>
        </motion.button>
      )}

      {/* Navigation Footer */}
      <div className="flex justify-between items-center pt-6 border-t border-slate-100">
        <button
          onClick={onBack}
          className="px-6 py-2.5 text-slate-500 hover:text-slate-800 font-semibold text-sm transition-all"
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {!canSave && actions.length > 0 && (
            <div className="flex items-center gap-2 text-amber-500 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
              <AlertCircle size={14} />
              <span className="text-[10px] font-semibold uppercase tracking-widest">Complete all required fields</span>
            </div>
          )}
          {!readOnly && (
            <motion.button
              whileHover={canSave && !saving ? { scale: 1.05 } : {}}
              whileTap={canSave && !saving ? { scale: 0.95 } : {}}
              onClick={onSave}
              disabled={!canSave || saving}
              className={cn(
                "px-8 py-3 rounded-xl font-semibold text-sm shadow-lg flex items-center gap-2 transition-all",
                canSave && !saving
                  ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:shadow-purple-500/20"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
              )}
            >
              {saving ? (<>Saving... <Sparkles className="animate-pulse" size={16} /></>) : (<>Launch Automation <Save size={16} /></>)}
            </motion.button>
          )}
        </div>
      </div>

      {/* Action Selector Modal (for other action types if needed) */}
      {showActionSelector && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowActionSelector(false)} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Choose Action</h3>
              <button onClick={() => setShowActionSelector(false)} className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-colors"><X size={20} /></button>
            </div>
            <div className="grid gap-3">
              {availableActions.map((option) => (
                <button key={option.type} onClick={() => addAction(option.type)}
                  className="flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-100 hover:border-purple-400 hover:bg-purple-50 transition-all text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                    <option.icon size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{option.name}</p>
                    <p className="text-xs text-slate-500">{option.description}</p>
                  </div>
                  <ArrowRight className="ml-auto text-slate-300" size={18} />
                </button>
              ))}
            </div>
          </motion.div>
        </div>,
        document.body
      )}
>>>>>>> b3c28071684b8109b12a70315947cca5adeb3e9e
    </div>
  );
}
