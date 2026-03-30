import { logComment, logReply, logFollowRequest, logDM, logDMSent } from './activityLogger';

export async function createSampleActivities() {
  await logComment('creative_user', 'Hey');

  await logReply('quickrevert_bot', 'Just sent you a message 📩');

  await logFollowRequest(
    'quickrevert_bot',
    'Follow me for exciting offers and exclusive content! 🚀',
    true
  );

  await logDM('creative_user', true, true);

  await logDMSent(
    'quickrevert_bot',
    'Hey 👋 glad you reached out! Check this out',
    true
  );
}
