// Center greeting; double-click the name to edit it inline. Include name and the name itself also live in Settings > General.

import { state, save } from './store.js';
import { esc } from './dom.js';
import { isSleep, now } from './night.js';

const el = document.getElementById('greeting');
let editing = false;
let lastText = '';

// Day parts: 4-12 morning, 12-17 afternoon, otherwise evening.
export function dayPart(hour) {
  if (hour >= 4 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

// Greeting without the name: a nudge to bed during sleep hours, the day part otherwise.
export function greeting(hour) {
  return isSleep(hour) ? 'Go to sleep' : `Good ${dayPart(hour)}`;
}

// "<base> <name>." as plain text, for the Night mode previews in settings.
export function withName(base) {
  const { name, includeName } = state.settings;
  if (!name || !includeName) return `${base}.`;
  return `${base} ${name}${/[.!?]$/.test(name) ? '' : '.'}`;
}

// Greeting markup for the current state (name shown only if set and included).
// No comma before the name: "Good evening Alex." reads as one sentence.
function content() {
  const { name, includeName } = state.settings;
  const base = greeting(now().getHours());
  if (editing) {
    return `${base} <span class="name-punctuation-no-wrap"><span class="name-wrapper"><span class="input-wrapper">` +
      `<input class="name editing" spellcheck="false" value="${esc(name)}"><span class="name hidden-span">${esc(name).replace(/ /g, '&nbsp;')}</span>` +
      `</span></span><span>.</span></span>`;
  }
  if (!name || !includeName) return `${base}.`;
  const dot = /[.!?]$/.test(name) ? '' : '.';
  return `${base} <span class="name-punctuation-no-wrap"><span class="name">${esc(name)}</span>${dot}</span>`;
}

// Full re-render of the greeting row (skipped while the name input is active).
export function renderGreeting() {
  el.hidden = !state.settings.greetingVisible;
  if (editing) return;
  if (!el.firstChild) build();
  lastText = content();
  el.querySelector('.content').innerHTML = lastText;
}

// Re-renders only when the day part changes (called every second).
export function tickGreeting() {
  if (!editing && content() !== lastText) renderGreeting();
}

// Builds the static structure and the double-click handler once.
// Text is centered as a plain line (no grid max-content sizing, which Chrome measures ~3% too wide at this font size).
function build() {
  el.innerHTML = `<h2 class="greeting-line"><span class="text-wrap"><span class="shadow scrim-overlay"></span><span class="shadow scrim-multiply"></span><span class="content"></span></span></h2>`;
  el.querySelector('.content').addEventListener('dblclick', (e) => {
    if (e.target.closest('.name')) startEditing();
  });
}

// Swaps the name for an auto-sizing input. Enter/blur saves (empty keeps the old name), Esc reverts.
function startEditing() {
  editing = true;
  el.querySelector('.content').innerHTML = content();
  const input = el.querySelector('input.name');
  const mirror = el.querySelector('.hidden-span');
  input.focus();
  input.select();
  const finish = (saveIt) => {
    if (!editing) return;
    editing = false;
    const name = input.value.trim();
    if (saveIt && name && name !== state.settings.name) save({ settings: { ...state.settings, name } });
    else renderGreeting();
  };
  input.addEventListener('input', () => (mirror.innerHTML = esc(input.value).replace(/ /g, '&nbsp;')));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') {
      e.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}
