export type TriggerType = 'post_comment' | 'story_reply' | 'user_directed_messages' | 'conversation_flow';

export type ActionType = 'reply_to_comment' | 'ask_to_follow' | 'send_dm' | 'follow_up';

export interface PostCommentTriggerConfig {
  postsType: 'all' | 'specific';
  specificPosts?: string[];
  commentsType: 'all' | 'keywords';
  keywords?: string[];
}

export interface StoryReplyTriggerConfig {
  storiesType: 'all' | 'specific';
  replyType: 'all' | 'keywords';
  specificStories?: string[];
  keywords?: string[];
}

export interface UserDirectMessageTriggerConfig {
  messageType: 'all' | 'keywords';
  keywords?: string[];
  cooldownEnabled?: boolean;
  cooldownDuration?: number; // In milliseconds
}

export interface ConversationFlowTriggerConfig {
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  // L1 menu items (3 buttons)
  l1Labels?: string[];
}


export type TriggerConfig =
  | PostCommentTriggerConfig
  | StoryReplyTriggerConfig
  | UserDirectMessageTriggerConfig
  | ConversationFlowTriggerConfig;

export interface ActionButton {
  id: string;
  text: string;
  url?: string;
  payload?: string;
  buttonType?: 'web_url' | 'postback';
}

export interface ReplyToCommentAction {
  type: 'reply_to_comment';
  replyTemplates: string[];
  actionButtons?: ActionButton[];
}

export interface AskToFollowAction {
  type: 'ask_to_follow';
  messageTemplate: string;
  followButtonText: string;
}

export interface CarouselCard {
  id: string;
  imageUrl?: string;
  title: string;
  subtitle?: string;
  buttons: ActionButton[];
}

export interface ConversationCard {
  id: string;
  title: string;
  subtitle?: string;
  messageTemplate?: string;
  imageUrl?: string;
  showImage?: boolean;
  actionButtons: ActionButton[];
}

export interface SendDmAction {
  type: 'send_dm';
  dmType?: 'simple' | 'carousel' | 'conversation_flow';
  title?: string;
  imageUrl?: string;
  subtitle?: string;
  messageTemplate?: string;
  actionButtons: ActionButton[];
  carouselCards?: CarouselCard[];
  conversationCards?: ConversationCard[]; // Flat store for recursive flows
  askToFollow?: boolean;
  askToFollowMessage?: string;
  askToFollowBtnText?: string;
  teaserMessage?: string;
  teaserBtnText?: string;
  showImage?: boolean;
  childAction?: SendDmAction;
}

export interface LeadMessages {
  askName?: string;
  askEmail?: string;
  askPhone?: string;
  confirmName?: string;
  confirmAll?: string;
  finalMessage?: string;
  askNameAgain?: string;
  askEmailAgain?: string;
  askPhoneAgain?: string;
  invalidEmail?: string;
  invalidPhone?: string;

  // Button Labels
  btnChangeName?: string;
  btnChangeEmail?: string;
  btnChangePhone?: string;
  btnChangeCustom?: string;
  btnYesLooksGood?: string;

  askCustom?: string;
  askCustomAgain?: string;
  invalidCustom?: string;
}

export const DEFAULT_LEAD_MESSAGES: LeadMessages = {
  askName: "👋 Hey! Thanks for reaching out. What's your first name? 😊",
  askEmail: "What email should we use to get in touch with you? 📧",
  askPhone: "What's your phone number? 📱",
  confirmName: "Awesome, {{name}}! 😊 If you typed your name wrong, fix it below.",
  confirmAll: "Perfect! Just confirming ✅\nName: {{name}}\nEmail: {{email}}\nPhone: {{phone}}\n{{label}}: {{custom}}",
  finalMessage: "🎉 We've got you, {{name}}! Your details have been saved and our team will reach out soon. Thank you! 🙏",
  askNameAgain: "No problem! What's your correct first name? ✏️",
  askEmailAgain: "Sure! What's the correct email address? 📧",
  askPhoneAgain: "What's the correct phone number? 📱",
  invalidEmail: "Enter a valid email address 📧",
  invalidPhone: "Enter a valid phone number 📱",

  // Default Button Labels
  btnChangeName: "✏️ Change Name",
  btnChangeEmail: "✏️ Change Email",
  btnChangePhone: "✏️ Change Phone",
  btnChangeCustom: "✏️ Change {{label}}",
  btnYesLooksGood: "✅ Yes, looks good!",

  askCustom: "{{label}}? ✏️",
  askCustomAgain: "No problem! {{label}}? ✏️",
  invalidCustom: "Please enter a valid number for {{label}} 🔢",
};

export interface CustomFieldConfig {
  label: string;
  type: 'text' | 'number';
  enabled: boolean;
}

export interface SaveLeadAction {
  type: 'save_lead';
  enabled: boolean;
  tags?: string[];
  collectFields?: ('name' | 'email' | 'phone' | 'custom')[];
  customField?: CustomFieldConfig;
  messages?: LeadMessages;
}

export interface FollowUpAction {
  type: 'follow_up';
  enabled: boolean;
  delayValue: number;
  delayUnit: 'minutes' | 'hours' | 'days';
  message: string;
  actionButtons?: ActionButton[];
}

export type Action = ReplyToCommentAction | AskToFollowAction | SendDmAction | SaveLeadAction | FollowUpAction;

export interface AutomationFormData {
  name: string;
  triggerType: TriggerType | null;
  triggerConfig: TriggerConfig | null;
  actions: Action[];
}
