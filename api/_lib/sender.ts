// Named import: web-push 4 is an ES module with no default export.
import { sendNotification } from 'web-push';
import { TOPIC, TTL_SECONDS, type SendPush } from './reminders.js';

type Vapid = { subject: string; publicKey: string; privateKey: string };

/**
 * Sends one push message with web-push.
 *
 * TTL: the push service keeps an undelivered message for an hour, then drops
 * it. A morning reminder delivered in the afternoon is noise.
 * Topic: a newer undelivered reminder replaces an older one instead of both
 * arriving when the phone comes back online.
 */
export function createPushSender(vapid: Vapid): SendPush {
  return async (subscription, payload) => {
    try {
      await sendNotification(subscription, JSON.stringify(payload), {
        vapidDetails: vapid,
        TTL: TTL_SECONDS,
        topic: TOPIC,
        urgency: 'normal',
      });
      return 'sent';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // 404 and 410 are the push service saying this subscription no longer exists.
      return status === 404 || status === 410 ? 'gone' : 'failed';
    }
  };
}
