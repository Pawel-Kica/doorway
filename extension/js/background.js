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
