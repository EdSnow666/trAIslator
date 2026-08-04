/**
 * 职责: 管理版本抽屉、Prompt 谱系、Diff、冷启动、导入、API 与导出弹窗
 * 依赖内部: ../state/store.js, ../services/diff-engine.js, ../services/ai-post-edit.js, ./render.js
 * 依赖外部: DOM API
 * 暴露: dialogs | showToast
 */

import { store } from '../state/store.js?v=20260804-01';
import { buildDiff } from '../services/diff-engine.js';
import { resolveAiPostEdit } from '../services/ai-post-edit.js?v=20260804-01';
import { escapeHtml } from './render.js?v=20260804-01';

const modalRoot = document.querySelector('#modal-root');
const drawerRoot = document.querySelector('#drawer-root');

function promptLabel(prompt) {
  return prompt?.displayLabel || `v${prompt?.version || '?'}`;
}

function isManualTranslation(item) {
  return Boolean(item && (item.origin === 'manual' || !item.promptId));
}

function modal(title, body, footer = '') {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" data-modal-stop>
    <header class="modal-header"><h2 style="margin:0;font-family:var(--serif)">${escapeHtml(title)}</h2><button class="icon-button" data-action="close-modal">×</button></header>
    <div class="modal-body">${body}</div>${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}</section></div>`;
}

function closeModal() {
  modalRoot.innerHTML = '';
}

function closeDrawer() {
  drawerRoot.innerHTML = '';
}

function openVersionDrawer(segmentId) {
  const project = store.getProject();
  const segment = store.getSegment(segmentId);
  const cards = versionCards(project, segment);
  const hasDiff = segment.translations.some((item) => item.postEditText || item.aiPostEdit);
  const toggle = hasDiff ? drawerDiffToggle() : '';
  drawerRoot.innerHTML = `<div class="drawer-backdrop" data-action="close-drawer"><aside class="drawer" data-drawer-stop>
    <header class="drawer-header"><div><div class="eyebrow">SEGMENT LINEAGE</div><h2 style="margin:0;font-family:var(--serif)">句段全部译文版本</h2></div>
      <div class="drawer-actions">${toggle}<button class="icon-button" data-action="close-drawer">×</button></div></header>
    <div class="drawer-body"><div class="brief-card"><strong>原文</strong><p class="version-text">${escapeHtml(segment.source)}</p></div>${cards || '<div class="empty-state">尚无译文版本</div>'}</div>
  </aside></div>`;
}

function versionCards(project, segment) {
  const versions = [...segment.translations].sort((left, right) => {
    const currentOrder = Number(right.id === segment.currentTranslationId)
      - Number(left.id === segment.currentTranslationId);
    return currentOrder || segment.translations.indexOf(right) - segment.translations.indexOf(left);
  });
  return versions.map((item) => {
    const regular = versionCard(project, segment, item);
    if (!item.aiPostEdit) return regular;
    const aiVersion = aiPostEditVersionCard(project, segment, item);
    return item.id === segment.currentTranslationId
      ? `${aiVersion}${regular}` : `${regular}${aiVersion}`;
  }).join('');
}
function drawerDiffToggle() {
  return '<button class="text-button" data-action="toggle-drawer-diffs" aria-pressed="false">隐藏全部 Diff</button>';
}

function versionCard(project, segment, item) {
  const prompt = project.prompts.find((candidate) => candidate.id === item.promptId);
  const index = segment.translations.indexOf(item) + 1;
  const isSelectedBase = segment.currentTranslationId === item.id;
  const hasAiVersion = Boolean(item.aiPostEdit);
  const isCurrent = isSelectedBase && !hasAiVersion;
  const displayText = hasAiVersion ? item.aiText : (item.postEditText || item.aiText);
  const revision = hasAiVersion ? '<span class="muted" style="font-size:9px">原始译文版本，不显示 Diff</span>' : versionRevision(project, item);
  return `<article class="version-card ${isCurrent ? 'is-current' : ''}">
    <div class="version-meta"><strong>译文 T${index} · ${escapeHtml(versionSourceLabel(item, prompt))}</strong><span class="badge ${isCurrent ? 'badge-direction' : ''}">${isCurrent ? '当前显示' : item.createdAt}</span></div>
    <p class="muted" style="font-size:9px">${escapeHtml(item.author)} · ${escapeHtml(item.model)} · ${escapeHtml(item.contextSnapshot)}</p>
    <div class="version-text">${escapeHtml(displayText)}</div>
    ${revision}${drawerBaseVersionAction(segment, item, isCurrent, hasAiVersion)}
    ${versionPromptSnapshot(item)}
  </article>`;
}

function drawerBaseVersionAction(segment, item, isCurrent, hasAiVersion) {
  if (isCurrent) return '';
  const action = hasAiVersion ? 'discard-ai-post-edit' : 'set-current-version';
  return `<button class="text-button" data-action="${action}" data-segment-id="${segment.id}" data-translation-id="${item.id}" style="float:right">设为当前显示</button>`;
}

function aiPostEditVersionCard(project, segment, item) {
  const edit = item.aiPostEdit;
  const index = segment.translations.indexOf(item) + 1;
  const isCurrent = segment.currentTranslationId === item.id;
  const aiEdited = resolvedDrawerAiEdit(project, edit);
  const humanText = item.postEditText || aiEdited;
  const aiDiff = drawerVersionDiff(project, 'AI → AI编辑 Diff', edit.baseText, aiEdited, 'AI 编辑结果与原译一致', 'ai-edit');
  const humanDiff = drawerVersionDiff(project, 'AI编辑Diff → 人工 Diff', aiEdited, humanText, '尚无额外人工修改');
  const action = isCurrent ? '' : drawerAiVersionAction(segment, item);
  return `<article class="version-card is-ai-post-edit-version ${isCurrent ? 'is-current' : ''}">
    <div class="version-meta"><strong>AI 译后编辑版本 · T${index}-AI</strong><span class="badge badge-direction">${isCurrent ? '当前显示' : 'AI 译后编辑'}</span></div>
    <p class="muted" style="font-size:9px">Prompt ${escapeHtml(edit.promptLabel)} · ${escapeHtml(edit.promptTitle)} · ${escapeHtml(edit.model)} · ${escapeHtml(edit.createdAt)}</p>
    <div class="version-text">${escapeHtml(humanText)}</div>
    ${aiDiff}${humanDiff}${action}
    <details style="margin-top:12px"><summary class="text-button" style="cursor:pointer">查看绑定的完整 Prompt 快照</summary><div class="prompt-snapshot">${escapeHtml(edit.promptSnapshot)}</div></details>
  </article>`;
}

function drawerAiVersionAction(segment, item) {
  return `<button class="text-button" data-action="set-current-version" data-segment-id="${segment.id}" data-translation-id="${item.id}" style="float:right">设为当前显示</button>`;
}
function resolvedDrawerAiEdit(project, edit) {
  if (edit.status === 'applied' && typeof edit.resultText === 'string') return edit.resultText;
  return resolveAiPostEdit(edit, project.direction, true);
}
function versionSourceLabel(item, prompt) {
  return isManualTranslation(item) ? '参考译文 · 人工翻译' : `Prompt ${promptLabel(prompt)}`;
}

function versionRevision(project, item) {
  if (isManualTranslation(item)) return '<span class="muted" style="font-size:9px">人工参考译文，不适用 AI → 人工 Diff</span>';
  return item.postEditText ? versionDiff(project, item) : '<span class="muted" style="font-size:9px">尚未进行人工译后编辑</span>';
}

function versionPromptSnapshot(item) {
  if (isManualTranslation(item)) return '<div class="manual-translation-note is-compact"><strong>无 Prompt</strong><p>由用户手动翻译。</p></div>';
  return `<details style="margin-top:12px"><summary class="text-button" style="cursor:pointer">查看绑定的完整 Prompt 快照</summary><div class="prompt-snapshot">${escapeHtml(item.promptSnapshot)}</div></details>`;
}

function versionDiff(project, item) {
  const language = project.direction === 'EN → ZH' ? 'zh' : 'en';
  const diff = buildDiff(item.aiText, item.postEditText, language);
  return `<section class="version-diff" data-version-diff><div class="version-diff-title">AI → 人工 Diff</div>
    <div class="version-diff-content">${renderDiff(diff)}</div></section>`;
}

function drawerVersionDiff(project, title, before, after, unchanged, theme = '') {
  const language = project.direction === 'EN → ZH' ? 'zh' : 'en';
  const diff = buildDiff(before || '', after || '', language);
  const content = diff.every((part) => part.type === 'same')
    ? `<span class="diff-unchanged">${unchanged}</span>` : renderDiff(diff);
  const themeClass = theme === 'ai-edit' ? ' is-ai-edit-diff' : '';
  return `<section class="version-diff${themeClass}" data-version-diff><div class="version-diff-title">${title}</div>
    <div class="version-diff-content">${content}</div></section>`;
}
function toggleDrawerDiffs(trigger) {
  const hidden = trigger.dataset.hidden !== 'true';
  drawerRoot.querySelectorAll('[data-version-diff]').forEach((panel) => { panel.hidden = hidden; });
  trigger.dataset.hidden = String(hidden);
  trigger.setAttribute('aria-pressed', String(hidden));
  trigger.textContent = hidden ? '显示全部 Diff' : '隐藏全部 Diff';
}

function renderDiff(parts) {
  return parts.map((part) => {
    const className = part.type === 'added' ? 'diff-added' : part.type === 'removed' ? 'diff-removed' : '';
    return `<span class="${className}">${escapeHtml(part.value)}</span>`;
  }).join('');
}

function openBriefModal() {
  const project = store.getProject();
  const body = `<div class="eyebrow">IDENTIFICATION · COLD START</div><p class="muted">预存任务书模拟了未来 AI 对文本类型、目的和风格的识别。所有字段均需师生确认。</p>
    <dl class="prompt-meta-card">${Object.entries(project.brief).map(([key, value]) => `<div class="meta-row"><dt>${briefLabel(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    <div class="brief-card"><strong>确认后如何使用？</strong><p class="muted" style="margin-top:7px;line-height:1.6">任务书会与项目 Prompt、术语、TM 和相邻句段一起编译，并在每次生成时冻结为可追溯快照。</p></div>`;
  modal('翻译任务识别与风格建议', body, '<button class="button button-primary" data-action="close-modal">确认任务书</button>');
}

function briefLabel(key) {
  return { genre: '文本类型', skopos: '翻译目的', audience: '目标读者', register: '语域', strategy: '策略' }[key] || key;
}

function openPromptLineageModal() {
  const project = store.getProject();
  const items = [...project.prompts].sort((a, b) => b.version - a.version);
  const cards = items.map((prompt) => promptLineageCard(project, prompt)).join('');
  const body = `<p class="muted prompt-lineage-intro">每个版本均保留完整内容、作者和修改说明。切换当前 Prompt 只影响后续生成，旧译文仍绑定原版本。</p>
    <div class="prompt-lineage-modal">${cards}</div>`;
  modal('Prompt 谱系', body, '<button class="button button-ghost" data-action="close-modal">关闭</button>');
}

function promptLineageCard(project, prompt) {
  const isActive = prompt.id === project.activePromptId;
  const action = isActive
    ? '<span class="badge badge-direction">当前使用</span>'
    : `<button class="button button-soft" data-action="activate-prompt" data-prompt-id="${prompt.id}">设为当前 Prompt</button>`;
  return `<article class="prompt-lineage-card ${isActive ? 'is-active' : ''}">
    <header class="prompt-lineage-card-header"><div><span class="prompt-version">${escapeHtml(promptLabel(prompt))}</span><strong>${escapeHtml(prompt.title)}</strong></div>${action}</header>
    <p class="prompt-lineage-meta">${escapeHtml(prompt.author)} · ${escapeHtml(prompt.role)} · ${escapeHtml(prompt.createdAt)}</p>
    <p class="prompt-lineage-note">${escapeHtml(prompt.note)}</p>
    <div class="prompt-lineage-content">${escapeHtml(prompt.content)}</div>
  </article>`;
}
function openPromptModal(content = '', options = {}) {
  const title = escapeHtml(options.title || '课堂共创优化');
  const note = escapeHtml(options.note || '根据课堂讨论调整翻译策略');
  const body = `<div class="form-group"><label for="prompt-title">版本名称</label><input id="prompt-title" class="field field-full" value="${title}"></div>
    <div class="form-group"><label for="prompt-note">修改说明</label><input id="prompt-note" class="field field-full" value="${note}"></div>
    <div class="form-group"><label for="prompt-content">新 Prompt 内容</label><textarea id="prompt-content" class="field field-full">${escapeHtml(content)}</textarea></div>
    <p class="muted" style="font-size:10px">保存后创建新版本；既有译文继续绑定原 Prompt。</p>`;
  modal('创建 Prompt 新版本', body, '<button class="button button-ghost" data-action="close-modal">取消</button><button class="button button-primary" data-action="save-prompt-version">发布新版本</button>');
}

function openImportModal() {
  const body = `<div class="form-group"><label for="import-name">项目名称</label><input id="import-name" class="field field-full" value="新建课堂翻译项目"></div>
    <div class="form-group"><label for="import-direction">翻译方向</label><select id="import-direction" class="field field-full"><option>EN → ZH</option><option>ZH → EN</option></select></div>
    <div class="form-group"><label for="import-file">导入 TXT（可选）</label><input id="import-file" type="file" accept=".txt,text/plain" class="field field-full"></div>
    <div class="form-group"><label for="import-text">或粘贴原文</label><textarea id="import-text" class="field field-full" placeholder="粘贴后将自动按句切分"></textarea></div>`;
  modal('导入并自动切分原文', body, '<button class="button button-ghost" data-action="close-modal">取消</button><button class="button button-primary" data-action="create-import-project">创建项目</button>');
}

function openApiModal() {
  const config = store.getState().apiConfig;
  const body = `<div class="mentor-card"><span class="mentor-demo-label">INTERFACE ONLY</span><strong>实时调用尚未启用</strong><p>当前页面只保存接口形状，不会发送 API 请求。</p></div>
    <div class="form-group"><label for="api-base">OpenAI-compatible Base URL</label><input id="api-base" class="field field-full" value="${escapeHtml(config.baseUrl)}" placeholder="https://api.example.com/v1"></div>
    <div class="form-group"><label for="api-model">模型名称</label><input id="api-model" class="field field-full" value="${escapeHtml(config.model)}" placeholder="model-name"></div>
    <div class="form-group"><label for="api-key">API Key（不会写入项目或导出文件）</label><input id="api-key" type="password" class="field field-full" value="" placeholder="仅当前会话保留"></div>`;
  modal('预留 API 接口', body, '<button class="button button-ghost" data-action="close-modal">取消</button><button class="button button-primary" data-action="save-api-config">保存接口配置</button>');
}

function openExportModal() {
  const body = `<p class="muted">项目 JSON 保留 Prompt、译文版本和人工编辑；双语 HTML 适合课堂展示或打印。</p>
    <div class="brief-card"><strong>完整项目 JSON</strong><p>可在未来恢复项目或迁移到后端。</p><button class="button button-secondary button-full" data-action="download-json">下载 JSON</button></div>
    <div class="brief-card"><strong>双语 HTML</strong><p>导出每句当前显示译文及其 Prompt 版本。</p><button class="button button-soft button-full" data-action="download-html">下载双语 HTML</button></div>`;
  modal('导出教学项目', body);
}

function openTermModal() {
  const body = `<div class="form-group"><label for="term-source">原词</label><input id="term-source" class="field field-full"></div>
    <div class="form-group"><label for="term-target">译词</label><input id="term-target" class="field field-full"></div>
    <div class="form-group"><label for="term-note">说明</label><input id="term-note" class="field field-full" placeholder="项目统一译法"></div>`;
  modal('添加项目术语', body, '<button class="button button-ghost" data-action="close-modal">取消</button><button class="button button-primary" data-action="save-term">添加术语</button>');
}


export function showToast(message) {
  const root = document.querySelector('#toast-root');
  root.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  window.setTimeout(() => { root.innerHTML = ''; }, 2400);
}

export const dialogs = {
  closeModal,
  closeDrawer,
  openVersionDrawer,
  toggleDrawerDiffs,
  openBriefModal,
  openPromptLineageModal,
  openPromptModal,
  openImportModal,
  openApiModal,
  openExportModal,
  openTermModal,
};
