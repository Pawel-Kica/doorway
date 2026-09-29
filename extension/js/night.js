// Night mode hours, all user settings (Settings > Night mode). Defaults: photo off 20:00-04:00, "Go to sleep" from 22:00.
// Both windows end at wakeAt, the same boundary the morning greeting uses.

import { state } from './store.js';

// Is `hour` inside [from, to), where the window may cross midnight.
const within = (hour, from, to) => (from > to ? hour >= from || hour < to : hour >= from && hour < to);

export const isDark = (hour) => state.settings.nightMode && within(hour, state.settings.nightFrom, state.settings.wakeAt);
export const isSleep = (hour) => state.settings.sleepGreeting && within(hour, state.settings.sleepFrom, state.settings.wakeAt);
