// Blocked page. blocker.js sends a blocked site here as blocked.html#<url>, and the message names it.
// Opened without a web address it keeps saying "this".

const host = URL.parse(location.hash.slice(1))?.hostname.replace(/^www\./, '');
if (host) {
  const site = document.getElementById('site');
  site.textContent = host;
  site.className = 'named';
}
