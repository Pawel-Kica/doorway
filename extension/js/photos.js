// Photo library (bundled stock + custom IndexedDB photos), feed rotation and preloading.

import { state, save, emit, broadcast } from './store.js';
import { dbAll, dbPut, dbDelete } from './db.js';

let stock = []; // photos/stock.json entries
let custom = []; // IndexedDB records, newest first
const blobUrls = new Map(); // "<id>:blob|thumb" -> object URL
let preloaded = null; // keeps the preloading <img> alive

// Loads stock metadata and custom photo records.
export async function loadPhotos() {
  const [s, c] = await Promise.all([
    fetch('photos/stock.json').then((r) => r.json()).catch(() => []),
    dbAll(),
  ]);
  stock = s;
  custom = c.sort((a, b) => b.addedAt - a.addedAt);
}

const typeOf = (key) => key?.slice(0, key.indexOf(':'));
const idOf = (key) => key?.slice(key.indexOf(':') + 1);

// Object URL for a custom photo blob, created once and cached.
function blobUrl(rec, field) {
  const k = `${rec.id}:${field}`;
  if (!blobUrls.has(k)) blobUrls.set(k, URL.createObjectURL(rec[field]));
  return blobUrls.get(k);
}

// True if the key points at a photo that still exists.
export function exists(key) {
  const id = idOf(key);
  if (typeOf(key) === 'stock') return stock.some((p) => p.id === id);
  return custom.some((p) => p.id === id);
}

// View model for a photo key, or null if it is gone.
export function getPhoto(key) {
  const id = idOf(key);
  if (typeOf(key) === 'stock') {
    const p = stock.find((p) => p.id === id);
    return p && { key, url: p.file, thumb: p.thumb, location: p.location, photographer: p.photographer,
      link: p.sourceUrl || p.photographerUrl, custom: false, id };
  }
  const p = custom.find((p) => p.id === id);
  return p && { key, url: blobUrl(p, 'blob'), thumb: blobUrl(p, 'thumb'), location: p.location,
    photographer: p.photographer, link: '', custom: true, id };
}

export const stockKeys = () => stock.map((p) => `stock:${p.id}`);
export const customKeys = () => custom.map((p) => `custom:${p.id}`);

// Keys of the selected feed; empty feeds fall back to stock.
function activeFeed() {
  const { feed } = state.settings;
  const keys = feed === 'custom' ? customKeys() : feed === 'favorites' ? state.favorites.filter(exists) : stockKeys();
  return keys.length ? { name: feed, keys } : { name: 'stock', keys: stockKeys() };
}

// Fisher-Yates shuffle (copy).
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Persisted shuffled order for a feed, synced with its current keys; order[i] is always the next photo.
function syncQueue(name, keys) {
  const q = state.queues[name] || { order: [], i: 0 };
  const valid = new Set(keys);
  let seen = q.order.slice(0, q.i).filter((k) => valid.has(k));
  let rest = q.order.slice(q.i).filter((k) => valid.has(k));
  const known = new Set([...seen, ...rest]);
  rest = rest.concat(shuffle(keys.filter((k) => !known.has(k))));
  if (!rest.length) {
    // Feed exhausted: start a new cycle, avoiding an immediate repeat.
    seen = [];
    rest = shuffle(keys);
    if (rest.length > 1 && rest[0] === state.current?.key) rest.push(rest.shift());
  }
  return { order: [...seen, ...rest], i: seen.length };
}

const HOUR = 3600e3;

// Rotation period saved with the current photo: { slot } id for tab/hour/day,
// or for 'random' { nextChangeAt }, a timestamp rolled 6-12h ahead.
export function periodFor(frequency, now = new Date()) {
  if (frequency === 'random') return { nextChangeAt: now.getTime() + (6 + Math.random() * 6) * HOUR };
  if (frequency === 'tab') return { slot: `tab:${now.getTime()}:${Math.random()}` };
  const d = new Date(now);
  if (frequency === 'day') d.setHours(d.getHours() - 4); // day rolls over at 4:00
  const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return { slot: frequency === 'day' ? day : `${day} ${d.getHours()}h` };
}

// True while the current photo is still within its period.
function inPeriod(current, frequency, now = new Date()) {
  if (frequency === 'random') return now.getTime() < current.nextChangeAt;
  return current.slot === periodFor(frequency, now).slot;
}

// Makes a photo the background now, starts a new period and records it in history.
export function setCurrent(key, extra = {}) {
  const history = [key, ...state.history.filter((k) => k !== key)].slice(0, 100);
  return save({ current: { key, ...periodFor(state.settings.frequency) }, history, ...extra });
}

// Advances to the next photo of the active feed (Skip, new period, feed change).
export function showNext() {
  const { name, keys } = activeFeed();
  if (!keys.length) return;
  const q = syncQueue(name, keys);
  const key = q.order[q.i];
  q.i += 1;
  return setCurrent(key, { queues: { ...state.queues, [name]: q } });
}

// Called on new tab: keep the current photo within its period, otherwise advance.
export function ensureCurrent() {
  const c = state.current;
  if (c && exists(c.key) && inPeriod(c, state.settings.frequency)) return;
  return showNext();
}

// Decodes the photo Skip / the next period would show, so it appears instantly.
export function preloadNext() {
  const { name, keys } = activeFeed();
  if (!keys.length) return;
  const q = syncQueue(name, keys);
  const p = getPhoto(q.order[q.i]);
  if (!p || preloaded?.dataset.key === p.key) return;
  preloaded = new Image();
  preloaded.dataset.key = p.key;
  preloaded.src = p.url;
  preloaded.decode().catch(() => {});
}

export const isFavorite = (key) => state.favorites.includes(key);

// Adds or removes a photo from favorites.
export function toggleFavorite(key) {
  const favorites = isFavorite(key) ? state.favorites.filter((k) => k !== key) : [key, ...state.favorites];
  return save({ favorites });
}

// Downscales a bitmap so its longest side is at most `max`, as a JPEG blob.
async function resize(bitmap, max) {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
}

// Stores image files as custom photos (full 2560px + 480px thumb). Returns new keys in input order.
export async function addFiles(files) {
  const added = [];
  let t = Date.now();
  for (const file of files) {
    if (!/^image\//.test(file.type) && !/\.(gif|jpe?g|png|webp|avif|tiff?)$/i.test(file.name)) continue;
    try {
      const bitmap = await createImageBitmap(file);
      const rec = { id: crypto.randomUUID(), blob: await resize(bitmap, 2560), thumb: await resize(bitmap, 480),
        location: file.name.replace(/\.[^.]+$/, ''), photographer: '', addedAt: t++ };
      bitmap.close();
      await dbPut(rec);
      added.push(rec);
    } catch (err) {
      console.warn(`Could not add ${file.name}`, err);
    }
  }
  custom = [...[...added].reverse(), ...custom]; // newest first
  emit();
  return added.map((r) => `custom:${r.id}`);
}

// Saves location / photographer edits for a custom photo.
export async function updateCustom(id, patch) {
  const rec = custom.find((p) => p.id === id);
  if (!rec) return;
  Object.assign(rec, patch);
  await dbPut(rec);
  emit();
  broadcast();
}

// Deletes a custom photo and every reference to it; moves on if it was the background.
export async function deleteCustom(id) {
  const key = `custom:${id}`;
  await dbDelete(id);
  custom = custom.filter((p) => p.id !== id);
  const wasCurrent = state.current?.key === key;
  await save({ favorites: state.favorites.filter((k) => k !== key), history: state.history.filter((k) => k !== key) });
  if (wasCurrent) await showNext();
  // Revoke later so a fading-out background layer can still paint.
  setTimeout(() => {
    for (const f of ['blob', 'thumb']) {
      URL.revokeObjectURL(blobUrls.get(`${id}:${f}`));
      blobUrls.delete(`${id}:${f}`);
    }
  }, 3000);
}
