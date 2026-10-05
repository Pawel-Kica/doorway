// Site entries of the Distractions lists, shared by blocker.js, ask.js and background.js. An entry is a domain with
// an optional path: "mail.google.com" covers the whole site and its subdomains, "mail.google.com/mail/u/0"
// only that path and what is under it, so /mail/u/1 stays free.

// "https://www.bbc.com/news/?x=1#top" -> "bbc.com/news"; '' when the text is not a site.
export function toSite(text) {
  const t = text.trim();
  try {
    const { hostname, pathname } = new URL(/^\w+:\/\//.test(t) ? t : `https://${t}`);
    const host = hostname.replace(/^www\./, '');
    return host.includes('.') ? host + pathname.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

// declarativeNetRequest condition for page loads of one entry. The regex takes the whole URL,
// so a redirect can pass it on as \0.
export function condition(site) {
  const [host] = site.split('/');
  const path = site.slice(host.length).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { requestDomains: [host], regexFilter: `^https?://[^/]+${path}([/?#].*)?$`, resourceTypes: ['main_frame'] };
}

// Whether a URL falls under such a condition. Chrome checks this itself for page loads, background.js does it by hand.
export function covers({ requestDomains, regexFilter }, url) {
  const { hostname } = new URL(url);
  return requestDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`)) && new RegExp(regexFilter, 'i').test(url);
}
