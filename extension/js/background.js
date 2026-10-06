// Catches what the rules in blocker.js miss. A site with a service worker (Gmail, YouTube) serves its pages
// from cache, so the page load never reaches the network and no declarativeNetRequest rule sees it.
// Whenever a tab's URL changes, a listed site that got through is sent to blocked.html or ask.html from here, with its URL in the hash.

import { condition, covers } from './sites.js';

chrome.tabs.onUpdated.addListener(async (tabId, { url }) => {
  if (!url?.startsWith('http')) return;
  const { blocked = [], ask = [] } = await chrome.storage.local.get(['blocked', 'ask']);
  const listed = (list) => list.some((site) => covers(condition(site), url));
  if (listed(blocked)) return chrome.tabs.update(tabId, { url: `${chrome.runtime.getURL('blocked.html')}#${url}` });
  if (!listed(ask)) return;
  // Yes on ask.html left an allow rule for this tab (js/ask.js), then the site is fine here.
  const passes = await chrome.declarativeNetRequest.getSessionRules();
  if (passes.some((r) => r.condition.tabIds.includes(tabId) && covers(r.condition, url))) return;
  chrome.tabs.update(tabId, { url: `${chrome.runtime.getURL('ask.html')}#${url}` });
});

// js/todo.js asks from every page of a Think twice site whether to show the site's todo list there.
// The answer is the list entry the page falls under, or null. No check for the Yes pass: reloading the extension wipes
// the session rules, and a page a service worker serves still opens without asking, the list should show there too.
// "done" (I'm done!, everything on the list checked) does what No does: the tab loses its pass and goes to the new tab page.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tab = sender.tab?.id;
  if (msg === 'done') {
    chrome.declarativeNetRequest.getSessionRules()
      .then((rules) => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.filter((r) => r.condition.tabIds?.includes(tab)).map((r) => r.id) }))
      .then(() => chrome.tabs.update(tab, { url: 'chrome://newtab' }));
    return;
  }
  if (msg !== 'todos') return;
  (async () => {
    const { ask = [] } = await chrome.storage.local.get('ask');
    const site = ask.find((s) => covers(condition(s), sender.url));
    reply(site ? { site } : null);
  })();
  return true;
});
