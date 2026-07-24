/**
 * 职责: 管理版本抽屉、Diff、冷启动、导入、API 与导出弹窗
 * 依赖内部: ../state/store.js, ../services/diff-engine.js, ./render.js
 * 依赖外部: DOM API
 * 暴露: dialogs | showToast
 */

import { store } from '../state/store.js';
import { buildDiff } from '../services/diff-engine.js';
import { escapeHtml } from './render.js';

const modalRoot = document.querySelector('#modal-root');
const drawerRoot = document.querySelector('#drawer-root');

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
  const cards = [...segment.translations].reverse().map((item) => versionCard(project, segment, item)).join('');
  const toggle = segment.translations.some((item) => item.postEditText) ? drawerDiffToggle() : '';
  drawerRoot.innerHTML = `<div class="drawer-backdrop" data-action="close-drawer"><aside class="drawer" data-drawer-stop>
    <header class="drawer-header"><div><div class="eyebrow">SEGMENT LINEAGE</div><h2 style="margin:0;font-family:var(--serif)">句段全部译文版本</h2></div>
      <div class="drawer-actions">${toggle}<button class="icon-button" data-action="close-drawer">×</button></div></header>
    <div class="drawer-body"><div class="brief-card"><strong>原文</strong><p class="version-text">${escapeHtml(segment.source)}</p></div>${cards || '<div class="empty-state">尚无译文版本</div>'}</div>
  </aside></div>`;
}

function drawerDiffToggle() {
  return '<button class="text-button" data-action="toggle-drawer-diffs" aria-pressed="false">隐藏全部 Diff</button>';
}

function versionCard(project, segment, item) {
  const prompt = project.prompts.find((candidate) => candidate.id === item.promptId);
  const index = segment.translations.indexOf(item) + 1;
  const isCurrent = segment.currentTranslationId === item.id;
  return `<article class="version-card ${isCurrent ? 'is-current' : ''}">
    <div class="version-meta"><strong>译文 T${index} · Prompt v${prompt?.version || '?'}</strong><span class="badge ${isCurrent ? 'badge-direction' : ''}">${isCurrent ? '当前显示' : item.createdAt}</span></div>
    <p class="muted" style="font-size:9px">${escapeHtml(item.author)} · ${escapeHtml(item.model)} · ${escapeHtml(item.contextSnapshot)}</p>
    <div class="version-text">${escapeHtml(item.postEditText || item.aiText)}</div>
    ${item.postEditText ? versionDiff(project, item) : '<span class="muted" style="font-size:9px">尚未进行人工译后编辑</span>'}
    ${isCurrent ? '' : `<button class="text-button" data-action="set-current-version" data-segment-id="${segment.id}" data-translation-id="${item.id}" style="float:right">设为当前显示</button>`}
    <details style="margin-top:12px"><summary class="text-button" style="cursor:pointer">查看绑定的完整 Prompt 快照</summary><div class="prompt-snapshot">${escapeHtml(item.promptSnapshot)}</div></details>
  </article>`;
}

function versionDiff(project, item) {
  const language = project.direction === 'EN → ZH' ? 'zh' : 'en';
  const diff = buildDiff(item.aiText, item.postEditText, language);
  return `<section class="version-diff" data-version-diff><div class="version-diff-title">AI → 人工 Diff</div>
    <div class="version-diff-content">${renderDiff(diff)}</div></section>`;
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

function openPromptModal(content = '') {
  const body = `<div class="form-group"><label for="prompt-title">版本名称</label><input id="prompt-title" class="field field-full" value="课堂共创优化"></div>
    <div class="form-group"><label for="prompt-note">修改说明</label><input id="prompt-note" class="field field-full" value="根据课堂讨论调整翻译策略"></div>
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

function openMentorDemo() {
  const body = `<span class="mentor-demo-label">SIMULATED SUGGESTION</span><p>系统发现多句译后编辑中反复出现两类修改：</p><ul><li>英文长句被拆分为更自然的中文信息单位。</li><li>“非凡、震撼”等宣传式措辞被弱化。</li></ul>
    <div class="diff-view"><span class="diff-added">新增规则：允许根据中文信息结构拆分长句；保持展览叙事克制，避免主动强化价值判断。</span></div>
    <p class="muted" style="margin-top:12px">正式版本将允许师生审核证据、修改补丁并创建 Prompt 草案；当前不执行任何写入。</p>`;
  modal('未来的译后学习工作流', body, '<button class="button button-primary" data-action="close-modal">了解</button>');
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
  openPromptModal,
  openImportModal,
  openApiModal,
  openExportModal,
  openTermModal,
  openMentorDemo,
};
