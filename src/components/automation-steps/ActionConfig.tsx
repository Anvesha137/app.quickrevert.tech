import { useEffect, useState } from 'react';
import { Send, MessageSquare, Mail, Lock, Rocket, X, Plus, Bot, Info, FileSpreadsheet, Image as ImageIcon, ChevronDown, ChevronUp, Globe, CheckCircle2, Smartphone, RotateCcw, User, Loader, Tag, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../ui/tooltip';
import { Skeleton } from '../ui/skeleton';
import { TriggerType, Action, ReplyToCommentAction, SendDmAction, SaveLeadAction, FollowUpAction, LeadMessages, DEFAULT_LEAD_MESSAGES } from '../../types/automation';
import { CAPABILITIES } from '../../constants/capabilities';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useUpgradeModal } from '../../contexts/UpgradeModalContext';
import { useTheme } from '../../contexts/ThemeContext';
import { MediaUpload } from '../ui/MediaUpload';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ActionConfigProps {
  triggerType: TriggerType;
  triggerConfig?: any;
  onTriggerConfigChange?: (config: any) => void;
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
const OLD_DEFAULT_TITLE = 'Hey! Thanks for your comment so much. Here is the link you asked for...';
const NEW_DEFAULT_TITLE = 'Hey! Thanks so much for your comment 💌 Everything’s been sent your way ✨';

export default function ActionConfig({ triggerType, triggerConfig, onTriggerConfigChange, actions, onActionsChange, onSave, saving, readOnly }: ActionConfigProps) {
  const { darkMode } = useTheme();
  const { 
    canUseAskToFollow, 
    canUseCarousel,
    canUseMenuFlow,
    canUseLeadManager,
    canUseFollowUpMsgs,
    maxCarouselCards,
    maxMenuFlowCards 
  } = useSubscription();
  const { openModal } = useUpgradeModal();

  const replyAction = actions.find(a => a.type === 'reply_to_comment') as ReplyToCommentAction | undefined;
  const dmAction = actions.find(a => a.type === 'send_dm') as SendDmAction | undefined;
  const leadAction = actions.find(a => a.type === 'save_lead') as SaveLeadAction | undefined;
  const followUpAction = actions.find(a => a.type === 'follow_up') as FollowUpAction | undefined;

  const caps = CAPABILITIES[triggerType] || CAPABILITIES.post_comment;
  const hasReply = !!replyAction;
  const hasDm = !!dmAction;
  const hasFollowGate = dmAction?.askToFollow || false;
  const hasLeadManager = leadAction?.enabled || false;
  const hasFollowUp = !!followUpAction && followUpAction.enabled;
  const [showLeadMessages, setShowLeadMessages] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);

  // 🔥 PERCEIVED PERFORMANCE: Dynamic Progress Bar Logic
  useEffect(() => {
    let interval: any;
    if (saving) {
      setLaunchProgress(0);
      let current = 0;
      interval = setInterval(() => {
        if (current < 70) {
          // Phase 1: Fast-forward to 70%
          current += Math.random() * 15;
          if (current > 70) current = 70;
        } else if (current < 98) {
          // Phase 2: Slow creep to 98%
          current += 0.2;
        }
        setLaunchProgress(current);
      }, 80);
    } else {
      setLaunchProgress(0);
      if (interval) clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [saving]);



  useEffect(() => {
    if (triggerType !== 'post_comment' && hasFollowGate) {
      updateDmAction({ askToFollow: false });
    }
    // Only re-run when triggerType or the follow-gate state changes, not on every actions change
  }, [triggerType, hasFollowGate]);

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
      onActionsChange(actions.filter(a => a.type !== 'send_dm'));
    } else {
      onActionsChange([...actions, {
        type: 'send_dm',
        dmType: 'simple',
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

  const toggleFollowGate = () => {
    if (readOnly) return;
    if (!canUseAskToFollow) {
      openModal();
      return;
    }

    if (triggerType === 'user_directed_messages' || triggerType === 'story_reply') {
      toast.error("Ask to Follow is only available for Post Comment triggers");
      return;
    }

    // Validation: Ask to Follow cannot work with Lead Manager
    if (!hasFollowGate && hasLeadManager) {
      toast.error("Ask to Follow + Lead Manager cannot be toggled on together");
      return;
    }

    if (!hasDm) {
      onActionsChange([...actions, {
        type: 'send_dm',
        dmType: 'simple',
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
    updateDmAction({
      askToFollow: !hasFollowGate,
      teaserMessage: !hasFollowGate ? DEFAULT_TEASER_MESSAGE : '',
      askToFollowMessage: !hasFollowGate ? DEFAULT_NOT_FOLLOWING_MESSAGE : '',
      teaserBtnText: !hasFollowGate ? DEFAULT_TEASER_BTN_TEXT : '',
      askToFollowBtnText: !hasFollowGate ? DEFAULT_VERIFY_BTN_TEXT : ''
    });
  };

  const toggleLeadManager = () => {
    if (readOnly) return;
    
    if (!canUseLeadManager) {
      openModal();
      return;
    }

    if (!hasLeadManager) {
      if (triggerType === 'post_comment') {
        if (hasFollowGate) {
          toast.error("Ask to Follow + Lead Manager cannot be toggled on together");
          return;
        }
        if (hasDm && dmAction?.dmType === 'conversation_flow') {
          toast.error("Lead Manager + Conversation Flow cannot be toggled on together");
          return;
        }
      }
    }

    if (hasLeadManager) {
      // Auto-disable follow-up if lead manager is turned off
      onActionsChange(actions.filter(a => a.type !== 'save_lead' && a.type !== 'follow_up'));
    } else {
      onActionsChange([...actions, {
        type: 'save_lead',
        enabled: true,
        tags: ['Offer Leads'],
        spreadsheetUrl: '',
        collectFields: ['name', 'email'],
        messages: { ...DEFAULT_LEAD_MESSAGES }
      } as SaveLeadAction]);
    }
  };

  const toggleFollowUp = () => {
    if (readOnly) return;
    
    if (!canUseFollowUpMsgs) {
      openModal();
      return;
    }
    
    if (!hasLeadManager) {
      toast.error("Follow Up messages can only be enabled when Lead Manager is ON");
      return;
    }

    if (hasFollowUp) {
      onActionsChange(actions.filter(a => a.type !== 'follow_up'));
    } else {
      onActionsChange([...actions, {
        type: 'follow_up',
        enabled: true,
        delayValue: 30,
        delayUnit: 'minutes',
        message: 'Hey! Just checking in to see if you had any other questions? 😊'
      } as FollowUpAction]);
    }
  };

  const updateDmAction = (updates: Partial<SendDmAction>) => {
    if (readOnly) return;

    // Validation: Switching to Conversation Flow while Lead Manager is on (Post Comment only)
    if (updates.dmType === 'conversation_flow' && triggerType === 'post_comment' && hasLeadManager) {
      toast.error("Lead Manager + Conversation Flow cannot be toggled on together");
      return;
    }

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

  const characterLimitExceeded = ((): { exceeded: boolean, reason?: string } => {
    // 1. Reply templates (1000 chars)
    if (replyAction) {
      for (const t of replyAction.replyTemplates) {
        if (t.length > 1000) return { exceeded: true, reason: 'Comment reply limit exceeded (1000)' };
      }
    }

    // 2. DM Message / Flow Opener (1000 chars)
    if (dmAction) {
      if ((dmAction.title || '').length > 1000) return { exceeded: true, reason: 'DM message limit exceeded (1000)' };

      // 3. Carousel Cards (400 chars for title/subtitle)
      if (dmAction.dmType === 'carousel' && dmAction.carouselCards) {
        for (const card of dmAction.carouselCards) {
          if ((card.title || '').length > 400) return { exceeded: true, reason: 'Carousel headline limit exceeded (400)' };
          if ((card.subtitle || '').length > 400) return { exceeded: true, reason: 'Carousel description limit exceeded (400)' };
        }
      }

      // 4. Conversation Flow (1000 chars for branch messages)
      if (dmAction.dmType === 'conversation_flow' && dmAction.conversationCards) {
        for (const card of dmAction.conversationCards) {
          if ((card.messageTemplate || '').length > 1000) return { exceeded: true, reason: 'Flow message limit exceeded (1000)' };
        }
      }
    }

    // 5. Follow Up (1000 chars)
    if (followUpAction && followUpAction.enabled) {
      if ((followUpAction.message || '').length > 1000) return { exceeded: true, reason: 'Follow-up message limit exceeded (1000)' };
    }

    return { exceeded: false };
  })();

  const isReplyValid = replyAction ? replyAction.replyTemplates.some(t => t.trim().length > 0) : true;
  const isDmValid = dmAction
    ? (dmAction.dmType === 'conversation_flow'
      ? (dmAction.title || '').trim().length > 0 &&
      (dmAction.actionButtons || []).every(btn => btn.text.trim().length > 0) &&
      (dmAction.conversationCards || []).every(card =>
        (card.messageTemplate || '').trim().length > 0 &&
        (card.actionButtons || []).every(btn =>
          btn.text.trim().length > 0 &&
          (btn.buttonType === 'postback' || /^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url || ''))
        )
      )
      : dmAction.dmType === 'carousel'
        ? (dmAction.carouselCards || []).length > 0 && (dmAction.carouselCards || []).every(card =>
          card.title.trim().length > 0 &&
          (card.buttons || []).every(btn => btn.text.trim().length > 0 && /^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url || ''))
        )
        : (dmAction.title || '').trim().length > 0 && (dmAction.actionButtons || []).every(btn => btn.text.trim().length > 0 && (btn.buttonType === 'postback' || /^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url || '')))
    )
    : true;
  const isFollowUpValid = hasFollowUp ? (followUpAction?.message || '').trim().length > 0 : true;
  const canSave = actions.length > 0 && isReplyValid && isDmValid && isFollowUpValid && !characterLimitExceeded.exceeded;


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

        {/* CARD 1: Public Reply */}
        {caps.publicReply && (
          <div className={cn("p-1.5 md:p-2 mb-4 space-y-1.5 md:space-y-2 transition-colors duration-300", darkMode ? "" : "bg-white border-2 border-purple-100 rounded-[1.5rem]")}>
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
          </div>
        )}

        {/* CARD 2: Ask to Follow (Follow Gate) */}
        {caps.askToFollow && (
          <div className={cn(
            "rounded-[1.5rem] border-2 transition-all overflow-hidden mb-4",
            hasFollowGate
              ? (darkMode ? "border-purple-500/30 bg-purple-500/10" : "border-purple-200 bg-purple-50/50")
              : (darkMode ? "border-white/5 bg-transparent" : "border-gray-100 bg-white")
          )}>
            <div className="p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={toggleFollowGate}>
              <div className={cn(
                "w-10 h-10 md:w-12 md:h-12 rounded-[14px] md:rounded-xl flex items-center justify-center shrink-0 border",
                darkMode ? "bg-white/10 border-white/10" : "bg-white border-gray-100 shadow-sm"
              )}>
                <Lock className={cn("w-4 h-4 md:w-5 md:h-5", darkMode ? "text-white/60" : "text-gray-500")} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className={cn("font-bold text-[14px] md:text-[15px]", darkMode ? "text-white" : "text-gray-900")}>Ask to Follow First</h3>
                  {!canUseAskToFollow && (
                    <span className="bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                      <Lock size={8} /> PREMIUM
                    </span>
                  )}
                  <span className="bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tight">Recommended</span>
                </div>
                <p className={cn("text-[11px] md:text-xs font-medium leading-tight", darkMode ? "text-white/40" : "text-gray-500")}>Protect your automation — only send the DM after they follow your account</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={hasFollowGate} readOnly />
                <div className={cn(
                  "w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-purple-600 shadow-inner",
                  darkMode && "bg-white/20"
                )}></div>
              </label>
            </div>

            <AnimatePresence>
              {hasFollowGate && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                  <div className={cn("p-4 rounded-2xl border shadow-sm space-y-4", darkMode ? "bg-black/20 border-white/5" : "bg-white border-purple-100")}>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={cn("text-[10px] font-bold uppercase tracking-wide", darkMode ? "text-white/40" : "text-gray-500")}>Initial Teaser Message</label>
                        <textarea value={dmAction?.teaserMessage || ''} onChange={(e) => updateDmAction({ teaserMessage: e.target.value })} disabled={readOnly} rows={2} className={cn("w-full border-2 rounded-xl px-4 py-2 outline-none font-medium text-sm transition-all resize-none", darkMode ? "border-white/10 bg-transparent text-white focus:border-purple-500/30" : "border-gray-200 focus:border-purple-500 text-gray-900")} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={cn("text-[10px] font-bold uppercase tracking-wide", darkMode ? "text-white/40" : "text-gray-500")}>Teaser Button Text</label>
                        <input type="text" value={dmAction?.teaserBtnText || ''} onChange={(e) => updateDmAction({ teaserBtnText: e.target.value })} disabled={readOnly} placeholder="e.g. Send Access" className={cn("w-full border-2 rounded-xl px-4 py-2 outline-none font-medium text-sm transition-all", darkMode ? "border-white/10 bg-white/5 text-white focus:border-white/20" : "border-gray-200 focus:border-purple-500 text-gray-900")} />
                      </div>
                    </div>

                    <div className={cn("pt-4 mt-4 border-t", darkMode ? "border-white/10" : "border-gray-100")}>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <label className={cn("text-[10px] font-bold uppercase tracking-wide", darkMode ? "text-white/40" : "text-gray-500")}>Verification Failed (Not Following)</label>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className={cn("w-3.5 h-3.5 cursor-help transition-colors", darkMode ? "text-white/40 hover:text-white/60" : "text-slate-400 hover:text-slate-600")} />
                              </TooltipTrigger>
                              <TooltipContent side="right">This message is sent to users who click the button but aren't following you yet.</TooltipContent>
                            </Tooltip>
                          </div>
                          <textarea value={dmAction?.askToFollowMessage || ''} onChange={(e) => updateDmAction({ askToFollowMessage: e.target.value })} disabled={readOnly} rows={2} className={cn("w-full border-2 rounded-xl px-4 py-2 outline-none font-medium text-sm transition-all resize-none", darkMode ? "border-white/10 bg-transparent text-white focus:border-purple-500/30" : "border-gray-200 focus:border-purple-500 text-gray-900")} />
                        </div>
                        <div className="space-y-1.5">
                          <label className={cn("text-[10px] font-bold uppercase tracking-wide", darkMode ? "text-white/40" : "text-gray-500")}>Verification Button Text</label>
                          <input type="text" value={dmAction?.askToFollowBtnText || ''} onChange={(e) => updateDmAction({ askToFollowBtnText: e.target.value })} disabled={readOnly} placeholder="e.g. I've Followed! ✅" className={cn("w-full border-2 rounded-xl px-4 py-2 outline-none font-medium text-sm transition-all", darkMode ? "border-white/10 bg-white/5 text-white focus:border-white/20" : "border-gray-200 focus:border-purple-500 text-gray-900")} />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* CARD 3: Automated DM Message */}
        {caps.dm && (
          <div className={`p-1.5 md:p-2 mb-4 space-y-1.5 md:space-y-2 transition-colors duration-300 ${darkMode ? '' : 'bg-white border-2 border-purple-100 rounded-[1.5rem]'}`}>
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

              <AnimatePresence>
                {hasDm && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                    <div className={`p-4 rounded-2xl border shadow-sm space-y-4 ${darkMode ? 'bg-transparent border-white/5' : 'bg-white border-purple-100'}`}>

                      {/* DM Type Selector */}
                      <div className="space-y-2 mb-4">
                        <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Choose DM Format</label>
                        <div className="flex flex-col md:flex-row gap-2">
                          {['simple', 'carousel', 'conversation_flow'].map((type) => {
                            const isSelected = (dmAction?.dmType || 'simple') === type;
                            const isSupported = type === 'simple' ? caps.dm : (type === 'carousel' ? caps.carousel : caps.convFlow);
                            
                            // Feature flag checks
                            const isLocked = (type === 'carousel' && !canUseCarousel) || (type === 'conversation_flow' && !canUseMenuFlow);

                            if (!isSupported && !isLocked) return null;
                            return (
                              <button
                                key={type}
                                onClick={() => isLocked ? openModal() : updateDmAction({ dmType: type as any })}
                                disabled={readOnly}
                                className={cn(
                                  "flex-1 py-2 px-3 rounded-xl border-2 font-bold text-[13px] transition-all flex items-center justify-center gap-2",
                                  isSelected
                                    ? (darkMode ? "border-purple-500 bg-purple-500/20 text-purple-300" : "border-purple-600 bg-purple-50 text-purple-700")
                                    : (darkMode ? "border-white/10 bg-white/5 text-white/40 hover:bg-white/10" : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"),
                                  isLocked && "opacity-80 grayscale-[0.5]"
                                )}
                              >
                                {isLocked && <Lock size={12} className="text-purple-500" />}
                                {type === 'simple' && 'Simple Message'}
                                {type === 'carousel' && 'Carousel Engine'}
                                {type === 'conversation_flow' && 'Menu Flow'}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* CONVERSATION FLOW DESIGN */}
                      {/* CONVERSATION FLOW DESIGN (Flat Card Architecture) */}
                      {dmAction?.dmType === 'conversation_flow' && (
                        <div className="space-y-8 pt-2">
                          {/* Modern Status Header */}
                          <div className={cn("flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-[2rem] border transition-all", darkMode ? "bg-white/5 border-white/10 shadow-2xl" : "bg-white border-purple-100 shadow-xl shadow-purple-500/5")}>
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                                <Bot size={24} />
                              </div>
                              <div>
                                <h4 className={cn("text-base font-black tracking-tight", darkMode ? "text-white" : "text-gray-900")}>Menu Flow Engine</h4>
                                <div className="flex items-center gap-2">
                                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  <p className={cn("text-[10px] font-bold uppercase tracking-wider opacity-40")}>Active • 2 Postbacks Max</p>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 bg-gray-50 dark:bg-white/5 p-2 rounded-2xl border border-gray-100 dark:border-white/5">
                              <div className="px-4 text-center border-r border-gray-200 dark:border-white/10">
                                <p className="text-[9px] font-black uppercase text-gray-400">Total Cards</p>
                                <p className={cn("text-sm font-black", (1 + (dmAction.conversationCards?.length || 0)) >= (maxMenuFlowCards + 1) ? "text-red-500" : "text-purple-600")}>
                                  {1 + (dmAction.conversationCards?.length || 0)} <span className="opacity-30">/ {maxMenuFlowCards + 1}</span>
                                </p>
                              </div>
                              <div className="px-4 text-center">
                                <p className="text-[9px] font-black uppercase text-gray-400">Routes</p>
                                <p className="text-sm font-black opacity-60">
                                  {dmAction.actionButtons.filter(b => b.buttonType === 'postback').length +
                                    (dmAction.conversationCards?.reduce((acc, c) => acc + c.actionButtons.filter(b => b.buttonType === 'postback').length, 0) || 0)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Level 0: Global Opener (Always Visible) */}
                          <div className={cn("p-8 rounded-[2.5rem] border-2 transition-all relative", darkMode ? "bg-black/20 border-white/5" : "bg-white border-gray-100 shadow-sm")}>
                            <div className="flex justify-between items-center mb-8">
                              <div className="flex items-center gap-3">
                                <div className="px-3 py-1 bg-purple-600 text-white text-[10px] font-black rounded-lg">LEVEL 0</div>
                                <h5 className={cn("text-sm font-black uppercase tracking-widest", darkMode ? "text-white/60" : "text-gray-400")}>Opening Message</h5>
                              </div>
                              <span className={cn("text-[9px] font-bold opacity-30")}>{(dmAction.title || '').length} / 1000</span>
                            </div>

                            <div className="space-y-8">
                              <div className="text-center space-y-4">
                                <textarea
                                  value={dmAction.title || ''}
                                  onChange={(e) => updateDmAction({ title: e.target.value })}
                                  placeholder="Hey! Welcome 👋 How can we help you today?"
                                  className={cn("w-full bg-transparent border-none outline-none text-center font-bold text-lg resize-none placeholder:opacity-20 mt-4", darkMode ? "text-white" : "text-gray-800")}
                                  rows={2}
                                />
                                <div className="h-px w-24 bg-purple-200 dark:bg-white/10 mx-auto mt-4"></div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {dmAction.actionButtons.map((btn, i) => {
                                const postbackCount = dmAction.actionButtons.filter(b => b.buttonType === 'postback').length;
                                const canBePostback = btn.buttonType === 'postback' || postbackCount < 2;

                                return (
                                  <div key={btn.id} className={cn("p-5 rounded-3xl border-2 transition-all relative group", darkMode ? "bg-white/5 border-white/5 hover:border-purple-500/50" : "bg-gray-50/50 border-gray-100 hover:border-purple-200 hover:bg-white")}>
                                    <button
                                      onClick={() => {
                                        const filteredBtns = dmAction.actionButtons.filter(b => b.id !== btn.id);
                                        const filteredCards = (dmAction.conversationCards || []).filter(c => c.id !== btn.payload);
                                        updateDmAction({
                                          actionButtons: filteredBtns,
                                          conversationCards: filteredCards
                                        });
                                      }}
                                      className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                    >
                                      <X size={14} />
                                    </button>

                                    <input
                                      value={btn.text}
                                      onChange={(e) => {
                                        const btns = [...dmAction.actionButtons];
                                        btns[i].text = e.target.value;
                                        updateDmAction({ actionButtons: btns });
                                      }}
                                      placeholder="Label"
                                      className="w-full bg-transparent border-b border-gray-200 dark:border-white/10 outline-none text-sm font-black pb-2 mb-4 focus:border-purple-500 text-center"
                                    />

                                    <div className="flex bg-gray-200/50 dark:bg-black/20 p-1 rounded-2xl mb-4 border border-gray-200 dark:border-white/5">
                                      <button
                                        onClick={() => {
                                          const btns = [...dmAction.actionButtons];
                                          const pbId = `PB_L1_${i + 1}_${Date.now()}`;
                                          btns[i].buttonType = 'postback';
                                          btns[i].payload = pbId;

                                          // Auto-add Card
                                          const currentCards = dmAction.conversationCards || [];
                                          if (!currentCards.find(c => c.id === pbId)) {
                                            updateDmAction({
                                              actionButtons: btns,
                                              conversationCards: [...currentCards, { id: pbId, title: btn.text, messageTemplate: '', actionButtons: [] }]
                                            });
                                          } else {
                                            updateDmAction({ actionButtons: btns });
                                          }
                                        }}
                                        disabled={!canBePostback}
                                        className={cn("flex-1 py-2 rounded-xl text-[9px] font-black uppercase transition-all", btn.buttonType === 'postback' ? "bg-white text-purple-600 shadow-sm" : "text-gray-400 hover:bg-white/10 disabled:opacity-20")}
                                      >
                                        Step
                                      </button>
                                      <button
                                        onClick={() => {
                                          const btns = [...dmAction.actionButtons];
                                          const oldPayload = btns[i].payload;
                                          btns[i].buttonType = 'web_url';

                                          // Auto-remove Card
                                          const currentCards = (dmAction.conversationCards || []).filter(c => c.id !== oldPayload);
                                          updateDmAction({ actionButtons: btns, conversationCards: currentCards });
                                        }}
                                        className={cn("flex-1 py-2 rounded-xl text-[9px] font-black uppercase transition-all", btn.buttonType === 'web_url' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:bg-white/10")}
                                      >
                                        Link
                                      </button>
                                    </div>

                                    {btn.buttonType === 'web_url' ? (
                                      <input
                                        value={btn.url}
                                        onChange={(e) => {
                                          const btns = [...dmAction.actionButtons];
                                          btns[i].url = e.target.value;
                                          updateDmAction({ actionButtons: btns });
                                        }}
                                        placeholder="https://..."
                                        className="w-full bg-transparent border-b border-gray-200 dark:border-white/10 outline-none text-[11px] font-medium text-blue-500 text-center"
                                      />
                                    ) : (
                                      <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-purple-500 animate-pulse">
                                        <Bot size={12} /> BRANCH {i + 1}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {dmAction.actionButtons.length < 3 && (
                                <button
                                  onClick={() => updateDmAction({
                                    actionButtons: [...dmAction.actionButtons, { id: `BTN_${Date.now()}`, text: '', url: '', buttonType: 'web_url' }]
                                  })}
                                  className={cn("p-6 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all hover:bg-purple-50 hover:border-purple-200", darkMode ? "border-white/10 hover:bg-white/5" : "border-gray-200 text-gray-300")}
                                >
                                  <Plus size={20} />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Add Item</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Response Cards Symmetrical Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                            {/* Vertical Line for Tree View */}
                            <div className="hidden md:block absolute -top-8 left-1/2 -ml-0.5 w-1 h-8 bg-purple-100 dark:bg-white/5"></div>

                            {(dmAction.conversationCards || []).map((card, cardIndex) => {
                              // Find which button triggers this card to show a clear label
                              const parentButton = [
                                ...dmAction.actionButtons,
                                ...(dmAction.conversationCards?.flatMap(c => c.actionButtons) || [])
                              ].find(b => b.payload === card.id);

                              return (
                                <div key={card.id} className="space-y-4">
                                  <div className={cn("p-8 rounded-[2.5rem] border-2 transition-all relative group", darkMode ? "bg-black/40 border-white/10" : "bg-white border-purple-100 shadow-lg shadow-purple-500/5 hover:border-purple-300")}>
                                    <div className="flex justify-between items-center mb-6">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-black text-[10px] shadow-lg shadow-purple-500/20">BR</div>
                                        <div>
                                          <h4 className={cn("text-xs font-black uppercase tracking-widest", darkMode ? "text-white" : "text-gray-900")}>
                                            Branch: <span className="text-purple-500">{parentButton?.text || "Untitled"}</span>
                                          </h4>
                                          <p className="text-[9px] font-bold text-gray-400">Triggered by "{parentButton?.text || "New Button"}"</p>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          // Find and toggle the parent button back to link
                                          const btns = [...dmAction.actionButtons];
                                          const l0Btn = btns.find(b => b.payload === card.id);
                                          if (l0Btn) {
                                            l0Btn.buttonType = 'web_url';
                                            const filteredCards = (dmAction.conversationCards || []).filter(c => c.id !== card.id);
                                            updateDmAction({ actionButtons: btns, conversationCards: filteredCards });
                                          } else {
                                            // Handle sub-card deletion via parent button toggle
                                            const newCards = [...(dmAction.conversationCards || [])];
                                            newCards.forEach(c => {
                                              const b = c.actionButtons.find(ab => ab.payload === card.id);
                                              if (b) b.buttonType = 'web_url';
                                            });
                                            const filteredCards = newCards.filter(c => c.id !== card.id);
                                            updateDmAction({ conversationCards: filteredCards });
                                          }
                                        }}
                                        className="text-red-400 hover:text-red-500 transition-colors bg-red-50 dark:bg-red-500/10 p-2 rounded-xl"
                                      >
                                        <X size={16} />
                                      </button>
                                    </div>

                                    <div className="space-y-6">
                                      <div className="flex items-center justify-between mb-2 px-1">
                                        <label className={cn("text-[9px] font-black uppercase tracking-wider opacity-40")}>Response Message</label>
                                        <span className={cn("text-[9px] font-bold opacity-30")}>{(card.messageTemplate || '').length} / 1000</span>
                                      </div>
                                      <textarea
                                        value={card.messageTemplate || ''}
                                        onChange={(e) => {
                                          const newCards = [...(dmAction.conversationCards || [])];
                                          newCards[cardIndex] = { ...newCards[cardIndex], messageTemplate: e.target.value };
                                          updateDmAction({ conversationCards: newCards });
                                        }}
                                        placeholder="Reply message text..."
                                        className={cn("w-full p-4 rounded-2xl border-2 min-h-[100px] outline-none transition-all font-medium text-sm text-center", darkMode ? "bg-white/5 border-white/10 text-white focus:border-purple-500" : "bg-gray-50 border-gray-100 focus:bg-white focus:border-purple-500")}
                                      />

                                      {/* Branching Buttons (2 Postback Limit) */}
                                      <div className="grid grid-cols-3 gap-3">
                                        {card.actionButtons.map((btn, btnIdx) => {
                                          const postbackCount = card.actionButtons.filter(b => b.buttonType === 'postback').length;
                                          const canBePostback = btn.buttonType === 'postback' || postbackCount < 2;

                                          return (
                                            <div key={btn.id} className={cn("p-4 rounded-2xl border-2 bg-gray-50/50", darkMode ? "bg-white/5 border-white/5" : "border-gray-50")}>
                                              <input
                                                value={btn.text}
                                                onChange={(e) => {
                                                  const newCards = [...(dmAction.conversationCards || [])];
                                                  newCards[cardIndex].actionButtons[btnIdx].text = e.target.value;
                                                  updateDmAction({ conversationCards: newCards });
                                                }}
                                                className="w-full bg-transparent border-b border-gray-200 dark:border-white/10 outline-none text-[11px] font-bold mb-3 text-center"
                                              />
                                              <div className="flex bg-black/5 dark:bg-black/20 p-0.5 rounded-xl mb-2 relative group/btn">
                                                {/* Delete Button for sub-buttons */}
                                                <button
                                                  onClick={() => {
                                                    const newCards = [...(dmAction.conversationCards || [])];
                                                    const deletedBtn = newCards[cardIndex].actionButtons[btnIdx];
                                                    newCards[cardIndex].actionButtons.splice(btnIdx, 1);
                                                    const filteredCards = newCards.filter(c => c.id !== deletedBtn.payload);
                                                    updateDmAction({ conversationCards: filteredCards });
                                                  }}
                                                  className="absolute -top-6 -right-1 w-5 h-5 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition-opacity"
                                                >
                                                  <X size={10} />
                                                </button>

                                                <button
                                                  disabled={!canBePostback || (dmAction.conversationCards?.length || 0) >= 10}
                                                  onClick={() => {
                                                    const newCards = [...(dmAction.conversationCards || [])];
                                                    const pbId = `PB_SUB_${cardIndex}_${btnIdx}_${Date.now()}`;
                                                    newCards[cardIndex].actionButtons[btnIdx].buttonType = 'postback';
                                                    newCards[cardIndex].actionButtons[btnIdx].payload = pbId;

                                                    // Auto-spawn child card
                                                    if (!newCards.find(c => c.id === pbId)) {
                                                      updateDmAction({
                                                        conversationCards: [...newCards, { id: pbId, title: btn.text, messageTemplate: '', actionButtons: [] }]
                                                      });
                                                    } else {
                                                      updateDmAction({ conversationCards: newCards });
                                                    }
                                                  }}
                                                  className={cn("flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase transition-all", btn.buttonType === 'postback' ? "bg-white text-purple-600 shadow-sm" : "text-gray-400 hover:bg-white/20")}
                                                >
                                                  Step
                                                </button>
                                                <button
                                                  onClick={() => {
                                                    const newCards = [...(dmAction.conversationCards || [])];
                                                    const oldPayload = newCards[cardIndex].actionButtons[btnIdx].payload;
                                                    newCards[cardIndex].actionButtons[btnIdx].buttonType = 'web_url';

                                                    // Auto-remove child card
                                                    const filteredCards = newCards.filter(c => c.id !== oldPayload);
                                                    updateDmAction({ conversationCards: filteredCards });
                                                  }}
                                                  className={cn("flex-1 py-1.5 rounded-lg text-[8px] font-bold uppercase transition-all", btn.buttonType === 'web_url' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:bg-white/20")}
                                                >
                                                  Link
                                                </button>
                                              </div>
                                              {btn.buttonType === 'web_url' ? (
                                                <input
                                                  value={btn.url}
                                                  onChange={(e) => {
                                                    const newCards = [...(dmAction.conversationCards || [])];
                                                    newCards[cardIndex].actionButtons[btnIdx].url = e.target.value;
                                                    updateDmAction({ conversationCards: newCards });
                                                  }}
                                                  placeholder="URL"
                                                  className="w-full bg-transparent border-b border-gray-100 outline-none text-[8px] text-center text-blue-500"
                                                />
                                              ) : (
                                                <div className="text-[9px] font-bold text-center text-emerald-500 italic">Adds Card</div>
                                              )}
                                            </div>
                                          );
                                        })}
                                        {card.actionButtons.length < 3 && (
                                          <button
                                            onClick={() => {
                                              const newCards = [...(dmAction.conversationCards || [])];
                                              newCards[cardIndex].actionButtons.push({ id: `CARD_BTN_${Date.now()}`, text: '', url: '', buttonType: 'web_url' });
                                              updateDmAction({ conversationCards: newCards });
                                            }}
                                            className="p-3 border-2 border-dashed rounded-2xl flex items-center justify-center text-gray-300 hover:text-purple-500 transition-colors"
                                          >
                                            <Plus size={16} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Global Message for capacity */}
                            {(dmAction.conversationCards?.length || 0) >= maxMenuFlowCards && (
                              <div className="col-span-full p-6 rounded-3xl bg-red-500/10 border border-red-500/20 text-center">
                                <p className="text-xs font-black text-red-500 uppercase tracking-widest italic">{maxMenuFlowCards + 1} Card Limit Active</p>
                                <p className="text-[10px] font-bold text-red-400/80">Remaining buttons must be Links to save space.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* SIMPLE DM BUILDER */}
                      {((dmAction?.dmType as any) === 'simple') && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Direct Message Content</label>
                            <textarea
                              value={(dmAction?.title === OLD_DEFAULT_TITLE || !dmAction?.title) ? '' : dmAction.title}
                              onChange={(e) => updateDmAction({ title: e.target.value })}
                              disabled={readOnly}
                              rows={4}
                              placeholder="e.g. Hey! Thanks so much for your comment 💌 Everything’s been sent your way ✨"
                              className={cn("w-full border-2 rounded-xl px-4 py-3 outline-none font-medium text-base transition-all resize-none", (dmAction?.title || '').length > 1000 ? (darkMode ? "text-white/20 border-white/5" : "text-black/20 border-black/5") : (darkMode ? 'border-white/10 bg-transparent text-white placeholder:text-white/20 focus:border-purple-500/30' : 'border-gray-100 bg-gray-50 focus:bg-white text-gray-900 placeholder:text-gray-300 focus:border-purple-400'))}
                            />
                            <p className={cn("text-right text-[10px] font-bold transition-all", (dmAction?.title || '').length > 1000 ? (darkMode ? "text-white/10" : "text-black/10") : (darkMode ? 'text-white/20' : 'text-gray-400'))}>{(dmAction?.title || '').length} / 1000</p>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ImageIcon className={cn("w-3.5 h-3.5", darkMode ? "text-white/40" : "text-gray-400")} />
                                <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Include Attachment (Image)</label>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="sr-only peer"
                                  checked={dmAction?.showImage || false}
                                  onChange={(e) => updateDmAction({ showImage: e.target.checked })}
                                  disabled={readOnly}
                                />
                                <div className={cn(
                                  "w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 shadow-inner",
                                  darkMode && "bg-white/10"
                                )}></div>
                              </label>
                            </div>

                            <AnimatePresence>
                              {(dmAction?.showImage) && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                  <div className="pt-1">
                                    <div className="space-y-4">
                                      {dmAction.imageUrl ? (
                                        <div className={cn(
                                          "w-full max-w-[280px] rounded-xl overflow-hidden border-2 transition-all relative flex items-center justify-center bg-black/5 mx-auto md:mx-0 group",
                                          darkMode ? "border-white/10" : "border-gray-200 shadow-sm"
                                        )}>
                                          <img
                                            src={dmAction.imageUrl}
                                            className="w-full h-auto max-h-[350px] object-contain"
                                            alt="DM Attachment"
                                          />
                                          {/* Top-right Remove Button */}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              updateDmAction({ imageUrl: '' });
                                            }}
                                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:bg-red-600 transition-all z-20 opacity-0 group-hover:opacity-100"
                                            title="Remove Image"
                                          >
                                            <X className="w-4 h-4" />
                                          </button>

                                          {/* Bottom Replace Label */}
                                          <div className="absolute inset-x-0 bottom-0 bg-black/40 py-1 text-[8px] font-black text-white text-center opacity-0 group-hover:opacity-100 transition-all uppercase tracking-widest font-sans">
                                            Click X to remove
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <MediaUpload
                                            onUploadSuccess={(url) => updateDmAction({ imageUrl: url })}
                                            readOnly={readOnly}
                                          />
                                          <div className="flex items-center gap-2">
                                            <div className="h-px flex-1 bg-gray-100 dark:bg-white/5" />
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">or paste URL</span>
                                            <div className="h-px flex-1 bg-gray-100 dark:bg-white/5" />
                                          </div>
                                          <input
                                            type="url"
                                            value={dmAction?.imageUrl || ''}
                                            onChange={(e) => updateDmAction({ imageUrl: e.target.value })}
                                            disabled={readOnly}
                                            placeholder="https://yourapp.com/image.jpg"
                                            className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none font-medium text-base transition-all ${darkMode ? 'border-white/10 bg-white/5 text-white focus:border-white/20 placeholder:text-white/20' : 'border-gray-200 bg-white text-gray-900 placeholder:text-gray-300 focus:border-purple-500'}`}
                                          />
                                        </>
                                      )}
                                      {!dmAction.imageUrl && (
                                        <p className={`text-[10px] mt-1 font-medium italic ${darkMode ? 'text-white/20' : 'text-gray-400'}`}>Make sure the URL is public and ends in .jpg, .png, etc.</p>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          <div className={`space-y-2 pt-2 border-t ${darkMode ? 'border-white/5' : 'border-gray-100'}`}>
                            <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Buttons (Max 3)</label>
                            {dmAction?.actionButtons.map((btn, i) => (
                              <div key={i} className="space-y-2">
                                <div className={`flex flex-col gap-2 p-3 border rounded-xl ${darkMode ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
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
                                  <div className="relative">
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
                                      className={`w-full border-2 rounded-lg px-3 py-1.5 outline-none font-medium text-base transition-all ${darkMode ? 'border-white/10 bg-white/5 text-white focus:border-white/20 placeholder:text-white/20' : 'border-gray-200 bg-white text-gray-900 focus:border-purple-500'} ${btn.url && !/^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url) ? 'border-red-500 focus:border-red-500' : ''}`}
                                    />
                                    {btn.url && !/^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(:\d{1,5})?(\/.*)?$/i.test(btn.url) && (
                                      <p className="text-[10px] text-red-500 font-bold mt-1">Invalid URL</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {!readOnly && (dmAction?.actionButtons.length || 0) < 3 && (
                              <button onClick={() => updateDmAction({ actionButtons: [...(dmAction?.actionButtons || []), { id: Date.now().toString(), text: '', url: '', buttonType: 'web_url' }] })} className={`w-full py-2.5 border-2 border-dotted rounded-xl font-bold text-[13px] transition-all ${darkMode ? 'border-white/20 text-purple-400 hover:bg-white/5 hover:border-purple-400/50' : 'border-gray-400 text-purple-600 hover:bg-purple-50 hover:border-purple-200'}`}>
                                + Add Link Button
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Carousel UI Manager */}
                      {((dmAction?.dmType as any) === 'carousel') && (
                        <div className="space-y-6">
                          <div className="flex items-center justify-between">
                            <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>
                              Carousel Cards ({(dmAction?.carouselCards?.length || 0)}/{maxCarouselCards})
                            </label>
                            {!readOnly && (dmAction?.carouselCards?.length || 0) < maxCarouselCards && (
                              <button
                                onClick={() => {
                                  updateDmAction({
                                    carouselCards: [...(dmAction.carouselCards || []), { id: `SLIDE_${Date.now()}`, title: '', imageUrl: '', buttons: [] }]
                                  });
                                }}
                                className={`text-[11px] font-bold flex items-center gap-1 transition-colors ${darkMode ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600'}`}>
                                <Plus size={14} /> Add Card
                              </button>
                            )}
                          </div>

                          <div className="relative">
                            <div className="flex gap-6 overflow-x-auto custom-scrollbar-hide pb-8 px-2 snap-x snap-mandatory scroll-smooth">
                              {(dmAction?.carouselCards || []).map((card, i) => (
                                <div key={card.id} className={cn(
                                  "shrink-0 w-[280px] rounded-[2rem] border-2 transition-all relative snap-start overflow-hidden flex flex-col",
                                  darkMode ? "bg-white/[0.03] border-white/10" : "bg-white border-purple-100 shadow-xl shadow-purple-500/5"
                                )}>
                                  {/* Fixed Square Image Area */}
                                  <div className="aspect-square w-full relative bg-black/20 overflow-hidden">
                                    {card.imageUrl ? (
                                      <img src={card.imageUrl} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 opacity-20">
                                        <ImageIcon className="w-10 h-10" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Square Image</span>
                                      </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col gap-3">
                                      <MediaUpload
                                        label={card.imageUrl ? "Replace Image" : "Upload Image"}
                                        onUploadSuccess={(url) => {
                                          const newCards = [...dmAction!.carouselCards!];
                                          newCards[i] = { ...newCards[i], imageUrl: url };
                                          updateDmAction({ carouselCards: newCards });
                                        }}
                                        readOnly={readOnly}
                                        className="w-full"
                                      />
                                      {!card.imageUrl && (
                                        <input
                                          type="url"
                                          value={card.imageUrl || ''}
                                          onChange={(e) => {
                                            const newCards = [...dmAction!.carouselCards!];
                                            newCards[i] = { ...newCards[i], imageUrl: e.target.value };
                                            updateDmAction({ carouselCards: newCards });
                                          }}
                                          placeholder="or paste URL..."
                                          className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-white/40 outline-none focus:border-purple-400 transition-all font-medium"
                                        />
                                      )}
                                    </div>

                                    {!readOnly && (
                                      <button
                                        onClick={() => {
                                          const newCards = dmAction!.carouselCards!.filter((_, idx) => idx !== i);
                                          updateDmAction({ carouselCards: newCards });
                                        }}
                                        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-red-500 transition-all border border-white/10"
                                      >
                                        <X size={14} />
                                      </button>
                                    )}
                                    <div className="absolute top-4 left-4 px-3 py-1 bg-black/40 backdrop-blur-md border border-white/10 rounded-full">
                                      <span className="text-[10px] font-black text-white/60">SLIDE {i + 1}</span>
                                    </div>
                                  </div>

                                  {/* Clean Input List Below */}
                                  <div className="p-5 space-y-4">
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <label className={cn("text-[10px] font-black uppercase tracking-wider opacity-40")}>Headline</label>
                                        <span className={cn("text-[9px] font-bold transition-all", (card.title || '').length > 400 ? (darkMode ? "text-white/20" : "text-black/20") : "opacity-30")}>{(card.title || '').length} / 400</span>
                                      </div>
                                      <input
                                        value={card.title}
                                        onChange={(e) => {
                                          const newCards = [...dmAction!.carouselCards!];
                                          newCards[i] = { ...newCards[i], title: e.target.value };
                                          updateDmAction({ carouselCards: newCards });
                                        }}
                                        placeholder="e.g. Claim Offer"
                                        className={cn("w-full bg-transparent border-b-2 outline-none py-1 text-sm font-bold transition-all", (card.title || '').length > 400 ? (darkMode ? "text-white/20 border-white/5" : "text-black/20 border-black/5") : (darkMode ? "border-white/10 focus:border-purple-500 text-white" : "border-gray-100 focus:border-purple-500 text-gray-900"))}
                                      />
                                    </div>

                                    {/* Description (Subtitle) */}
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <label className={cn("text-[10px] font-black uppercase tracking-wider opacity-40")}>Description</label>
                                        <span className={cn("text-[9px] font-bold transition-all", (card.subtitle || '').length > 400 ? (darkMode ? "text-white/20" : "text-black/20") : "opacity-30")}>{(card.subtitle || '').length} / 400</span>
                                      </div>
                                      <input
                                        value={card.subtitle || ''}
                                        onChange={(e) => {
                                          const newCards = [...dmAction!.carouselCards!];
                                          newCards[i] = { ...newCards[i], subtitle: e.target.value };
                                          updateDmAction({ carouselCards: newCards });
                                        }}
                                        placeholder="Small text below headline..."
                                        className={cn("w-full bg-transparent border-b-2 outline-none py-1 text-sm font-medium transition-all", (card.subtitle || '').length > 400 ? (darkMode ? "text-white/10 border-white/5" : "text-black/10 border-black/5") : (darkMode ? "border-white/10 focus:border-purple-500 text-white/60" : "border-gray-100 focus:border-purple-500 text-gray-500"))}
                                      />
                                    </div>

                                    {/* Buttons (up to 3) */}
                                    <div className="pt-1 space-y-3">
                                      <div className="flex items-center justify-between">
                                        <label className={cn("text-[10px] font-black uppercase tracking-wider opacity-40")}>Buttons ({card.buttons?.length || 0}/3)</label>
                                        {!readOnly && (card.buttons?.length || 0) < 3 && (
                                          <button
                                            onClick={() => {
                                              const newCards = [...dmAction!.carouselCards!];
                                              newCards[i] = { ...newCards[i], buttons: [...(newCards[i].buttons || []), { id: 'btn-' + Date.now(), text: 'New Button', url: '', buttonType: 'web_url' as const }] };
                                              updateDmAction({ carouselCards: newCards });
                                            }}
                                            className={cn("text-[10px] font-bold flex items-center gap-1 transition-colors", darkMode ? "text-purple-400 hover:text-purple-300" : "text-purple-600 hover:text-purple-700")}
                                          >
                                            <Plus size={12} /> Add
                                          </button>
                                        )}
                                      </div>

                                      {(card.buttons || []).map((btn, btnIdx) => (
                                        <div key={btn.id || btnIdx} className={cn(
                                          "p-3 rounded-xl border relative group/btn transition-all",
                                          darkMode ? "bg-white/[0.03] border-white/5 hover:bg-white/[0.06]" : "bg-gray-50/80 border-gray-100 hover:bg-gray-50"
                                        )}>
                                          {!readOnly && (
                                            <button
                                              onClick={() => {
                                                const newCards = [...dmAction!.carouselCards!];
                                                newCards[i] = { ...newCards[i], buttons: (newCards[i].buttons || []).filter((_, idx) => idx !== btnIdx) };
                                                updateDmAction({ carouselCards: newCards });
                                              }}
                                              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/btn:opacity-100 transition-all shadow-md"
                                            >
                                              <X size={10} />
                                            </button>
                                          )}
                                          <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                              <label className="text-[8px] font-black uppercase tracking-wider opacity-30">Label</label>
                                              <input
                                                value={btn.text}
                                                onChange={(e) => {
                                                  const newCards = [...dmAction!.carouselCards!];
                                                  const btns = [...(newCards[i].buttons || [])];
                                                  btns[btnIdx] = { ...btns[btnIdx], text: e.target.value };
                                                  newCards[i] = { ...newCards[i], buttons: btns };
                                                  updateDmAction({ carouselCards: newCards });
                                                }}
                                                placeholder="Button text"
                                                className={cn("w-full text-xs font-bold bg-transparent border-b outline-none pb-1 transition-all", darkMode ? "border-white/10 focus:border-purple-400 text-white" : "border-gray-200 focus:border-purple-500 text-gray-900")}
                                              />
                                            </div>
                                            <div className="space-y-1">
                                              <label className="text-[8px] font-black uppercase tracking-wider opacity-30">Link</label>
                                              <input
                                                value={btn.url}
                                                onChange={(e) => {
                                                  const newCards = [...dmAction!.carouselCards!];
                                                  const btns = [...(newCards[i].buttons || [])];
                                                  btns[btnIdx] = { ...btns[btnIdx], url: e.target.value };
                                                  newCards[i] = { ...newCards[i], buttons: btns };
                                                  updateDmAction({ carouselCards: newCards });
                                                }}
                                                placeholder="https://..."
                                                className={cn("w-full text-xs font-bold bg-transparent border-b outline-none pb-1 transition-all", darkMode ? "border-white/10 focus:border-purple-400 text-purple-400" : "border-gray-200 focus:border-purple-500 text-purple-600")}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {/* Card Addition Slot at the end of the scroll */}
                              {!readOnly && (dmAction?.carouselCards?.length || 0) < maxCarouselCards && (dmAction?.carouselCards?.length || 0) > 0 && (
                                <button
                                  onClick={() => {
                                    updateDmAction({
                                      carouselCards: [
                                        ...(dmAction?.carouselCards || []),
                                        { id: Date.now().toString(), title: '', imageUrl: '', buttons: [] }
                                      ]
                                    });
                                  }}
                                  className={cn(
                                    "shrink-0 w-[240px] aspect-square rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all hover:bg-purple-500/5 hover:border-purple-500/50 group/add snap-start",
                                    darkMode ? "border-white/10 bg-white/[0.02] text-white/20" : "border-gray-200 bg-gray-50 text-gray-400"
                                  )}
                                >
                                  <div className="w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center transition-all group-hover/add:scale-110 group-hover/add:border-purple-500 group-hover/add:text-purple-500">
                                    <Plus size={28} />
                                  </div>
                                  <span className="text-[12px] font-black uppercase tracking-[0.2em]">Add Slide</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Empty Initial State - Just the Add Button */}
                          {(dmAction?.carouselCards?.length || 0) === 0 && !readOnly && (
                            <div className="flex justify-center py-4">
                              <button
                                onClick={() => updateDmAction({ carouselCards: [{ id: Date.now().toString(), title: '', imageUrl: '', buttons: [] }] })}
                                className={cn(
                                  "w-[280px] aspect-square rounded-[2.5rem] border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all hover:bg-purple-500/5 hover:border-purple-500/50 group/add",
                                  darkMode ? "border-white/10 bg-white/[0.02] text-white/20" : "border-gray-200 bg-gray-50 text-gray-400"
                                )}
                              >
                                <div className="w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center transition-all group-hover/add:scale-110 group-hover/add:border-purple-500 group-hover/add:text-purple-500">
                                  <Plus size={28} />
                                </div>
                                <span className="text-[12px] font-black uppercase tracking-[0.2em]">Create First Slide</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* CARD 4: Save Leads */}
        {caps.leadManager && (
          <div className={`p-1.5 md:p-2 mb-4 space-y-1.5 md:space-y-2 transition-colors duration-300 ${darkMode ? '' : 'bg-white border-2 border-purple-100 rounded-[1.5rem]'}`}>
            <div className={cn(
              "rounded-2xl border-2 transition-all overflow-hidden",
              hasLeadManager
                ? (darkMode ? "border-orange-500/30 bg-transparent" : "border-orange-200 bg-orange-50/30")
                : (darkMode ? "border-transparent bg-transparent hover:bg-white/[0.04]" : "border-transparent bg-white hover:bg-gray-50")
            )}>
              <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={toggleLeadManager}>
                <div className={`w-10 h-10 md:w-12 md:h-12 rounded-[14px] md:rounded-xl flex items-center justify-center shrink-0 border ${darkMode ? 'bg-white/10 border-white/10' : 'bg-gray-50 border-gray-100'}`}>
                  <FileSpreadsheet className={`w-4 h-4 md:w-5 md:h-5 ${darkMode ? 'text-white/60' : 'text-gray-500'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className={`font-bold text-[14px] md:text-[15px] ${darkMode ? 'text-white' : 'text-gray-900'}`}>Lead Manager (CRM)</h3>
                    {!canUseLeadManager && (
                      <span className="bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                        <Lock size={8} /> PREMIUM
                      </span>
                    )}
                  </div>
                  <p className={`text-[11px] md:text-xs font-medium ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>Automatically capture and store user details in your Lead Manager</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                  <input type="checkbox" className="sr-only peer" checked={hasLeadManager} readOnly />
                  <div className={`w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-orange-500 shadow-inner ${darkMode ? 'bg-white/10' : ''} ${(!canUseLeadManager && !hasLeadManager) ? 'opacity-50 grayscale' : ''}`}></div>
                  {(!canUseLeadManager && !hasLeadManager) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Lock size={10} className="text-white" />
                    </div>
                  )}
                </label>
              </div>

              <AnimatePresence>
                {hasLeadManager && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                    <div className={`p-4 rounded-2xl border shadow-sm space-y-4 ${darkMode ? 'bg-transparent border-white/5' : 'bg-white border-orange-100'}`}>
                      <div className="space-y-2">
                        <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-white/40' : 'text-gray-500'}`}>Data to Collect</label>
                        <div className="flex flex-wrap gap-2 pt-1 pb-3">
                          {(['name', 'email', 'phone', 'custom'] as const).map(field => {
                            const isSelected = (leadAction?.collectFields || ['name', 'email']).includes(field);
                            const isLocked = field === 'name';
                            return (
                              <button
                                key={field}
                                disabled={readOnly}
                                onClick={() => {
                                  if (!leadAction) return;
                                  if (isLocked) return;

                                  const newFields = new Set(leadAction.collectFields || ['name', 'email']);
                                  if (isSelected) {
                                    if (newFields.size <= 1) {
                                      toast.error("At least one item must be selected");
                                      return;
                                    }
                                    newFields.delete(field);
                                  }
                                  else {
                                    newFields.add(field);
                                    // Initialize custom field if adding it
                                    if (field === 'custom' && !leadAction.customField) {
                                      const newActions = [...actions];
                                      const idx = newActions.findIndex(a => a.type === 'save_lead');
                                      if (idx >= 0) {
                                        newActions[idx] = {
                                          ...newActions[idx],
                                          collectFields: Array.from(newFields),
                                          customField: { label: 'Age', type: 'text', enabled: true }
                                        } as SaveLeadAction;
                                        onActionsChange(newActions);
                                        return;
                                      }
                                    }
                                  }

                                  const newActions = [...actions];
                                  const idx = newActions.findIndex(a => a.type === 'save_lead');
                                  if (idx >= 0) {
                                    newActions[idx] = { ...newActions[idx], collectFields: Array.from(newFields) } as SaveLeadAction;
                                    onActionsChange(newActions);
                                  }
                                }}
                                className={cn(
                                  "px-4 py-1.5 rounded-full text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5",
                                  isSelected
                                    ? (darkMode ? "bg-orange-500/10 border-orange-500/20 text-orange-400" : "bg-orange-50 border-orange-200 text-orange-600")
                                    : (darkMode ? "bg-transparent border-white/10 text-white/40 hover:bg-white/5" : "bg-transparent border-gray-200 text-gray-500 hover:bg-gray-50"),
                                  isLocked && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                <span className={cn("w-1.5 h-1.5 rounded-full transition-all", isSelected ? "bg-current" : "bg-transparent")} />
                                {field.charAt(0).toUpperCase() + field.slice(1)}
                              </button>
                            );
                          })}
                        </div>
                        
                        {/* Custom Field Configuration */}
                        {leadAction?.collectFields?.includes('custom') && (
                          <div className={cn("p-4 rounded-2xl border space-y-4 mt-4", darkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-100 shadow-sm")}>
                            <div className="flex items-center gap-2">
                              <Tag size={14} className="text-orange-500" />
                              <span className={cn("text-xs font-black uppercase tracking-widest", darkMode ? "text-white/40" : "text-gray-400")}>Configure Custom Field</span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className={cn("text-[9px] font-black uppercase tracking-wider", darkMode ? "text-white/40" : "text-gray-500")}>Field Label (e.g. Age, Company)</label>
                                <input
                                  type="text"
                                  value={leadAction.customField?.label || ''}
                                  onChange={(e) => {
                                    const newActions = [...actions];
                                    const idx = newActions.findIndex(a => a.type === 'save_lead');
                                    if (idx >= 0) {
                                      newActions[idx] = { 
                                        ...newActions[idx], 
                                        customField: { ...(newActions[idx] as SaveLeadAction).customField!, label: e.target.value } 
                                      } as SaveLeadAction;
                                      onActionsChange(newActions);
                                    }
                                  }}
                                  className={cn("w-full border rounded-xl px-4 py-2 outline-none font-medium text-sm transition-all", darkMode ? "border-white/10 bg-white/5 text-white focus:border-orange-500/50" : "border-gray-200 focus:border-orange-500 text-gray-900 bg-white")}
                                  placeholder="Age"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className={cn("text-[9px] font-black uppercase tracking-wider", darkMode ? "text-white/40" : "text-gray-500")}>Expected Type</label>
                                <div className="flex bg-gray-200/50 dark:bg-black/20 p-1 rounded-xl border border-gray-200 dark:border-white/5">
                                  {(['text', 'number'] as const).map(type => (
                                    <button
                                      key={type}
                                      onClick={() => {
                                        const newActions = [...actions];
                                        const idx = newActions.findIndex(a => a.type === 'save_lead');
                                        if (idx >= 0) {
                                          newActions[idx] = { 
                                            ...newActions[idx], 
                                            customField: { ...(newActions[idx] as SaveLeadAction).customField!, type } 
                                          } as SaveLeadAction;
                                          onActionsChange(newActions);
                                        }
                                      }}
                                      className={cn(
                                        "flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                                        leadAction.customField?.type === type 
                                          ? (darkMode ? "bg-white/10 text-white shadow-sm" : "bg-white text-gray-900 shadow-sm")
                                          : "text-gray-400 hover:bg-white/5"
                                      )}
                                    >
                                      {type}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Editable Messages */}
                        <div className="pt-4">
                          <div
                            className={cn(
                              "p-3 rounded-xl border cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-between",
                              darkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-100"
                            )}
                            onClick={() => setShowLeadMessages(!showLeadMessages)}
                          >
                            <span className={cn("text-xs font-bold", darkMode ? "text-white" : "text-gray-900")}>Customize DM Messages</span>
                            {showLeadMessages ? (
                              <ChevronUp className={cn("w-4 h-4", darkMode ? "text-white/40" : "text-gray-400")} />
                            ) : (
                              <ChevronDown className={cn("w-4 h-4", darkMode ? "text-white/40" : "text-gray-400")} />
                            )}
                          </div>

                          <AnimatePresence>
                            {showLeadMessages && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-6 space-y-12">
                                  {(() => {
                                    const collected = leadAction?.collectFields || ['name', 'email'];
                                    return (
                                      <>
                                        {collected.map(field => {
                                          const customLabel = leadAction?.customField?.label || 'Custom';
                                          const fieldTitle = field === 'custom' ? customLabel.toUpperCase() : field.toUpperCase();
                                          const qKey = field === 'name' ? 'askName' : field === 'email' ? 'askEmail' : field === 'phone' ? 'askPhone' : 'askCustom';
                                          const cKey = field === 'name' ? 'confirmName' : null;
                                          const rKey = field === 'name' ? 'askNameAgain' : field === 'email' ? 'askEmailAgain' : field === 'phone' ? 'askPhoneAgain' : 'askCustomAgain';
                                          const bKey = field === 'name' ? 'btnChangeName' : field === 'email' ? 'btnChangeEmail' : field === 'phone' ? 'btnChangePhone' : 'btnChangeCustom';
                                          const iKey = field === 'email' ? 'invalidEmail' : field === 'phone' ? 'invalidPhone' : field === 'custom' && leadAction?.customField?.type === 'number' ? 'invalidCustom' : null;

                                          const Icon = field === 'name' ? User : field === 'email' ? Mail : field === 'phone' ? Smartphone : Tag;

                                          return (
                                            <div key={field} className="space-y-4">
                                              <div className="flex items-center gap-2 px-1">
                                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", darkMode ? "bg-white/5 text-white/60" : "bg-gray-100 text-gray-500")}>
                                                  <Icon size={16} />
                                                </div>
                                                <span className={cn("text-xs font-black uppercase tracking-widest", darkMode ? "text-white/40" : "text-gray-400")}>{fieldTitle} COLLECTION</span>
                                              </div>

                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* LEFT: THE QUESTION */}
                                                <div className={cn("p-4 rounded-2xl border flex flex-col gap-3", darkMode ? "bg-white/[0.03] border-white/5" : "bg-gray-50/50 border-gray-100")}>
                                                  <div className="flex items-center justify-between">
                                                    <label className={cn("text-[9px] font-black uppercase tracking-wider", darkMode ? "text-white/40" : "text-gray-500")}>The Question</label>
                                                    <span className={cn("text-[8px] font-bold opacity-30")}>{((leadAction?.messages as any)?.[qKey] || (DEFAULT_LEAD_MESSAGES as any)[qKey] || '').length} / 1000</span>
                                                  </div>
                                                  <textarea
                                                    value={((leadAction?.messages as any)?.[qKey] || (DEFAULT_LEAD_MESSAGES as any)[qKey] || '')
                                                      .replace("What's your answer for ", "")
                                                      .replace("What's your answer for {{label}}?", "{{label}}?")
                                                      .replace('{{label}}', customLabel)
                                                    }
                                                    onChange={(e) => {
                                                      const newActions = [...actions];
                                                      const idx = newActions.findIndex(a => a.type === 'save_lead');
                                                      if (idx >= 0) {
                                                        const currentItem = newActions[idx] as SaveLeadAction;
                                                        const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                        (newMsgs as any)[qKey] = e.target.value;
                                                        newActions[idx] = { ...currentItem, messages: newMsgs };
                                                        onActionsChange(newActions);
                                                      }
                                                    }}
                                                    rows={2}
                                                    className={cn("bg-transparent outline-none text-xs font-semibold resize-none", darkMode ? "text-white" : "text-gray-800")}
                                                    placeholder="The question text..."
                                                  />
                                                </div>

                                                {/* RIGHT: CONFIRMATION OR BUTTON LABEL */}
                                                <div className={cn("p-4 rounded-2xl border flex flex-col gap-3", darkMode ? "bg-white/[0.03] border-white/5" : "bg-gray-50/50 border-gray-100")}>
                                                  <div className="flex items-center justify-between">
                                                    <label className={cn("text-[9px] font-black uppercase tracking-wider", darkMode ? "text-white/40" : "text-gray-500")}>Confirmation & Buttons</label>
                                                    {cKey && <span className={cn("text-[8px] font-bold opacity-30")}>{((leadAction?.messages as any)?.[cKey!] || (DEFAULT_LEAD_MESSAGES as any)[cKey!] || '').length} / 1000</span>}
                                                  </div>
                                                  {cKey && (
                                                    <textarea
                                                      value={leadAction?.messages?.[cKey] ?? DEFAULT_LEAD_MESSAGES[cKey]}
                                                      onChange={(e) => {
                                                        const newActions = [...actions];
                                                        const idx = newActions.findIndex(a => a.type === 'save_lead');
                                                        if (idx >= 0) {
                                                          const currentItem = newActions[idx] as SaveLeadAction;
                                                          const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                          (newMsgs as any)[cKey] = e.target.value;
                                                          newActions[idx] = { ...currentItem, messages: newMsgs };
                                                          onActionsChange(newActions);
                                                        }
                                                      }}
                                                      rows={2}
                                                      className={cn("bg-transparent outline-none text-[11px] font-medium resize-none opacity-80", darkMode ? "text-white" : "text-gray-800")}
                                                      placeholder="Confirmation message..."
                                                    />
                                                  )}
                                                  <div className="flex items-center gap-2 mt-auto">
                                                    <span className={cn("text-[8px] font-bold uppercase", darkMode ? "text-white/20" : "text-gray-300")}>BTN:</span>
                                                    <input
                                                      type="text"
                                                      value={(leadAction?.messages as any)?.[bKey] ?? (DEFAULT_LEAD_MESSAGES as any)[bKey]?.replace('{{label}}', customLabel)}
                                                      onChange={(e) => {
                                                        const newActions = [...actions];
                                                        const idx = newActions.findIndex(a => a.type === 'save_lead');
                                                        if (idx >= 0) {
                                                          const currentItem = newActions[idx] as SaveLeadAction;
                                                          const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                          (newMsgs as any)[bKey] = e.target.value;
                                                          newActions[idx] = { ...currentItem, messages: newMsgs };
                                                          onActionsChange(newActions);
                                                        }
                                                      }}
                                                      className={cn("flex-1 bg-transparent border-b border-dashed outline-none text-[10px] font-black", darkMode ? "border-white/10 text-white/50 focus:text-white" : "border-gray-200 text-gray-400 focus:text-gray-900")}
                                                      placeholder="Button text..."
                                                    />
                                                  </div>
                                                </div>

                                                {/* BOTTOM: RETRY / INVALID MESSAGES (FULL WIDTH) */}
                                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                  {/* Correction / Reset */}
                                                  <div className={cn("p-4 rounded-2xl border flex flex-col gap-2", darkMode ? "bg-white/[0.01] border-white/10" : "bg-white/10 border-gray-100")}>
                                                    <div className="flex items-center justify-between">
                                                      <div className="flex items-center gap-2">
                                                        <RotateCcw size={10} className="opacity-40" />
                                                        <label className={cn("text-[9px] font-black uppercase tracking-wider", darkMode ? "text-white/30" : "text-gray-400")}>Correction / Reset Msg</label>
                                                      </div>
                                                    </div>
                                                    <textarea
                                                      value={(leadAction?.messages as any)?.[rKey] ?? (DEFAULT_LEAD_MESSAGES as any)[rKey]?.replace('{{label}}', customLabel)}
                                                      onChange={(e) => {
                                                        const newActions = [...actions];
                                                        const idx = newActions.findIndex(a => a.type === 'save_lead');
                                                        if (idx >= 0) {
                                                          const currentItem = newActions[idx] as SaveLeadAction;
                                                          const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                          (newMsgs as any)[rKey] = e.target.value;
                                                          newActions[idx] = { ...currentItem, messages: newMsgs };
                                                          onActionsChange(newActions);
                                                        }
                                                      }}
                                                      rows={1}
                                                      className={cn("bg-transparent outline-none text-xs font-medium resize-none opacity-60 italic", darkMode ? "text-white" : "text-gray-800")}
                                                      placeholder="Reset message..."
                                                    />
                                                  </div>

                                                  {/* Invalid Format */}
                                                  {iKey && (
                                                    <div className={cn("p-4 rounded-2xl border flex flex-col gap-2", darkMode ? "bg-white/[0.01] border-white/10" : "bg-white/10 border-gray-100")}>
                                                      <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                          <AlertCircle size={10} className="text-orange-500" />
                                                          <label className={cn("text-[9px] font-black uppercase tracking-wider", darkMode ? "text-white/30" : "text-gray-400")}>Wrong Format Msg</label>
                                                        </div>
                                                      </div>
                                                      <textarea
                                                        value={(leadAction?.messages as any)?.[iKey] ?? (DEFAULT_LEAD_MESSAGES as any)[iKey]?.replace('{{label}}', customLabel)}
                                                        onChange={(e) => {
                                                          const newActions = [...actions];
                                                          const idx = newActions.findIndex(a => a.type === 'save_lead');
                                                          if (idx >= 0) {
                                                            const currentItem = newActions[idx] as SaveLeadAction;
                                                            const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                            (newMsgs as any)[iKey] = e.target.value;
                                                            newActions[idx] = { ...currentItem, messages: newMsgs };
                                                            onActionsChange(newActions);
                                                          }
                                                        }}
                                                        rows={1}
                                                        className={cn("bg-transparent outline-none text-xs font-medium resize-none opacity-60 italic text-orange-500/80", darkMode ? "text-white" : "text-gray-800")}
                                                        placeholder="Invalid format message..."
                                                      />
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}

                                        {/* SUMMARY & FINAL MESSAGE SECTION */}
                                        <div className="pt-8 border-t border-dashed border-white/10 space-y-8">
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {/* SUMMARY CASE */}
                                            <div className="space-y-4">
                                              <div className="flex items-center gap-2">
                                                <FileSpreadsheet size={16} className="text-emerald-500" />
                                                <span className={cn("text-xs font-black uppercase tracking-widest", darkMode ? "text-white/40" : "text-gray-400")}>Final Confirmation</span>
                                              </div>
                                              <div className={cn("p-5 rounded-3xl border space-y-4", darkMode ? "bg-white/[0.03] border-emerald-500/20 shadow-2xl shadow-emerald-500/5" : "bg-emerald-50/30 border-emerald-100")}>
                                                <textarea
                                                  value={leadAction?.messages?.confirmAll ?? (
                                                    (DEFAULT_LEAD_MESSAGES.confirmAll || '')
                                                      .replace(/\nPhone: {{phone}}/g, (leadAction?.collectFields || []).includes('phone') ? '\nPhone: {{phone}}' : '')
                                                      .replace(/Phone: {{phone}}/g, (leadAction?.collectFields || []).includes('phone') ? 'Phone: {{phone}}' : '')
                                                      .replace(/\n{{label}}: {{custom}}/g, (leadAction?.collectFields || []).includes('custom') ? `\n${leadAction?.customField?.label || 'Custom'}: {{custom}}` : '')
                                                      .replace(/{{label}}: {{custom}}/g, (leadAction?.collectFields || []).includes('custom') ? `${leadAction?.customField?.label || 'Custom'}: {{custom}}` : '')
                                                      .replace('{{label}}', leadAction?.customField?.label || 'Custom')
                                                      .trim()
                                                  )}
                                                  onChange={(e) => {
                                                    const newActions = [...actions];
                                                    const i = newActions.findIndex(a => a.type === 'save_lead');
                                                    if (i >= 0) {
                                                      const currentItem = newActions[i] as SaveLeadAction;
                                                      const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                      newMsgs.confirmAll = e.target.value;
                                                      newActions[i] = { ...currentItem, messages: newMsgs };
                                                      onActionsChange(newActions);
                                                    }
                                                  }}
                                                  rows={4}
                                                  className={cn("w-full bg-transparent outline-none text-sm font-bold resize-none", darkMode ? "text-white" : "text-gray-900")}
                                                />
                                                <div className="flex items-center gap-2 pt-2 border-t border-dashed border-emerald-500/20">
                                                  <span className={cn("text-[9px] font-black tracking-widest uppercase", darkMode ? "text-emerald-500/60" : "text-emerald-600")}>Confirm BTN:</span>
                                                  <input
                                                    type="text"
                                                    value={leadAction?.messages?.btnYesLooksGood ?? DEFAULT_LEAD_MESSAGES.btnYesLooksGood}
                                                    onChange={(e) => {
                                                      const newActions = [...actions];
                                                      const i = newActions.findIndex(a => a.type === 'save_lead');
                                                      if (i >= 0) {
                                                        const currentItem = newActions[i] as SaveLeadAction;
                                                        const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                        newMsgs.btnYesLooksGood = e.target.value;
                                                        newActions[i] = { ...currentItem, messages: newMsgs };
                                                        onActionsChange(newActions);
                                                      }
                                                    }}
                                                    className={cn("flex-1 bg-transparent outline-none text-xs font-black", darkMode ? "text-white" : "text-emerald-700")}
                                                    placeholder="Confirm Button..."
                                                  />
                                                </div>
                                              </div>
                                            </div>

                                            {/* FINAL MESSAGE */}
                                            <div className="space-y-4">
                                              <div className="flex items-center gap-2">
                                                <CheckCircle2 size={16} className="text-purple-500" />
                                                <span className={cn("text-xs font-black uppercase tracking-widest", darkMode ? "text-white/40" : "text-gray-400")}>Successful Finish</span>
                                              </div>
                                              <div className={cn("p-5 rounded-3xl border space-y-4", darkMode ? "bg-white/[0.03] border-purple-500/20 shadow-2xl shadow-purple-500/5" : "bg-purple-50/30 border-purple-100")}>
                                                <textarea
                                                  value={leadAction?.messages?.finalMessage ?? DEFAULT_LEAD_MESSAGES.finalMessage}
                                                  onChange={(e) => {
                                                    const newActions = [...actions];
                                                    const i = newActions.findIndex(a => a.type === 'save_lead');
                                                    if (i >= 0) {
                                                      const currentItem = newActions[i] as SaveLeadAction;
                                                      const newMsgs = { ...DEFAULT_LEAD_MESSAGES, ...(currentItem.messages || {}) };
                                                      newMsgs.finalMessage = e.target.value;
                                                      newActions[i] = { ...currentItem, messages: newMsgs };
                                                      onActionsChange(newActions);
                                                    }
                                                  }}
                                                  rows={5}
                                                  className={cn("w-full bg-transparent outline-none text-sm font-bold resize-none", darkMode ? "text-white" : "text-gray-900")}
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* CARD 5: Follow Up Message */}
        {(triggerType === 'user_directed_messages' || (triggerType === 'post_comment' && hasLeadManager)) && (
          <div className={cn("p-1.5 md:p-2 mb-4 space-y-1.5 md:space-y-2 transition-colors duration-300", darkMode ? "" : "bg-white border-2 border-emerald-100 rounded-[1.5rem]")}>
            <div className={cn(
              "rounded-2xl border-2 transition-all overflow-hidden",
              hasFollowUp
                ? (darkMode ? "border-emerald-500/30 bg-emerald-500/5" : "border-emerald-200 bg-emerald-50/30")
                : (darkMode ? "border-transparent bg-transparent hover:bg-white/[0.04]" : "border-transparent bg-white hover:bg-gray-50")
            )}>
              <div className="p-3 md:p-4 flex items-center gap-3 md:gap-4 cursor-pointer" onClick={toggleFollowUp}>
                <div className={cn(
                  "w-10 h-10 md:w-12 md:h-12 rounded-[14px] md:rounded-xl flex items-center justify-center shrink-0 border",
                  darkMode ? "bg-white/10 border-white/10" : "bg-gray-50 border-gray-100"
                )}>
                  <RotateCcw className={cn("w-4 h-4 md:w-5 md:h-5", darkMode ? "text-white/60" : "text-gray-500")} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className={cn("font-bold text-[14px] md:text-[15px]", darkMode ? "text-white" : "text-gray-900")}>Automated Follow-up</h3>
                    {!canUseFollowUpMsgs && (
                      <span className="bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                        <Lock size={8} /> PROFESSIONAL
                      </span>
                    )}
                  </div>
                  <p className={cn("text-[11px] md:text-xs font-medium leading-tight", darkMode ? "text-white/40" : "text-gray-400")}>Send a second message automatically after a delay to boost response rates</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                  <input type="checkbox" className="sr-only peer" checked={hasFollowUp} readOnly />
                  <div className={cn(
                    "w-10 h-6 md:w-12 md:h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 md:after:h-6 md:after:w-6 after:transition-all peer-checked:bg-emerald-500 shadow-inner",
                    darkMode && "bg-white/10",
                    (!canUseFollowUpMsgs && !hasFollowUp) && "opacity-50 grayscale"
                  )}></div>
                  {(!canUseFollowUpMsgs && !hasFollowUp) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Lock size={10} className="text-white" />
                    </div>
                  )}
                </label>
              </div>

              <AnimatePresence>
                {hasFollowUp && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5 pt-0">
                    <div className={cn("p-4 rounded-2xl border shadow-sm space-y-5", darkMode ? "bg-black/20 border-white/5" : "bg-white border-emerald-100")}>
                      
                      <div className="flex flex-col md:flex-row gap-6 md:items-end">
                        <div className="flex-1 space-y-2">
                          <label className={cn("text-[10px] font-black uppercase tracking-wider text-gray-500", darkMode && "text-white/40")}>Send delay</label>
                          <div className="flex items-center gap-3">
                            <input 
                              type="number"
                              min="1"
                              max="30"
                              value={followUpAction?.delayValue || 30}
                              onChange={(e) => {
                                const val = Math.min(30, Math.max(1, parseInt(e.target.value) || 1));
                                const newActions = [...actions];
                                const idx = newActions.findIndex(a => a.type === 'follow_up');
                                if (idx >= 0) {
                                  newActions[idx] = { ...newActions[idx], delayValue: val, delayUnit: 'minutes' } as FollowUpAction;
                                  onActionsChange(newActions);
                                }
                              }}
                              className={cn("w-20 px-4 py-2 rounded-xl border-2 font-black text-center outline-none transition-all", darkMode ? "bg-white/5 border-white/10 text-white focus:border-emerald-500" : "bg-gray-50 border-gray-100 focus:bg-white focus:border-emerald-500")}
                            />
                            <span className={cn("text-[11px] font-black uppercase tracking-widest opacity-40")}>Minutes</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <label className={cn("text-[10px] font-black uppercase tracking-wider text-gray-500", darkMode && "text-white/40")}>Follow Up Message</label>
                          <span className={cn("text-[9px] font-bold opacity-30")}>{(followUpAction?.message || '').length} / 1000</span>
                        </div>
                        <textarea
                          value={followUpAction?.message || ''}
                          onChange={(e) => {
                            const newActions = [...actions];
                            const idx = newActions.findIndex(a => a.type === 'follow_up');
                            if (idx >= 0) {
                              newActions[idx] = { ...newActions[idx], message: e.target.value } as FollowUpAction;
                              onActionsChange(newActions);
                            }
                          }}
                          placeholder="Hey! Just following up on my previous message... 😊"
                          rows={3}
                          className={cn("w-full p-4 rounded-xl border-2 font-medium text-sm outline-none transition-all resize-none", darkMode ? "bg-white/5 border-white/10 text-white focus:border-emerald-500" : "bg-gray-50 border-gray-100 focus:bg-white focus:border-emerald-500")}
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center px-1">
                          <label className={cn("text-[10px] font-black uppercase tracking-wider text-gray-500", darkMode && "text-white/40")}>Buttons (Max 3, URLs only)</label>
                          <span className={cn("text-[9px] font-bold opacity-30")}>{(followUpAction?.actionButtons || []).length} / 3</span>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-2">
                          {(followUpAction?.actionButtons || []).map((btn, bIdx) => (
                            <div key={btn.id} className={cn("p-3 rounded-xl border flex flex-col gap-2 transition-all", darkMode ? "bg-white/[0.03] border-white/5" : "bg-white border-gray-100 shadow-sm")}>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={btn.text}
                                  placeholder="Button Label (e.g. Visit Website)"
                                  onChange={(e) => {
                                    const newActions = [...actions];
                                    const idx = newActions.findIndex(a => a.type === 'follow_up');
                                    if (idx >= 0) {
                                      const followUp = { ...newActions[idx] } as FollowUpAction;
                                      const btns = [...(followUp.actionButtons || [])];
                                      btns[bIdx] = { ...btns[bIdx], text: e.target.value.substring(0, 20) };
                                      newActions[idx] = { ...followUp, actionButtons: btns };
                                      onActionsChange(newActions);
                                    }
                                  }}
                                  className={cn("flex-1 bg-transparent border-none outline-none text-[11px] font-black", darkMode ? "text-white placeholder:text-white/20" : "text-gray-900 placeholder:text-gray-300")}
                                />
                                <button
                                  onClick={() => {
                                    const newActions = [...actions];
                                    const idx = newActions.findIndex(a => a.type === 'follow_up');
                                    if (idx >= 0) {
                                      const followUp = { ...newActions[idx] } as FollowUpAction;
                                      const btns = (followUp.actionButtons || []).filter((_, i) => i !== bIdx);
                                      newActions[idx] = { ...followUp, actionButtons: btns };
                                      onActionsChange(newActions);
                                    }
                                  }}
                                  className={cn("p-1.5 rounded-lg transition-colors", darkMode ? "hover:bg-red-500/20 text-red-400" : "hover:bg-red-50 text-red-500")}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                              <div className="flex items-center gap-2 px-1 border-t border-dashed border-gray-500/10 pt-2">
                                <Globe size={10} className="opacity-30" />
                                <input
                                  type="text"
                                  value={btn.url || ''}
                                  placeholder="https://example.com"
                                  onChange={(e) => {
                                    const newActions = [...actions];
                                    const idx = newActions.findIndex(a => a.type === 'follow_up');
                                    if (idx >= 0) {
                                      const followUp = { ...newActions[idx] } as FollowUpAction;
                                      const btns = [...(followUp.actionButtons || [])];
                                      btns[bIdx] = { ...btns[bIdx], url: e.target.value, buttonType: 'web_url' };
                                      newActions[idx] = { ...followUp, actionButtons: btns };
                                      onActionsChange(newActions);
                                    }
                                  }}
                                  className={cn("flex-1 bg-transparent border-none outline-none text-[9px] font-medium", darkMode ? "text-emerald-400 placeholder:text-white/10" : "text-emerald-600 placeholder:text-gray-300")}
                                />
                              </div>
                            </div>
                          ))}
                          
                          {(followUpAction?.actionButtons || []).length < 3 && (
                            <button
                              onClick={() => {
                                const newActions = [...actions];
                                const idx = newActions.findIndex(a => a.type === 'follow_up');
                                if (idx >= 0) {
                                  const followUp = { ...newActions[idx] } as FollowUpAction;
                                  const btns = [...(followUp.actionButtons || []), { id: Math.random().toString(36).substr(2, 9), text: '', url: '', buttonType: 'web_url' } as ActionButton];
                                  newActions[idx] = { ...followUp, actionButtons: btns };
                                  onActionsChange(newActions);
                                }
                              }}
                              className={cn("p-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-all group", darkMode ? "bg-white/[0.02] border-white/5 hover:border-emerald-500/50 hover:bg-emerald-500/5" : "bg-gray-50/50 border-gray-100 hover:border-emerald-500/50 hover:bg-emerald-50/50")}
                            >
                              <Plus size={14} className={cn("transition-colors", darkMode ? "text-white/20 group-hover:text-emerald-400" : "text-gray-400 group-hover:text-emerald-500")} />
                              <span className={cn("text-[10px] font-black uppercase tracking-wider transition-colors", darkMode ? "text-white/20 group-hover:text-emerald-400" : "text-gray-400 group-hover:text-emerald-500")}>Add Button</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
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
            className={cn(
              "w-full max-w-xl py-4 rounded-full font-bold text-lg flex justify-center items-center gap-2 transition-all shadow-lg relative overflow-hidden",
              canSave
                ? (darkMode ? 'bg-indigo-900/40 text-white shadow-indigo-500/20 hover:brightness-110 hover:-translate-y-1 border border-indigo-500/30' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-200 hover:shadow-xl hover:-translate-y-1')
                : (darkMode ? 'bg-white/5 text-white/20 shadow-none border-white/5' : 'bg-gray-100 text-gray-400 shadow-none border-gray-100')
            )}
          >
            {/* Progress Bar Overlay */}
            {saving && (
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: `${launchProgress}%` }}
                className={cn(
                  "absolute inset-y-0 left-0 z-0",
                  darkMode ? "bg-indigo-500/30" : "bg-white/20"
                )}
                transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
              />
            )}

            {/* Button Content (kept on top) */}
            <div className="relative z-10 flex items-center justify-center gap-2">
              {saving ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Loader className="w-5 h-5 text-orange-400" />
                  </motion.div>
                  <span>{launchProgress < 70 ? 'Initializing...' : launchProgress < 90 ? 'Preparing...' : 'Finalizing...'}</span>
                  <span className="text-[10px] opacity-40 ml-1 font-mono">{Math.round(launchProgress)}%</span>
                </>
              ) : (
                <>
                  <span>Launch Automation</span>
                  <Rocket className={cn("w-5 h-5", canSave ? "text-orange-400" : (darkMode ? "text-white/20" : "text-gray-400"))} />
                </>
              )}
            </div>
          </button>
        )}
      </div>

      {!canSave && !saving && !readOnly && (
        <div className="flex justify-center -mt-4 mb-8">
          <p className={cn(
            "text-[10px] font-black uppercase tracking-[0.2em] animate-pulse px-4 py-1.5 rounded-full text-center",
            darkMode ? "bg-orange-500/10 text-orange-400" : "bg-orange-50 text-orange-600"
          )}>
            {characterLimitExceeded.exceeded ? characterLimitExceeded.reason :
              !isReplyValid ? 'Add a reply template' :
              !isDmValid ? 'Finish DM configuration' :
                !isFollowUpValid ? 'Complete follow up message' :
                  'Check action settings'}
          </p>

        </div>
      )}



    </div>
  );
}