import { logComment, logReply, logFollowRequest, logDM, logDMSent } from './activityLogger';

export async function createSampleActivities() {
  await logComment('khushirohatgi_', 'Hey');

  await logReply('s.tella.ai', 'Just sent you a message 📩');

  await logFollowRequest(
    's.tella.ai',
    'Follow me for exciting offers and exclusive content! 🚀',
    true
  );

  await logDM('khushirohatgi_', true, true);

  await logDMSent(
    's.tella.ai',
    'Hey 👋 glad you reached out! Check this out',
    true
  );
}
