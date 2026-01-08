export type TriggerType = 'post_comment' | 'story_reply' | 'user_directed_messages';

export type ActionType = 'reply_to_comment' | 'ask_to_follow' | 'send_dm';

export interface PostCommentTriggerConfig {
  postsType: 'all' | 'specific';
  specificPosts?: string[];
  commentsType: 'all' | 'keywords';
  keywords?: string[];
}

export interface StoryReplyTriggerConfig {
  storiesType: 'all' | 'specific';
  specificStories?: string[];
}

export interface UserDirectMessageTriggerConfig {
  messageType: 'all' | 'keywords';
  keywords?: string[];
}

export type TriggerConfig =
  | PostCommentTriggerConfig
  | StoryReplyTriggerConfig
  | UserDirectMessageTriggerConfig;

export interface ActionButton {
  id: string;
  text: string;
  url?: string;
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

export interface SendDmAction {
  type: 'send_dm';
  messageTemplate: string;
  actionButtons: ActionButton[];
}

export type Action = ReplyToCommentAction | AskToFollowAction | SendDmAction;

export interface AutomationFormData {
  name: string;
  triggerType: TriggerType | null;
  triggerConfig: TriggerConfig | null;
  actions: Action[];
}
