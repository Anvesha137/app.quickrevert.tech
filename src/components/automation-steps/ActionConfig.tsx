import { useEffect } from 'react';
import { Send, MessageSquare, Lock, AlertCircle, Rocket, X, Plus, Bot, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { TriggerType, Action, ReplyToCommentAction, SendDmAction } from '../../types/automation';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useUpgradeModal } from '../../contexts/UpgradeModalContext';
import { useTheme } from '../../contexts/ThemeContext';

// Utility for class merging
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ActionConfigProps {
  triggerType: TriggerType;
  actions: Action[];
  onActionsChange: (actions: Action[]) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  readOnly?: boolean;
}

const DEFAULT_TEASER_MESSAGE = "Hey! Glad you’re here... Tap below and I’ll send you a message shortly 👀";
const DEFAULT_NOT_FOLLOWING_MESSAGE = "Oops! Looks like you haven't followed me yet 👀...";
const DEFAULT_TEASER_BTN_TEXT = "Send Access";
const DEFAULT_VERIFY_BTN_TEXT = "I've Followed! ✅";

export default function ActionConfig({ triggerType, actions, onActionsChange, onSave, saving, readOnly }: ActionConfigProps) {
  const { darkMode } = useTheme();
  const { canUseAskToFollow } = useSubscription();
  const { openModal } = useUpgradeModal();

  const hasReply = actions.some(a => a.type === 'reply_to_comment');
  const hasDm = actions.some(a => a.type === 'send_dm');
  const dmAction = actions.find(a => a.type === 'send_dm') as SendDmAction | undefined;
  const replyAction = actions.find(a => a.type === 'reply_to_comment') as ReplyToCommentAction | undefined;

  const hasFollowGate = dmAction?.askToFollow || false;

  // Cleanup askToFollow if user_directed_messages
  useEffect(() => {
    if (triggerType !== 'post_comment' && hasFollowGate) {
      updateDmAction({ askToFollow: false });
    }
  }, [triggerType, actions]);

  const toggleReply = () => {
    if (readOnly) return;
    if (hasReply) {
      onActionsChange(actions.filter(a => a.type !== 'reply_to_comment'));
    } else {
      onActionsChange([...actions, {
        type: 'reply_to_comment',
        replyTemplates: [
          'Ayyy check your DMs 👀✨',
          'Just dropped you a message 💌🔥',
          'Doneee, sent you the details 🫶📩',
          'You got a lil surprise in your inbox 😌💫'
        ],
        actionButtons: []
      } as ReplyToCommentAction]);
    }
  };

  const toggleDm = () => {
    if (readOnly) return;
    if (hasDm) {
      // If we turn off DM, Follow Gate is functionally off too, but we just remove the action
      onActionsChange(actions.filter(a => a.type !== 'send_dm'));
    } else {
      onActionsChange([...actions, {
        type: 'send_dm',
        title: NEW_DEFAULT_TITLE,
        imageUrl: '',
        subtitle: 'Powered By Quickrevert.tech',
        messageTemplate: '',
        actionButtons: [],
        askToFollow: false,
        showImage: false
      } as SendDmAction]);
    }
  };

  const OLD_DEFAULT_TITLE = 'Hey! Thanks for your comment so much. Here is the link you asked for...';
  const NEW_DEFAULT_TITLE = 'Hey! Thanks so much for your comment 💌 Everything’s been sent your way ✨';

  const toggleFollowGate = () => {
    if (readOnly) return;
    if (!canUseAskToFollow) {
      openModal();
      return;
    }
    if (!hasDm) {
      // if DM is off, toggle it ON first and add follow gate
      onActionsChange([...actions, {
        type: 'send_dm',
        title: NEW_DEFAULT_TITLE,
        imageUrl: '',
        subtitle: 'Powered By Quickrevert.tech',
        messageTemplate: '',
        actionButtons: [],
        askToFollow: true,
        teaserMessage: DEFAULT_TEASER_MESSAGE,
        askToFollowMessage: DEFAULT_NOT_FOLLOWING_MESSAGE,
        teaserBtnText: DEFAULT_TEASER_BTN_TEXT,
        askToFollowBtnText: DEFAULT_VERIFY_BTN_TEXT,
        showImage: false
      } as SendDmAction]);
      return;
    }
    updateDmAction({ askToFollow: !hasFollowGate, teaserMessage: !hasFollowGate ? DEFAULT_TEASER_MESSAGE : '', askToFollowMessage: !hasFollowGate ? DEFAULT_NOT_FOLLOWING_MESSAGE : '', teaserBtnText: !hasFollowGate ? DEFAULT_TEASER_BTN_TEXT : '', askToFollowBtnText: !hasFollowGate ? DEFAULT_VERIFY_BTN_TEXT : '' });
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
          <div className={`w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-2xl flex items-center justify-center text-white ${darkMode ? 'bg-purple-600' : 'bg-purple-600 shadow-lg shadow-purple-200'}`}>
            <Bot className="w-6 h-6 md:w-7 md:h-7 text-white" />
          </div>
          <div className="pt-0.5 md:pt-1">
            <h2 className={`text-lg md:text-xl font-bold leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>What should happen automatically?</h2>
            <p className={`text-xs md:text-sm font-medium leading-relaxed mt-0.5 ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>Turn on one or both — they run together when the trigger fires.</p>
          </div>
        </div>

        {/* Toggles Card */}
        <div className={`p-1.5 md:p-2 space-y-1.5 md:space-y-2 transition-colors duration-300 ${darkMode ? '' : 'bg-white border-2 border-purple-100 rounded-[1.5rem]'}`}>

          {/* Reply Toggle */}
          {triggerType === 'post_comment' && (
            <div className={`rounded-2xl border-2 transition-all overflow-hidden ${hasReply ? (darkMode ? 'border-purple-500/30 bg-transparent' : 'border-purple-200 bg-purple-50/30') : (darkMode ? 'border-transparent bg-transparent hover:bg-white/[0.04]' : 'border-transparent bg-white hover:bg-gray-50')}`}>
              <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={toggleReply}>
                <div className={`w-10 h-10 md:w-12 md:h-12 rounded-[14px] md:rounded-xl flex items-center justify-center shrink-0 border ${darkMode ? 'bg-white/10 border-white/10' : 'bg-gray-50 border-gray-100'}`}>
                  <MessageSquare className={`w-4 h-4 md:w-5 md:h-5 ${darkMode ? 'text-white/60' : 'text-gray-500'}`} />
                </div>
                <div className="flex-1">
                  <h3 className={`font-bold text-[14px] md:text-[15px] mb-0.5 md:mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Reply to the comment</h3>
                  <p className={`text-[11px] md:text-xs font-medium ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>QuickRevert will post a comment reply automatically</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                  <input type="checkbox" className="sr-only peer" checked={hasReply} readOnly />
                  <div className={`w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-purple-600 shadow-inner ${darkMode ? 'bg-white/10' : ''}`}></div>
                </label>
              </div>

              {/* Reply Expanded config */}
              <AnimatePresence>
                {hasReply && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                    <div className={`p-4 rounded-2xl border shadow-sm space-y-3 ${darkMode ? 'bg-transparent border-white/5' : 'bg-white border-purple-100'}`}>
                      <label className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Comment Reply Templates</label>
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
                            className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-semibold text-base transition-all ${darkMode ? 'border-white/10 bg-transparent text-white focus:border-purple-500/50 placeholder:text-white/20' : 'border-gray-200 focus:border-purple-500 text-gray-900 bg-white placeholder:text-gray-300'} ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                            placeholder="e.g. Check your DMs for the link!"
                          />
                          {replyAction.replyTemplates.length > 1 && !readOnly && (
                            <button onClick={() => updateReplyAction({ replyTemplates: replyAction.replyTemplates.filter((_, idx) => idx !== i) })} className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-white/10 text-white hover:text-red-400 hover:bg-white/20' : 'bg-gray-100 text-gray-900 hover:text-red-500 hover:bg-red-50'}`}>
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      {!readOnly && replyAction && replyAction.replyTemplates.length < 5 && (
                        <button onClick={() => updateReplyAction({ replyTemplates: [...replyAction.replyTemplates, ''] })} className={`font-bold text-[13px] flex items-center gap-1 transition-colors ${darkMode ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600'}`}>
                          <Plus size={14} /> Add variation
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Follow Gate Toggle */}
          {triggerType === 'post_comment' && (
            <div className={`rounded-2xl border-2 transition-all overflow-hidden ${hasFollowGate ? (darkMode ? 'border-purple-500/30 bg-transparent' : 'border-purple-200 bg-purple-50/30') : (darkMode ? 'border-transparent bg-transparent hover:bg-white/[0.04]' : 'border-transparent bg-white hover:bg-gray-50')}`}>
              <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={toggleFollowGate}>
                <div className={`w-10 h-10 md:w-12 md:h-12 rounded-[14px] md:rounded-xl flex items-center justify-center shrink-0 border ${darkMode ? 'bg-white/10 border-white/10' : 'bg-gray-50 border-gray-100'}`}>
                  <Lock className={`w-4 h-4 md:w-5 md:h-5 ${darkMode ? 'text-white/60' : 'text-gray-500'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className={`font-bold text-[14px] md:text-[15px] ${darkMode ? 'text-white' : 'text-gray-900'}`}>Ask To Follow</h3>
                    <span className="bg-[#10b981] text-white text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 md:px-2 md:py-1 rounded-md uppercase tracking-wider">RECOMMENDED</span>
                    {!canUseAskToFollow && (
                      <span className="bg-purple-600 text-white text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 md:px-2 md:py-1 rounded-md uppercase tracking-wider">PREMIUM</span>
                    )}
                  </div>
                  <p className={`text-[11px] md:text-xs font-medium ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>Ask them to follow you before they receive the DM</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                  <input type="checkbox" className="sr-only peer" checked={hasFollowGate} readOnly />
                  <div className={`w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-purple-600 shadow-inner ${darkMode ? 'bg-white/10' : ''}`}></div>
                </label>
              </div>

              {/* Follow Gate Expanded config */}
              <AnimatePresence>
                {hasFollowGate && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                    <div className={`p-4 rounded-2xl border shadow-sm space-y-4 ${darkMode ? 'bg-transparent border-white/5' : 'bg-white border-purple-100'}`}>
                      <div className="space-y-2">
                        <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Initial Teaser Message</label>
                        <textarea
                          value={dmAction?.teaserMessage || ''}
                          onChange={(e) => updateDmAction({ teaserMessage: e.target.value })}
                          disabled={readOnly}
                          rows={2}
                          className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-medium text-sm transition-all resize-none ${darkMode ? 'border-white/10 bg-transparent text-white focus:border-purple-500/30' : 'border-gray-200 focus:border-purple-500 text-gray-900'}`}
                        />
                        <label className={`text-[10px] font-bold uppercase tracking-wide block mt-2 ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Teaser Button Text</label>
                        <input
                          type="text"
                          value={dmAction?.teaserBtnText || ''}
                          onChange={(e) => updateDmAction({ teaserBtnText: e.target.value })}
                          disabled={readOnly}
                          placeholder="e.g. Verify Follow 🔗"
                          className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-medium text-sm transition-all ${darkMode ? 'border-white/10 bg-white/5 text-white focus:border-white/20 placeholder:text-white/20' : 'border-gray-200 focus:border-purple-500 text-gray-900 placeholder:text-gray-300'}`}
                        />
                      </div>
                      <div className={cn("space-y-2 pt-8 mt-8 border-t-2 border-dashed", darkMode ? "border-white/10" : "border-gray-100")}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Verification Failed (Not Following)</label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className={cn("w-4 h-4 cursor-help transition-colors", darkMode ? "text-white/40 hover:text-white/60" : "text-slate-400 hover:text-slate-600")} />
                            </TooltipTrigger>
                            <TooltipContent side="right">This message is sent to users who click the button but aren't following you yet.</TooltipContent>
                          </Tooltip>
                        </div>
                        <textarea
                          value={dmAction?.askToFollowMessage || ''}
                          onChange={(e) => updateDmAction({ askToFollowMessage: e.target.value })}
                          disabled={readOnly}
                          rows={2}
                          className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-medium text-sm transition-all resize-none ${darkMode ? 'border-white/10 bg-white/5 text-white focus:border-white/20' : 'border-gray-200 focus:border-purple-500 text-gray-900'}`}
                        />
                        <label className={`text-[10px] font-bold uppercase tracking-wide block mt-2 ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Verification Button Text</label>
                        <input
                          type="text"
                          value={dmAction?.askToFollowBtnText || ''}
                          onChange={(e) => updateDmAction({ askToFollowBtnText: e.target.value })}
                          disabled={readOnly}
                          placeholder="e.g. I've Followed! ✅"
                          className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-medium text-sm transition-all ${darkMode ? 'border-white/10 bg-white/5 text-white focus:border-white/20 placeholder:text-white/20' : 'border-gray-200 focus:border-purple-500 text-gray-900 placeholder:text-gray-300'}`}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Send DM Toggle */}
          <div className={`rounded-2xl border-2 transition-all overflow-hidden ${hasDm ? (darkMode ? 'border-purple-500/30 bg-transparent' : 'border-purple-200 bg-purple-50/30') : (darkMode ? 'border-transparent bg-transparent hover:bg-white/[0.04]' : 'border-transparent bg-white hover:bg-gray-50')}`}>
            <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={toggleDm}>
              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-[14px] md:rounded-xl flex items-center justify-center shrink-0 border ${darkMode ? 'bg-white/10 border-white/10' : 'bg-gray-50 border-gray-100'}`}>
                <Send className={`w-4 h-4 md:w-5 md:h-5 ${darkMode ? 'text-white/60' : 'text-gray-500'}`} />
              </div>
              <div className="flex-1">
                <h3 className={`font-bold text-[14px] md:text-[15px] mb-0.5 md:mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Automated DM Message</h3>
                <p className={`text-[11px] md:text-xs font-medium ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>Send an automatic direct message to your leads</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={hasDm} readOnly />
                <div className={`w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-purple-600 shadow-inner ${darkMode ? 'bg-white/10' : ''}`}></div>
              </label>
            </div>

            {/* DM Expanded config */}
            <AnimatePresence>
              {hasDm && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                  <div className={`p-4 rounded-2xl border shadow-sm space-y-4 ${darkMode ? 'bg-transparent border-white/5' : 'bg-white border-purple-100'}`}>
                    <div className="space-y-2">
                      <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Direct Message Content</label>
                      <textarea
                        value={(dmAction?.title === OLD_DEFAULT_TITLE || !dmAction?.title) ? '' : dmAction.title}
                        onChange={(e) => updateDmAction({ title: e.target.value })}
                        disabled={readOnly}
                        rows={4}
                        placeholder="e.g. Hey! Thanks so much for your comment 💌 Everything’s been sent your way ✨"
                        className={`w-full border-2 rounded-xl px-4 py-3 outline-none font-medium text-base transition-all resize-none ${darkMode ? 'border-white/10 bg-transparent text-white placeholder:text-white/20 focus:border-purple-500/30' : 'border-gray-100 bg-gray-50 focus:bg-white text-gray-900 placeholder:text-gray-300 focus:border-purple-400'}`}
                      />
                      <p className={`text-right text-[10px] font-bold ${darkMode ? 'text-white/20' : 'text-gray-400'}`}>{(dmAction?.title || '').length} / 640</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Include Image</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={dmAction?.showImage || false}
                            onChange={(e) => updateDmAction({ showImage: e.target.checked })}
                            disabled={readOnly}
                          />
                          <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-purple-600 shadow-inner"></div>
                        </label>
                      </div>

                      <AnimatePresence>
                        {(dmAction?.showImage) && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="pt-1">
                              <input
                                type="url"
                                value={dmAction?.imageUrl || ''}
                                onChange={(e) => updateDmAction({ imageUrl: e.target.value })}
                                disabled={readOnly}
                                placeholder="https://yourapp.com/image.jpg"
                                className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-medium text-base transition-all ${darkMode ? 'border-white/10 bg-white/5 text-white focus:border-white/20 placeholder:text-white/20' : 'border-gray-200 bg-white text-gray-900 placeholder:text-gray-300 focus:border-purple-500'}`}
                              />
                              <p className={`text-[10px] mt-1 font-medium italic ${darkMode ? 'text-white/20' : 'text-gray-400'}`}>Make sure the URL is public and ends in .jpg, .png, etc.</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Action buttons simple list */}
                    <div className={`space-y-2 pt-2 border-t ${darkMode ? 'border-white/5' : 'border-gray-100'}`}>
                      <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Buttons (Max 3)</label>
                      {dmAction?.actionButtons.map((btn, i) => (
                        <div key={i} className={`flex flex-col gap-2 p-3 border rounded-xl ${darkMode ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-[10px] font-bold ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Button {i + 1}</span>
                            {!readOnly && (
                              <button onClick={() => updateDmAction({ actionButtons: dmAction.actionButtons.filter((_, idx) => idx !== i) })} className={`transition-colors ${darkMode ? 'text-white/60 hover:text-red-400' : 'text-gray-900 hover:text-red-500'}`}><X size={14} /></button>
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
                            className={`w-full border-2 rounded-lg px-3 py-1.5 outline-none font-medium text-base transition-all ${darkMode ? 'border-white/10 bg-white/5 text-white focus:border-white/20 placeholder:text-white/20' : 'border-gray-200 bg-white text-gray-900 focus:border-purple-500'}`}
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
                            className={`w-full border-2 rounded-lg px-3 py-1.5 outline-none font-medium text-base transition-all ${darkMode ? 'border-white/10 bg-white/5 text-white focus:border-white/20 placeholder:text-white/20' : 'border-gray-200 bg-white text-gray-900 focus:border-purple-500'}`}
                          />
                        </div>
                      ))}
                      {!readOnly && (dmAction?.actionButtons.length || 0) < 3 && (
                        <button onClick={() => updateDmAction({ actionButtons: [...(dmAction?.actionButtons || []), { id: Date.now().toString(), text: '', url: '', buttonType: 'web_url' }] })} className={`w-full py-2.5 border-2 border-dotted rounded-xl font-bold text-[13px] transition-all ${darkMode ? 'border-white/20 text-purple-400 hover:bg-white/5 hover:border-purple-400/50' : 'border-gray-400 text-purple-600 hover:bg-purple-50 hover:border-purple-200'}`}>
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
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`mt-4 p-4 border rounded-xl flex items-center gap-3 ${darkMode ? 'bg-orange-500/10 border-orange-500/20' : 'bg-orange-50 border-orange-100'}`}>
              <AlertCircle size={20} className="text-orange-500 shrink-0" />
              <p className={`font-bold text-sm leading-tight ${darkMode ? 'text-orange-400' : 'text-orange-800'}`}>
                {triggerType === 'post_comment'
                  ? "Please turn on at least one action above (Reply or DM) to continue."
                  : "Please turn on action above to continue."}
              </p>
            </motion.div>
          )}
          {hasReply && !isReplyValid && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`mt-4 p-4 border rounded-xl flex items-center gap-3 ${darkMode ? 'bg-orange-500/10 border-orange-500/20' : 'bg-orange-50 border-orange-100'}`}>
              <AlertCircle size={20} className="text-orange-500 shrink-0" />
              <p className={`font-bold text-sm leading-tight ${darkMode ? 'text-orange-400' : 'text-orange-800'}`}>Please enter at least one comment reply message.</p>
            </motion.div>
          )}
          {hasDm && !isDmValid && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`mt-4 p-4 border rounded-xl flex items-center gap-3 ${darkMode ? 'bg-orange-500/10 border-orange-500/20' : 'bg-orange-50 border-orange-100'}`}>
              <AlertCircle size={20} className="text-orange-500 shrink-0" />
              <p className={`font-bold text-sm leading-tight ${darkMode ? 'text-orange-400' : 'text-orange-800'}`}>Please fill in the Direct Message content.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Global Action Button (Launch) for Step 2 */}
      <div className="mt-8 flex justify-center pb-8 md:pb-0 w-full">
        {readOnly ? (
            <button disabled className={`w-full max-w-xl py-4 rounded-full font-bold text-lg flex justify-center items-center gap-2 transition-all shadow-none ${darkMode ? 'bg-white/5 text-white/20' : 'bg-gray-100 text-gray-400'}`}>
              View Only
            </button>
        ) : (
            <button
              onClick={onSave}
              disabled={!canSave || saving}
              className={`w-full max-w-xl py-4 rounded-full font-bold text-lg flex justify-center items-center gap-2 transition-all shadow-lg
                  ${canSave
                  ? (darkMode ? 'bg-gradient-to-r from-indigo-600 to-violet-700 text-white shadow-indigo-500/30 hover:brightness-110 hover:-translate-y-1' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-200 hover:shadow-xl hover:-translate-y-1')
                  : (darkMode ? 'bg-white/5 text-white/20 shadow-none' : 'bg-gray-100 text-gray-400 shadow-none')}`}
            >
              {saving ? 'Loading...' : 'Launch Automation'} {!saving && <Rocket className={`w-5 h-5 ${canSave ? "text-orange-400" : (darkMode ? "text-white/20" : "text-gray-400")}`} />}
            </button>
        )}
      </div>
    </div>
  );
}
