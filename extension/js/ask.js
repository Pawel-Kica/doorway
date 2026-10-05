// Think twice page. blocker.js sends a listed site here as ask.html#<url>.
// Yes asks what you need there, then lets this tab open the site until the tab closes. Later asks what you want to do
// there later, then goes to the new tab page, and No goes there right away. The answers are mouse only, on purpose.
// What you type lands in the site's todo list (storage `todos`), which js/todo.js shows on the site after a Yes.

import { condition, covers } from './sites.js';

const target = URL.parse(location.hash.slice(1));
const $ = (sel) => document.querySelector(sel);

const toNewTab = () => chrome.tabs.update({ url: 'chrome://newtab' });

// Shows one step: "question", "need" (after Yes) or "for-later".
function show(step) {
  for (const s of document.querySelectorAll('section')) s.hidden = s.id !== step;
  $(`#${step} input`)?.focus();
}

// "https://www.reddit.com/r/x/comments/1w6/gpt_6_astra/" -> "Gpt 6 astra", the way a saved link reads in the list.
function linkTitle({ hostname, pathname }) {
  const slug = pathname.split('/').filter((s) => /[a-z]{3}/i.test(s)).pop();
  if (!slug) return hostname.replace(/^www\./, '') + pathname.replace(/\/+$/, '');
  const words = decodeURIComponent(slug).replace(/[_-]+/g, ' ').replace(/\.\w+$/, '');
  return words[0].toUpperCase() + words.slice(1);
}

// The page is web accessible, so any site can link here with its own hash. Only web addresses get asked about.
if (!/^https?:$/.test(target?.protocol)) toNewTab();
else {
  const { ask = [] } = await chrome.storage.local.get('ask');
  // The list entry this URL falls under keeps the todos, so every page of the site shares one list.
  const entries = ask.filter((site) => covers(condition(site), target.href));
  const entry = entries[0] ?? target.hostname.replace(/^www\./, '');

  // Rewrites this site's todo list: [{ text, url?, later?, done? }], the first open item is the one on the pill.
  const updateList = async (fn) => {
    const { todos = {} } = await chrome.storage.local.get('todos');
    await chrome.storage.local.set({ todos: { ...todos, [entry]: fn(todos[entry] ?? []) } });
  };

  // Yes, then Open: what you typed goes on top, last visit's done items go. Then an allow rule for the entry
  // in this tab (gone when Chrome quits), so moving around the site does not ask again, and the site loads.
  const open = async () => {
    const text = $('#need input').value.trim();
    await updateList((list) => [...(text ? [{ text }] : []), ...list.filter((t) => !t.done)]);
    const { id: tab } = await chrome.tabs.getCurrent();
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const addRules = entries.map((site, i) => (
      { id: Math.max(0, ...rules.map((r) => r.id)) + 1 + i, priority: 2, action: { type: 'allow' }, condition: { ...condition(site), tabIds: [tab] } }));
    await chrome.declarativeNetRequest.updateSessionRules({ addRules });
    location.replace(target.href);
  };

  // Later: OK keeps the note, Save link keeps this URL too (titled from its path when nothing was typed). Empty OK just leaves.
  const later = async (withLink) => {
    const text = $('#for-later input').value.trim();
    if (text || withLink) await updateList((list) => [...list, { text: text || linkTitle(target), later: true, ...(withLink && { url: target.href }) }]);
    toNewTab();
  };

  for (const el of document.querySelectorAll('.site')) el.textContent = target.hostname.replace(/^www\./, '');
  $('#yes').addEventListener('click', () => show('need'));
  $('#later').addEventListener('click', () => show('for-later'));
  $('#no').addEventListener('click', toNewTab);
  for (const el of document.querySelectorAll('.back')) el.addEventListener('click', () => show('question'));
  $('#open').addEventListener('click', open);
  $('#ok').addEventListener('click', () => later(false));
  $('#save-link').addEventListener('click', () => later(true));
  $('#need input').addEventListener('keydown', (e) => e.key === 'Enter' && open());
  $('#for-later input').addEventListener('keydown', (e) => e.key === 'Enter' && later(false));
}
