import { createReminderController } from './reminderController';
import { browserReminderEnv } from './reminderEnv';

/** The app's one reminder controller, bound to the real browser. */
export const reminders = createReminderController(browserReminderEnv);
