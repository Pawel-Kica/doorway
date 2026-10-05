// Think twice page. blocker.js sends a listed site here as ask.html#<url>.
// Yes lets this tab open the site until the tab closes, No goes to the new tab page. Mouse only, on purpose.

import { condition, covers } from './sites.js';

const target = URL.parse(location.hash.slice(1));

const no = () => chrome.tabs.update({ url: 'chrome://newtab' });

// Adds an allow rule for the listed entry in this tab (gone when Chrome quits), then loads the site.
async function yes() {
  const { ask = [] } = await chrome.storage.local.get('ask');
  const { id: tab } = await chrome.tabs.getCurrent();
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  // The whole entry is allowed, not just this URL, so moving around the site does not ask again.
  const addRules = ask.filter((site) => covers(condition(site), target.href)).map((site, i) => (
    { id: Math.max(0, ...rules.map((r) => r.id)) + 1 + i, priority: 2, action: { type: 'allow' }, condition: { ...condition(site), tabIds: [tab] } }));
  await chrome.declarativeNetRequest.updateSessionRules({ addRules });
  location.replace(target.href);
}

// The page is web accessible, so any site can link here with its own hash. Only web addresses get asked about.
if (!/^https?:$/.test(target?.protocol)) no();
else {
  document.getElementById('site').textContent = target.hostname.replace(/^www\./, '');
  document.getElementById('yes').addEventListener('click', yes);
  document.getElementById('no').addEventListener('click', no);
}
