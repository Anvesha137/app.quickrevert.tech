import { useEffect } from 'react';
import { Send, MessageSquare, Lock, AlertCircle, Rocket, X, Plus, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TriggerType, Action, ReplyToCommentAction, SendDmAction } from '../../types/automation';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useUpgradeModal } from '../../contexts/UpgradeModalContext';

interface ActionConfigProps {
  triggerType: TriggerType;
  actions: Action[];
  onActionsChange: (actions: Action[]) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  readOnly?: boolean;
}

const DEFAULT_TEASER_MESSAGE = "Hey there! I'm so happy you're here... Click below and I'll send you the link in just a sec ✨";
const DEFAULT_NOT_FOLLOWING_MESSAGE = "Oops! Looks like you haven't followed me yet 👀...";
const DEFAULT_TEASER_BTN_TEXT = "Send Access";
const DEFAULT_VERIFY_BTN_TEXT = "I've Followed! ✅";

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
      onActionsChange([...actions, { 
        type: 'reply_to_comment', 
        replyTemplates: [
          'Check your DMs for the link! 👆',
          'Done! Please check your direct messages ✨',
          'Sent! You\'ll find the link in your DMs 📩',
          'Just sent you a DM with all the details! 🚀'
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
        title: 'Hey! Thanks for your comment so much. Here is the link you asked for...', 
        imageUrl: '', 
        subtitle: 'Powered By Quickrevert.tech', 
        messageTemplate: '', 
        actionButtons: [], 
        askToFollow: false, 
        showImage: false
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
        type: 'send_dm', 
        title: 'Hey! Thanks for your comment so much. Here is the link you asked for...', 
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
                            className={`w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 placeholder:text-gray-300 font-semibold text-base transition-all ${readOnly ? 'opacity-70 bg-gray-50 cursor-not-allowed' : ''}`}
                            placeholder="e.g. Check your DMs for the link!"
                          />
                          {replyAction.replyTemplates.length > 1 && !readOnly && (
                            <button onClick={() => updateReplyAction({ replyTemplates: replyAction.replyTemplates.filter((_, idx) => idx !== i) })} className="p-2 bg-gray-100 text-gray-900 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      {!readOnly && replyAction && replyAction.replyTemplates.length < 5 && (
                        <button onClick={() => updateReplyAction({ replyTemplates: [...replyAction.replyTemplates, ''] })} className="text-purple-600 font-bold text-[13px] flex items-center gap-1">
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
          {triggerType !== 'user_directed_messages' && (
            <div className={`rounded-xl md:rounded-2xl border-2 transition-all overflow-hidden ${hasFollowGate ? 'border-purple-200 bg-purple-50/30' : 'border-transparent bg-white hover:bg-gray-50'}`}>
              <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={toggleFollowGate}>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-[14px] md:rounded-xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                  <Lock className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-bold text-gray-900 text-[14px] md:text-[15px]">Ask To Follow</h3>
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
                          className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-sm transition-all resize-none"
                        />
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mt-2">Teaser Button Text</label>
                        <input
                          type="text"
                          value={dmAction?.teaserBtnText || ''}
                          onChange={(e) => updateDmAction({ teaserBtnText: e.target.value })}
                          disabled={readOnly}
                          placeholder="e.g. Verify Follow 🔗"
                          className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 placeholder:text-gray-300 font-medium text-sm transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Verification Failed (Not Following)</label>
                        <textarea
                          value={dmAction?.askToFollowMessage || ''}
                          onChange={(e) => updateDmAction({ askToFollowMessage: e.target.value })}
                          disabled={readOnly}
                          rows={2}
                          className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-sm transition-all resize-none"
                        />
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mt-2">Verification Button Text</label>
                        <input
                          type="text"
                          value={dmAction?.askToFollowBtnText || ''}
                          onChange={(e) => updateDmAction({ askToFollowBtnText: e.target.value })}
                          disabled={readOnly}
                          placeholder="e.g. I've Followed! ✅"
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
                        placeholder="e.g. Hey! Thanks for your comment so much. Here is the link you asked for..."
                        className="w-full border-2 border-gray-100 focus:border-purple-400 rounded-xl px-4 py-3 outline-none text-gray-900 placeholder:text-gray-300 font-medium text-base bg-gray-50 focus:bg-white transition-all resize-none"
                      />
                      <p className="text-right text-[10px] text-gray-400 font-bold">{(dmAction?.title || '').length} / 640</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Include Image</label>
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
                                className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-gray-900 font-medium text-base transition-all"
                              />
                              <p className="text-[10px] text-gray-400 mt-1 font-medium italic">Make sure the URL is public and ends in .jpg, .png, etc.</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Action buttons simple list */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Buttons (Max 3)</label>
                      {dmAction?.actionButtons.map((btn, i) => (
                        <div key={i} className="flex flex-col gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-gray-500">Button {i + 1}</span>
                            {!readOnly && (
                              <button onClick={() => updateDmAction({ actionButtons: dmAction.actionButtons.filter((_, idx) => idx !== i) })} className="text-gray-900 hover:text-red-500 transition-colors"><X size={14} /></button>
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
                            className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-3 py-1.5 outline-none text-gray-900 font-medium text-base transition-all"
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
                            className="w-full border-2 border-gray-200 focus:border-purple-500 rounded-lg px-3 py-1.5 outline-none text-gray-900 font-medium text-base transition-all"
                          />
                        </div>
                      ))}
                      {!readOnly && (dmAction?.actionButtons.length || 0) < 3 && (
                        <button onClick={() => updateDmAction({ actionButtons: [...(dmAction?.actionButtons || []), { id: Date.now().toString(), text: '', url: '', buttonType: 'web_url' }] })} className="w-full py-2.5 border-2 border-dotted border-gray-400 rounded-xl text-purple-600 font-bold text-[13px] hover:bg-purple-50 hover:border-purple-200 transition-all">
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
      <div className="fixed md:absolute bottom-16 md:bottom-0 left-0 right-0 px-5 md:px-12 bg-gradient-to-t from-white via-white to-transparent pt-16 pb-6 z-10 pointer-events-none flex justify-center">
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
    </div>
  );
}
