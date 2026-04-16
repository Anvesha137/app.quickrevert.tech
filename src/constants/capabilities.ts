import { TriggerType } from "../types/automation";

export const CAPABILITIES: Record<TriggerType, {
  askToFollow: boolean;
  publicReply: boolean;
  dm: boolean;
  carousel: boolean;
  convFlow: boolean;
  leadManager: boolean;
}> = {
  post_comment: {
    askToFollow: true,
    publicReply: true,
    dm: true,
    carousel: true,
    convFlow: true,
    leadManager: true,
  },
  user_directed_messages: {
    askToFollow: false,
    publicReply: false,
    dm: true,
    carousel: true,
    convFlow: true,
    leadManager: true,
  },
  story_reply: {
    askToFollow: false,
    publicReply: false,
    dm: true,
    carousel: true,
    convFlow: true,
    leadManager: true,
  },
  // the below are deprecated from UI selection but exist for backend/legacy typed support
  conversation_flow: {
    askToFollow: false,
    publicReply: false,
    dm: true,
    carousel: false,
    convFlow: true,
    leadManager: false,
  },
  lead_manager: {
    askToFollow: false,
    publicReply: false,
    dm: false,
    carousel: false,
    convFlow: false,
    leadManager: true,
  }
};
