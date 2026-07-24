/**
 * 职责: 将当前项目状态渲染为 CAT 工作台、资源面板与版本导航
 * 依赖内部: ../state/store.js, ../services/diff-engine.js
 * 依赖外部: DOM API
 * 暴露: renderApp | escapeHtml | renderLiveDiff | renderDiffParts
 */

import { store } from '../state/store.js';
import { buildDiff } from '../services/diff-engine.js';

const STATUS_TEXT = {
  empty: '待生成',
  translated: '待确认',
  edited: '已编辑',
  reviewed: '已确认',
};

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

export function renderApp() {
  const state = store.getState();
  const project = store.getProject();
  renderHeader(state, project);
  renderDiffToolbar(state);
  renderProjectCard(project);
  renderSegmentNav(state, project);
  renderPromptHistory(project);
  renderSegments(state, project);
  renderRightPanel(state, project);
  renderStatus(state);
}

function renderHeader(state, project) {
  const projectSelect = document.querySelector('#project-select');
  projectSelect.innerHTML = state.projects.map((item) => (
    `<option value="${escapeHtml(item.id)}" ${item.id === project.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`
  )).join('');
  document.querySelector('#direction-badge').textContent = project.direction;
  document.querySelector('#role-select').value = state.role;
  document.querySelector('#project-stats').innerHTML = projectStats(project);
}
function renderDiffToolbar(state) {
  const button = document.querySelector('#compare-button');
  button.textContent = state.diffMode ? '关闭全文 Diff' : '查看全文 Diff';
  button.classList.toggle('is-active', state.diffMode);
  button.setAttribute('aria-pressed', String(state.diffMode));
}

function projectStats(project) {
  const edited = project.segments.filter((item) => ['edited', 'reviewed'].includes(item.status)).length;
  const versions = project.segments.reduce((sum, item) => sum + item.translations.length, 0);
  return [
    `<div class="top-stat"><strong>${project.segments.length}</strong><span>句段</span></div>`,
    `<div class="top-stat"><strong>${edited}</strong><span>已译后编辑</span></div>`,
    `<div class="top-stat"><strong>${versions}</strong><span>译文版本</span></div>`,
  ].join('');
}

function renderProjectCard(project) {
  document.querySelector('#project-title').textContent = project.name;
  document.querySelector('#project-meta').textContent = `${project.sourceLang} → ${project.targetLang} · 教学演示项目`;
  const prompt = project.prompts.find((item) => item.id === project.activePromptId);
  document.querySelector('#active-prompt-label').textContent = `Prompt v${prompt.version} · ${prompt.title}`;
}

function renderSegmentNav(state, project) {
  const activeFilter = document.querySelector('.filter-chip.is-active')?.dataset.filter || 'all';
  const segments = activeFilter === 'all'
    ? project.segments
    : project.segments.filter((item) => item.status === activeFilter);
  document.querySelector('#segment-nav').innerHTML = segments.map((segment) => segmentNavItem(state, segment, project)).join('');
}

function segmentNavItem(state, segment, project) {
  const index = project.segments.indexOf(segment) + 1;
  return `<button class="segment-nav-item ${state.currentSegmentId === segment.id ? 'is-active' : ''}" data-action="select-segment" data-segment-id="${segment.id}">
    <span class="segment-nav-number">${String(index).padStart(2, '0')}</span>
    <span class="segment-nav-preview">${escapeHtml(segment.source)}</span>
    <span class="status-dot ${segment.status}"></span>
  </button>`;
}

function renderPromptHistory(project) {
  const items = [...project.prompts].sort((a, b) => b.version - a.version);
  document.querySelector('#prompt-history').innerHTML = items.map((prompt) => (
    `<button class="prompt-history-item ${prompt.id === project.activePromptId ? 'is-active' : ''}" data-action="activate-prompt" data-prompt-id="${prompt.id}">
      <span class="prompt-history-top"><span class="prompt-version">v${prompt.version}</span><span class="prompt-author">${escapeHtml(prompt.author)} · ${escapeHtml(prompt.role)}</span></span>
      <span class="prompt-history-title">${escapeHtml(prompt.title)}</span>
      <span class="prompt-history-note">${escapeHtml(prompt.note)}</span>
    </button>`
  )).join('');
}

function renderSegments(state, project) {
  const grid = document.querySelector('#segment-grid');
  grid.innerHTML = project.segments.map((segment, index) => segmentRow(state, segment, index)).join('');
  requestAnimationFrame(() => scrollActiveSegment(state.currentSegmentId));
}

function segmentRow(state, segment, index) {
  const current = segment.translations.find((item) => item.id === segment.currentTranslationId);
  const target = current?.postEditText || current?.aiText || '';
  const prompt = current ? store.getPrompt(current.promptId) : null;
  return `<article class="segment-row ${state.currentSegmentId === segment.id ? 'is-active' : ''}" data-segment-row="${segment.id}">
    <div class="segment-cell source-cell" data-action="select-segment" data-segment-id="${segment.id}">
      <span class="segment-number">${String(index + 1).padStart(3, '0')}</span><div class="source-text">${escapeHtml(segment.source)}</div>
    </div>
    <div class="segment-cell target-cell">
      <textarea class="target-editor" data-segment-editor="${segment.id}" aria-label="第 ${index + 1} 句译文" placeholder="尚无译文，请模拟生成">${escapeHtml(target)}</textarea>
      ${state.diffMode ? inlineDiff(segment.id, target) : ''}
      <div class="target-actions">
        <button class="version-button" data-action="open-versions" data-segment-id="${segment.id}">${segment.translations.length} 个版本 · ${prompt ? `P${prompt.version}` : '未生成'}</button>
        <button class="save-segment-button" data-action="save-segment" data-segment-id="${segment.id}">保存译后编辑</button>
      </div>
    </div>
    <div class="segment-status-cell">
      <span class="status-icon ${segment.status}">${statusIcon(segment.status)}</span>
      <span class="status-label">${STATUS_TEXT[segment.status] || '待处理'}</span>
    </div>
  </article>`;
}

function inlineDiff(segmentId, target) {
  return `<div class="inline-diff"><div class="inline-diff-label">AI 原译 → 当前编辑</div>
    <div class="inline-diff-content" data-inline-diff="${segmentId}">${renderLiveDiff(segmentId, target)}</div></div>`;
}

export function renderLiveDiff(segmentId, editedText) {
  const project = store.getProject();
  const segment = store.getSegment(segmentId);
  const current = store.getCurrentTranslation(segment);
  if (!current) return '<span class="muted">尚无译文可比较</span>';
  const language = project.direction === 'EN → ZH' ? 'zh' : 'en';
  const parts = buildDiff(current.aiText, editedText, language);
  if (parts.every((part) => part.type === 'same')) return '<span class="diff-unchanged">与 AI 原译一致</span>';
  return renderDiffParts(parts);
}

export function renderDiffParts(parts) {
  return parts.map((part) => {
    const className = part.type === 'added' ? 'diff-added' : part.type === 'removed' ? 'diff-removed' : '';
    return `<span class="${className}">${escapeHtml(part.value)}</span>`;
  }).join('');
}

function statusIcon(status) {
  if (status === 'reviewed') return '✓';
  if (status === 'edited') return '✎';
  if (status === 'translated') return 'AI';
  return '–';
}

function scrollActiveSegment(segmentId) {
  const row = document.querySelector(`[data-segment-row="${segmentId}"]`);
  if (!row || row.dataset.scrolled) return;
  row.dataset.scrolled = 'true';
}

function renderRightPanel(state, project) {
  document.querySelectorAll('.right-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.tab === state.rightTab);
  });
  const renderers = { prompt: renderPromptPanel, terms: renderTermsPanel, tm: renderTmPanel, mentor: renderMentorPanel };
  document.querySelector('#right-content').innerHTML = renderers[state.rightTab](project, state);
}

function renderPromptPanel(project) {
  const segment = store.getSegment();
  const translation = store.getCurrentTranslation(segment);
  if (!translation) return renderProjectPrompt(project);
  const prompt = project.prompts.find((item) => item.id === translation.promptId);
  const translationIndex = segment.translations.indexOf(translation) + 1;
  const segmentIndex = project.segments.indexOf(segment) + 1;
  return `<div class="panel-kicker">SELECTED TRANSLATION</div><h2 class="panel-title">当前译文 T${translationIndex}</h2>
    ${translationMeta(project, segmentIndex, translationIndex, translation, prompt)}
    <div class="translation-detail-card"><div class="detail-label">当前显示译文</div><p>${escapeHtml(translation.postEditText || translation.aiText)}</p></div>
    <div class="detail-label">绑定的 Prompt 快照</div>
    <textarea id="prompt-editor" class="prompt-editor" aria-label="绑定的 Prompt 快照">${escapeHtml(translation.promptSnapshot || prompt?.content || '')}</textarea>
    <p class="muted detail-note">这是该译文生成时冻结的快照。当前项目用于新生成的版本是 Prompt v${activePromptVersion(project)}。</p>
    <button class="button button-primary button-full" data-action="new-prompt-from-editor">基于此快照创建新 Prompt</button>`;
}

function translationMeta(project, segmentIndex, translationIndex, translation, prompt) {
  const edited = translation.postEditText ? `已译后编辑 · ${escapeHtml(translation.editedAt || '已保存')}` : 'AI 原译 · 尚未人工修改';
  return `<div class="prompt-meta-card"><dl>
    <div class="meta-row"><dt>当前选择</dt><dd>句段 ${segmentIndex} · 译文 T${translationIndex}</dd></div>
    <div class="meta-row"><dt>绑定 Prompt</dt><dd>v${prompt?.version || '?'} · ${escapeHtml(prompt?.title || '历史快照')}</dd></div>
    <div class="meta-row"><dt>译文状态</dt><dd>${edited}</dd></div>
    <div class="meta-row"><dt>生成信息</dt><dd>${escapeHtml(translation.author)} · ${escapeHtml(translation.model)}</dd></div>
    <div class="meta-row"><dt>生成时间</dt><dd>${escapeHtml(translation.createdAt)}</dd></div>
    <div class="meta-row"><dt>上下文</dt><dd>${escapeHtml(translation.contextSnapshot)}</dd></div>
  </dl></div>`;
}

function activePromptVersion(project) {
  return project.prompts.find((item) => item.id === project.activePromptId)?.version || '?';
}

function renderProjectPrompt(project) {
  const prompt = project.prompts.find((item) => item.id === project.activePromptId);
  return `<div class="panel-kicker">PROMPT STUDIO</div><h2 class="panel-title">项目翻译指令</h2>
    <div class="prompt-meta-card"><dl><div class="meta-row"><dt>当前版本</dt><dd>v${prompt.version} · ${escapeHtml(prompt.title)}</dd></div>
      <div class="meta-row"><dt>共同作者</dt><dd>${escapeHtml(prompt.author)}（${escapeHtml(prompt.role)}）</dd></div>
      <div class="meta-row"><dt>版本说明</dt><dd>${escapeHtml(prompt.note)}</dd></div></dl></div>
    <textarea id="prompt-editor" class="prompt-editor" aria-label="当前 Prompt 内容">${escapeHtml(prompt.content)}</textarea>
    <button class="button button-primary button-full" data-action="new-prompt-from-editor">由此创建新版本</button>`;
}

function renderTermsPanel(project) {
  const cards = project.terms.map((term) => `<div class="resource-card">
    <div class="resource-row"><strong>${escapeHtml(term.source)}</strong><span>→</span><strong>${escapeHtml(term.target)}</strong></div>
    <p>${escapeHtml(term.note || '项目统一译法')}</p></div>`).join('');
  return `<div class="panel-heading"><div><div class="panel-kicker">TERMBASE</div><h2 class="panel-title">项目术语库</h2></div><button class="icon-button" data-action="add-term">＋</button></div>
    <p class="muted" style="font-size:10px">命中术语将在未来的完整 Prompt 中自动注入，并保留来源。</p>${cards || '<div class="empty-state">尚未添加术语</div>'}`;
}

function renderTmPanel(project) {
  const cards = project.tm.map((item) => `<div class="resource-card">
    <div class="resource-row"><strong>相似句</strong><span class="match-score">${item.match}%</span></div>
    <p>${escapeHtml(item.source)}</p><p style="color:var(--ink)">${escapeHtml(item.target)}</p></div>`).join('');
  return `<div class="panel-kicker">TRANSLATION MEMORY</div><h2 class="panel-title">翻译记忆</h2>
    <p class="muted" style="font-size:10px">当前为浏览器端预存匹配结果，未来可替换为 TMX 检索服务。</p>${cards || '<div class="empty-state">尚无翻译记忆</div>'}`;
}

function renderMentorPanel() {
  return `<div class="panel-kicker">POST-EDIT LEARNING</div><h2 class="panel-title">AI Prompt 教练</h2>
    <div class="mentor-card"><span class="mentor-demo-label">ROADSHOW PLACEHOLDER</span>
      <h3>从译后编辑反推 Prompt 补丁</h3>
      <p class="muted" style="line-height:1.65">演示设想：系统汇总多句稳定修改后，指出“学生反复拆分长句、弱化宣传式措辞”，并建议给 Prompt 增加相应规则。</p>
      <div class="prompt-snapshot">建议补丁示例：允许拆分英文长句；涉及展览价值判断时保持克制，不主动使用“非凡、震撼、独一无二”等宣传性表达。</div>
      <button class="button button-soft button-full" data-action="mentor-demo" style="margin-top:12px">预览未来工作流</button>
    </div><p class="muted" style="font-size:10px">当前入口只展示模拟建议，不会分析真实编辑，也不会自动改写 Prompt。</p>`;
}

function renderStatus(state) {
  document.querySelector('#current-user-status').textContent = state.role === 'teacher' ? '当前：林老师（教师）' : '当前：当前学生（学生）';
}
