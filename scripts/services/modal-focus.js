/**
 * 职责: 防止弹窗因外部点击丢失，并把键盘焦点约束在当前弹窗内
 * 依赖内部: 无
 * 依赖外部: DOM API
 * 暴露: initModalFocusGuard
 */

const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
function activeModal() { return document.querySelector('#modal-root .modal'); }
function focusables(modal) {
  return [...modal.querySelectorAll(focusableSelector)].filter((item) => !item.hidden);
}
function focusFirst(modal) {
  const preferred = modal.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
  const target = preferred || focusables(modal)[0] || modal;
  if (target === modal) modal.tabIndex = -1;
  target.focus({ preventScroll: true });
}
function keepFocus(event) {
  const modal = activeModal();
  if (modal && !modal.contains(event.target)) focusFirst(modal);
}
function trapTab(event) {
  const modal = activeModal();
  if (!modal || event.key !== 'Tab') return;
  const items = focusables(modal);
  if (!items.length) return focusFirst(modal);
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) last.focus();
  else if (!event.shiftKey && document.activeElement === last) first.focus();
  else return;
  event.preventDefault();
}
export function initModalFocusGuard() {
  document.addEventListener('focusin', keepFocus);
  document.addEventListener('keydown', trapTab);
  const root = document.querySelector('#modal-root');
  new MutationObserver(() => {
    const modal = activeModal();
    if (modal) requestAnimationFrame(() => focusFirst(modal));
  }).observe(root, { childList: true });
}