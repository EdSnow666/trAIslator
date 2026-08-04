/**
 * 职责: 管理三栏显示、拖拽宽度、独立内容缩放与本地偏好持久化
 * 依赖内部: 无
 * 依赖外部: DOM API, localStorage
 * 暴露: initLayoutPreferences | getLayoutPreferences | setPaneVisibility | togglePaneVisibility | resetLayoutPreferences
 */

const STORAGE_KEY = 'translation-aiducator-layout-v1';
const DEFAULTS = {
  widths: { left: 260, right: 340 },
  zoom: { left: 1, center: 1, right: 1 },
  visibility: { left: false, right: false },
};
const LIMITS = { left: 190, right: 250, center: 480, zoomMin: 0.75, zoomMax: 1.5 };
const PANE_LABELS = { left: '左栏', center: '中央栏', right: '右栏' };
let preferences = loadPreferences();
let activePane = 'center';
let dragState = null;
let persistTimer = null;
let initialized = false;

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return sanitizePreferences(saved);
  } catch (error) {
    console.warn('布局偏好读取失败，已使用默认比例。', error);
    return structuredClone(DEFAULTS);
  }
}

function sanitizePreferences(saved) {
  return {
    widths: {
      left: clamp(Number(saved.widths?.left) || DEFAULTS.widths.left, LIMITS.left, 900),
      right: clamp(Number(saved.widths?.right) || DEFAULTS.widths.right, LIMITS.right, 900),
    },
    zoom: {
      left: sanitizeZoom(saved.zoom?.left),
      center: sanitizeZoom(saved.zoom?.center),
      right: sanitizeZoom(saved.zoom?.right),
    },
    visibility: {
      left: saved.visibility?.left === true,
      right: saved.visibility?.right === true,
    },
  };
}

function sanitizeZoom(value) {
  return clamp(Number(value) || 1, LIMITS.zoomMin, LIMITS.zoomMax);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function persistPreferences() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

function persistSoon() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persistPreferences, 120);
}

function applyWidths() {
  const workspace = document.querySelector('.workspace');
  fitWidths(workspace);
  workspace.style.setProperty('--left-pane-width', `${Math.round(preferences.widths.left)}px`);
  workspace.style.setProperty('--right-pane-width', `${Math.round(preferences.widths.right)}px`);
}

function fitWidths(workspace) {
  const visibleSides = ['left', 'right'].filter((side) => preferences.visibility[side]);
  if (!visibleSides.length) return;
  const handlesWidth = visibleSides.length * 6;
  const maximum = workspace.getBoundingClientRect().width - LIMITS.center - handlesWidth;
  if (visibleSides.length === 1) return fitSingleWidth(visibleSides[0], maximum);
  fitBothWidths(maximum);
}

function fitSingleWidth(side, maximum) {
  preferences.widths[side] = clamp(preferences.widths[side], LIMITS[side], maximum);
}

function fitBothWidths(maximum) {
  const overflow = preferences.widths.left + preferences.widths.right - maximum;
  if (overflow <= 0) return;
  preferences.widths.left = Math.max(LIMITS.left, preferences.widths.left - overflow / 2);
  preferences.widths.right = Math.max(LIMITS.right, maximum - preferences.widths.left);
}

function applyZoom(paneName) {
  const pane = document.querySelector(`[data-pane="${paneName}"]`);
  pane?.style.setProperty('--pane-zoom', preferences.zoom[paneName]);
}

function applyVisibility() {
  const workspace = document.querySelector('.workspace');
  ['left', 'right'].forEach((side) => applySideVisibility(workspace, side));
}

function applySideVisibility(workspace, side) {
  const visible = preferences.visibility[side];
  workspace.classList.toggle(`is-${side}-hidden`, !visible);
  document.querySelectorAll(`[data-pane-target="${side}"]`).forEach((button) => {
    button.setAttribute('aria-pressed', String(visible));
  });
  document.querySelectorAll(`[data-pane-check="${side}"]`).forEach((check) => {
    check.classList.toggle('is-visible', visible);
  });
}

function applyPreferences() {
  applyVisibility();
  applyWidths();
  Object.keys(preferences.zoom).forEach(applyZoom);
  focusPane(activePane, false);
}

function focusPane(paneName, announceFocus = true) {
  if (!PANE_LABELS[paneName]) return;
  activePane = paneName;
  document.querySelectorAll('[data-pane]').forEach((pane) => {
    pane.classList.toggle('is-pane-focused', pane.dataset.pane === paneName);
  });
  if (announceFocus) announce(`${PANE_LABELS[paneName]}已聚焦，可用 Ctrl +/- 或 Ctrl+滚轮缩放。`);
}

function adjustZoom(paneName, delta) {
  const current = preferences.zoom[paneName];
  preferences.zoom[paneName] = Math.round(clamp(current + delta, LIMITS.zoomMin, LIMITS.zoomMax) * 100) / 100;
  applyZoom(paneName);
  persistSoon();
  announce(`${PANE_LABELS[paneName]}缩放：${Math.round(preferences.zoom[paneName] * 100)}%`);
}

function handleKeyboard(event) {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (['+', '='].includes(event.key)) return changeZoomFromKey(event, 0.05);
  if (['-', '_'].includes(event.key)) changeZoomFromKey(event, -0.05);
}

function changeZoomFromKey(event, delta) {
  event.preventDefault();
  adjustZoom(activePane, delta);
}

function handleWheel(event) {
  if (!(event.ctrlKey || event.metaKey)) return;
  const pane = event.target.closest('[data-pane]');
  if (!pane) return;
  event.preventDefault();
  focusPane(pane.dataset.pane, false);
  adjustZoom(pane.dataset.pane, event.deltaY < 0 ? 0.05 : -0.05);
}

function startDrag(event) {
  if (event.button !== 0) return;
  const handle = event.currentTarget;
  dragState = { handle, side: handle.dataset.resizer, pointerId: event.pointerId };
  handle.setPointerCapture(event.pointerId);
  handle.classList.add('is-dragging');
  document.body.classList.add('is-resizing-columns');
}

function moveDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const workspace = document.querySelector('.workspace');
  const rect = workspace.getBoundingClientRect();
  updateDraggedWidth(dragState.side, event.clientX, rect);
  applyWidths();
}

function updateDraggedWidth(side, pointerX, rect) {
  const otherSide = side === 'left' ? 'right' : 'left';
  const otherWidth = preferences.visibility[otherSide] ? preferences.widths[otherSide] + 6 : 0;
  const maximum = rect.width - otherWidth - LIMITS.center - 6;
  const proposed = side === 'left' ? pointerX - rect.left : rect.right - pointerX;
  preferences.widths[side] = clamp(proposed, LIMITS[side], maximum);
}

function finishDrag(event = {}) {
  if (!dragState) return;
  if (event.pointerId != null && event.pointerId !== dragState.pointerId) return;
  const { handle, pointerId } = dragState;
  dragState = null;
  handle.classList.remove('is-dragging');
  document.body.classList.remove('is-resizing-columns');
  if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  persistPreferences();
  announce('分栏宽度已保存。');
}

function handleResizerKey(event) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const amount = event.key === 'ArrowLeft' ? -16 : 16;
  const side = event.currentTarget.dataset.resizer;
  preferences.widths[side] += side === 'left' ? amount : -amount;
  applyWidths();
  persistSoon();
}

function bindResizers() {
  document.querySelectorAll('[data-resizer]').forEach((handle) => {
    handle.addEventListener('pointerdown', startDrag);
    handle.addEventListener('pointermove', moveDrag);
    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
    handle.addEventListener('keydown', handleResizerKey);
  });
  window.addEventListener('mouseup', finishDrag);
  window.addEventListener('blur', finishDrag);
}

function bindPaneControls() {
  const workspace = document.querySelector('.workspace');
  workspace.addEventListener('pointerdown', (event) => {
    const pane = event.target.closest('[data-pane]');
    if (pane) focusPane(pane.dataset.pane, false);
  });
  workspace.addEventListener('wheel', handleWheel, { passive: false });
  document.addEventListener('keydown', handleKeyboard);
}

function announce(message) {
  const status = document.querySelector('#save-status');
  if (!status) return;
  status.textContent = message;
  window.setTimeout(() => { status.textContent = '所有更改保存在本机'; }, 1800);
}

export function setPaneVisibility(side, visible) {
  if (!['left', 'right'].includes(side)) return;
  preferences.visibility[side] = Boolean(visible);
  if (!preferences.visibility[side] && activePane === side) focusPane('center', false);
  applyVisibility();
  applyWidths();
  persistPreferences();
  announce(`${PANE_LABELS[side]}已${preferences.visibility[side] ? '显示' : '隐藏'}。`);
}

export function togglePaneVisibility(side) {
  if (!['left', 'right'].includes(side)) return;
  setPaneVisibility(side, !preferences.visibility[side]);
}

export function resetLayoutPreferences() {
  preferences = structuredClone(DEFAULTS);
  activePane = 'center';
  applyPreferences();
  persistPreferences();
  announce('已恢复默认显示，仅保留中央编辑器。');
}

export function initLayoutPreferences() {
  if (initialized) return;
  initialized = true;
  applyPreferences();
  bindResizers();
  bindPaneControls();
  window.addEventListener('resize', applyWidths);
}

export function getLayoutPreferences() {
  return structuredClone(preferences);
}