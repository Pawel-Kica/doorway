// Small DOM helpers shared by the UI modules.

// Escapes text for use inside innerHTML templates.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Toggle switch markup (Momentum style).
export const toggle = (on) => `<span class="toggle-switch${on ? ' on' : ''}"></span>`;

// Calls close() on mousedown outside all `els` or on Escape, while isOpen() is true.
export function dismissOnOutside(els, isOpen, close) {
  document.addEventListener('mousedown', (e) => {
    if (isOpen() && !els().some((el) => el?.contains(e.target))) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });
}
