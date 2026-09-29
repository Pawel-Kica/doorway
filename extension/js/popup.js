// Photo popup opened from the bottom-left location, plus the 3s hover "admire mode".

import { state } from './store.js';
import { icon } from './icons.js';
import { esc, dismissOnOutside } from './dom.js';
import { getPhoto, isFavorite, toggleFavorite, showNext } from './photos.js';
import { openSettings, closeSettings } from './settings.js';

const popup = document.getElementById('photo-popup');
const locationEl = document.getElementById('location');
let open = false;
let admireTimer = null;

// Renders popup content for the current photo.
export function renderPopup() {
  const photo = getPhoto(state.current?.key);
  locationEl.classList.toggle('popup-active', open);
  popup.classList.toggle('open', open && !!photo);
  if (!photo) return;
  const fav = isFavorite(photo.key);
  const credit = photo.photographer
    ? photo.link
      ? `<a class="source-text" href="${esc(photo.link)}" target="_blank" rel="noopener">${esc(photo.photographer)}${icon('external')}</a>`
      : `<div class="source-text plain">${esc(photo.photographer)}</div>`
    : '';
  popup.innerHTML = `
    <div class="popup-header"><span class="title-icon">${icon('photoInfo')}</span><span class="title">Photo</span></div>
    <div class="popup-body">
      <div class="photo-meta">
        ${photo.location ? `<div class="photo-meta-title">${esc(photo.location)}</div>` : ''}
        ${credit}
      </div>
      <div class="dropdown-divider"></div>
      <div class="dropdown-option" data-act="fav">${icon(fav ? 'heartOff' : 'heart')}<span>${fav ? 'Unfavorite' : 'Favorite'}</span></div>
      <div class="dropdown-option" data-act="skip">${icon('redo')}<span>Skip to new photo</span></div>
      <div class="dropdown-divider"></div>
      <div class="dropdown-option" data-act="manage">${icon('images')}<span>Manage photos</span></div>
      <div class="dropdown-option" data-act="settings">${icon('gear')}<span>Settings</span></div>
    </div>`;
}

export function closePopup() {
  open = false;
  renderPopup();
}

// Admire mode hides widgets while the pointer rests on the location.
function setAdmire(on) {
  clearTimeout(admireTimer);
  document.body.classList.toggle('admire', on);
}

export function initPopup() {
  locationEl.addEventListener('click', () => {
    setAdmire(false);
    open = !open;
    if (open) closeSettings();
    renderPopup();
  });
  locationEl.addEventListener('mouseenter', () => {
    if (!open) admireTimer = setTimeout(() => setAdmire(true), 3000);
  });
  locationEl.addEventListener('mouseleave', () => setAdmire(false));
  window.addEventListener('blur', () => setAdmire(false));

  popup.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const key = state.current?.key;
    if (act === 'fav') toggleFavorite(key);
    if (act === 'skip') showNext();
    if (act === 'manage' || act === 'settings') {
      // Both open Photos, like Momentum
      closePopup();
      openSettings('photos');
    }
  });
  dismissOnOutside(() => [popup, locationEl], () => open, closePopup);
}
