/**
 * 职责: 将当前项目状态渲染为 CAT 工作台、可复用资源面板与版本导航
 * 依赖内部: ../state/store.js, ../services/diff-engine.js, ../services/ai-post-edit.js, ../services/prompt-coach.js, ../services/translation-drafts.js, ./ai-post-edit-view.js
 * 依赖外部: DOM API
 * 暴露: renderApp | escapeHtml | renderLiveDiff | renderAiHumanDiff | renderDiffParts | resizeTargetEditor
 */

import { store } from '../state/store.js';
import { getTranslationDraft } from '../services/translation-drafts.js';
import { buildDiff } from '../services/diff-engine.js';
import { resolveAiPostEdit } from '../services/ai-post-edit.js';
import { analyzePromptCoach } from '../services/prompt-coach.js';
import { hasVisibleAiPostEdit, renderAiPostEditField } from './ai-post-edit-view.js';

const STATUS_TEXT = {
  empty: '待生成',
  translated: '待确认',
  'ai-edited': 'AI已编辑',
  edited: '已编辑',
  reviewed: '已确认',
  submitted: '已提交教师',
};

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function promptLabel(prompt) {
  return prompt?.displayLabel || `v${prompt?.version || '?'}`;
}

function isManualTranslation(translation) {
  return Boolean(translation && (translation.origin === 'manual'
    || translation.serverVersionKind === 'manual_reference'));
}

function hasPairedAiVersion(translation) {
  return Boolean(translation?.aiPostEdit && translation.serverVersionKind !== 'ai_post_edit');
}

function translationSourceLabel(translation, prompt) {
  return isManualTranslation(translation) ? '参考译文 · 人工翻译' : `Prompt ${promptLabel(prompt)}`;
}

export function renderApp() {
  const state = store.getState();
  const project = store.getProject();
  renderHeader(state, project);
  renderViewToggles(state);
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
  renderProjectTags(project);
  document.querySelector('#role-select').value = state.role;
}

function renderProjectTags(project) {
  const origin = document.querySelector('#project-origin-tag');
  const classes = document.querySelector('#project-class-tags');
  origin.textContent = project.projectKind === 'system_template' ? '模板' : '本地';
  origin.title = project.creationSource || 'local';
  const tags = project.classTags || [];
  classes.innerHTML = tags.length
    ? `<span class="badge badge-project-class" title="${escapeHtml(tags.join('、'))}">班级 ${tags.length}</span>` : '';
}

function renderViewToggles(state) {
  updateMenuToggle('#compare-button', state.diffMode, '关闭全文 Diff', '查看全文 Diff');
  updateMenuToggle('#all-versions-button', state.allVersionsMode, '隐藏全部翻译版本', '查看全部翻译版本');
  updateMenuToggle('#ai-post-edit-toggle', state.aiPostEditVisible, '隐藏 AI 译后编辑', '显示 AI 译后编辑');
}

function updateMenuToggle(selector, enabled, enabledText, disabledText) {
  const button = document.querySelector(selector);
  button.querySelector('span:first-child').textContent = enabled ? enabledText : disabledText;
  button.querySelector('.menu-check').classList.toggle('is-visible', enabled);
  button.classList.toggle('is-active', enabled);
  button.setAttribute('aria-pressed', String(enabled));
}

function renderProjectCard(project) {
  document.querySelector('#project-title').textContent = project.name;
  document.querySelector('#project-meta').textContent = `${project.sourceLang} → ${project.targetLang} · 教学演示项目`;
  const prompt = project.prompts.find((item) => item.id === project.activePromptId);
  document.querySelector('#active-prompt-label').textContent = `Prompt ${promptLabel(prompt)} · ${prompt.title}`;
}

function renderSegmentNav(state, project) {
  const activeFilter = document.querySelector('.filter-chip.is-active')?.dataset.filter || 'all';
  const segments = project.segments.filter((segment) => matchesSegmentFilter(segment, activeFilter));
  document.querySelector('#segment-nav').innerHTML = segments.map((segment) => segmentNavItem(state, segment, project)).join('');
}

function matchesSegmentFilter(segment, activeFilter) {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'edited') return ['edited', 'ai-edited'].includes(segment.status);
  return segment.status === activeFilter;
}
function segmentNavItem(state, segment, project) {
  const index = project.segments.indexOf(segment) + 1;
  return `<button class="segment-nav-item ${state.currentSegmentId === segment.id ? 'is-active' : ''}" data-action="select-segment" data-segment-id="${segment.id}">
    <span class="segment-nav-number">${String(index).padStart(2, '0')}</span>
    <span class="segment-nav-preview">${escapeHtml(segment.source)}</span>
    <span class="status-dot ${segment.status}"></span>
  </button>`;
}

function promptCollaborationLabel(prompt) {
  if (prompt.isPublished) return '项目发布版';
  if (prompt.submissionStatus === 'submitted') return '已提交教师';
  if (prompt.submissionStatus === 'accepted') return '已采纳';
  if (prompt.isOwnedByCurrentUser) return '仅自己可见';
  return '';
}

function renderPromptHistory(project) {
  const switcher = document.querySelector('#prompt-kind-switch');
  const kind = switcher?.dataset.kind || 'translation';
  document.querySelectorAll('.rail-prompts-section [data-action="open-prompt-lineage"]')
    .forEach((button) => { button.dataset.promptKind = kind; });
  switcher.dataset.kind = kind;
  switcher.className = `prompt-face-switch is-${kind}`;
  switcher.innerHTML = `<button class="${kind === 'translation' ? 'is-active' : ''}" data-action="switch-left-prompt-kind" data-prompt-kind="translation">翻译</button>
    <button class="${kind === 'post_edit' ? 'is-active' : ''}" data-action="switch-left-prompt-kind" data-prompt-kind="post_edit">译后编辑</button>`;
  const activeId = kind === 'post_edit' ? project.activePostEditPromptId : project.activePromptId;
  const prompts = project.prompts.filter((prompt) => !prompt.isArchived
    && (prompt.promptKind || 'translation') === kind)
    .sort((left, right) => Number(right.id === activeId)
      - Number(left.id === activeId) || right.version - left.version);
  document.querySelector('#prompt-history').innerHTML = prompts.map((prompt) => {
    const status = promptCollaborationLabel(prompt);
    return `<button class="prompt-history-item ${prompt.id === activeId ? 'is-active' : ''}" data-action="activate-prompt" data-prompt-id="${prompt.id}">
      <span class="prompt-history-top"><span class="prompt-version">${escapeHtml(promptLabel(prompt))}</span><span class="prompt-author">${escapeHtml(prompt.author)} · ${escapeHtml(prompt.role)}</span></span>
      <span class="prompt-history-title">${escapeHtml(prompt.title)}</span>
      ${status ? `<span class="prompt-history-status">${escapeHtml(status)}</span>` : ''}
      <span class="prompt-history-note">${escapeHtml(prompt.note)}</span>
    </button>`;
  }).join('');
}

function renderSegments(state, project) {
  const grid = document.querySelector('#segment-grid');
  grid.innerHTML = project.segments.map((segment, index) => segmentRow(state, project, segment, index)).join('');
  requestAnimationFrame(() => {
    resizeTargetEditors();
    scrollActiveSegment(state.currentSegmentId);
  });
}

function resizeTargetEditors() {
  document.querySelectorAll('.target-editor').forEach((editor) => resizeTargetEditor(editor));
}

export function resizeTargetEditor(editor) {
  editor.style.height = 'auto';
  const contentHeight = editor.scrollHeight;
  const maxHeight = editor.value.trim().length <= 200 ? contentHeight : 520;
  editor.style.height = `${Math.min(contentHeight, maxHeight)}px`;
  editor.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
}

function segmentRow(state, project, segment, index) {
  const current = segment.translations.find((item) => item.id === segment.currentTranslationId);
  const prompt = current ? store.getPrompt(current.promptId) : null;
  const aiVisible = hasVisibleAiPostEdit(state, current);
  const target = state.allVersionsMode
    ? allVersionTargets(state, project, segment, index)
    : currentTarget(state, project, segment, index, current, prompt);
  return `<article class="segment-row ${state.currentSegmentId === segment.id ? 'is-active' : ''}" data-segment-row="${segment.id}">
    <div class="segment-cell source-cell" data-action="select-segment" data-segment-id="${segment.id}">
      <span class="segment-number">${String(index + 1).padStart(3, '0')}</span><div class="source-text">${escapeHtml(segment.source)}</div>
    </div>
    <div class="segment-cell target-cell ${state.allVersionsMode ? 'is-all-versions' : ''} ${aiVisible ? 'is-ai-post-editing' : ''}">${target}</div>
    <div class="segment-status-cell"><span class="status-icon ${segment.status}">${statusIcon(segment.status)}</span>
      <span class="status-label">${STATUS_TEXT[segment.status] || '待处理'}</span></div>
  </article>`;
}

function currentTarget(state, project, segment, index, current, prompt) {
  const target = current?.postEditText || current?.aiText || '';
  const cached = current ? getTranslationDraft(project.id, segment.id, current.id) : null;
  const aiVisible = hasVisibleAiPostEdit(state, current);
  const draft = aiVisible ? store.getAiPostEditDraft(segment.id) : null;
  const aiEditing = Boolean(draft?.active);
  const displayText = draft?.text ?? cached ?? target;
  const editor = aiVisible && !aiEditing
    ? renderAiPostEditField(project, segment, index, current)
    : renderTargetTextarea(segment, index, displayText, aiEditing);
  const draftText = aiEditing ? draft.text : undefined;
  const diff = state.diffMode
    ? currentTargetDiff(current, displayText, project.direction, segment.id, aiVisible, draftText) : '';
  return `${editor}${diff}${currentTargetActions(segment, current, prompt, aiVisible, aiEditing)}`;
}

function currentTargetDiff(translation, target, direction, segmentId, aiVisible, draftText) {
  if (aiVisible) return aiPostEditHumanDiffBlock(translation, direction, draftText, segmentId);
  return translationDiff(translation, target, direction, segmentId);
}
function renderTargetTextarea(segment, index, target, isAiDraft = false) {
  const draftAttribute = isAiDraft ? ' data-ai-post-edit-draft="true"' : '';
  return `<textarea class="target-editor" data-segment-editor="${segment.id}"${draftAttribute} aria-label="第 ${index + 1} 句译文"
    placeholder="尚无译文，请输入或生成译文">${escapeHtml(target)}</textarea>`;
}

function currentTargetActions(segment, translation, prompt, aiVisible, aiEditing) {
  const index = segment.translations.indexOf(translation) + 1;
  const label = translation?.aiPostEdit ? `T${index}-AI`
    : (isManualTranslation(translation) ? '人工参考' : promptLabel(prompt));
  const actions = aiVisible && !aiEditing ? renderAiPostEditActions(segment, translation) : `<span class="target-action-buttons">
    <button class="save-segment-button" data-action="save-segment" data-segment-id="${segment.id}">保存译后编辑</button>
    <button class="more-button" data-action="open-right-tab" data-tab="prompt" data-segment-id="${segment.id}" data-translation-id="${translation?.id || ''}">更多</button></span>`;
  return `<div class="target-actions"><button class="version-button" data-action="open-versions" data-segment-id="${segment.id}">${displayedVersionCount(segment)} 个版本 · ${label}</button>${actions}</div>`;
}
function displayedVersionCount(segment) {
  return segment.translations.length + segment.translations.filter(hasPairedAiVersion).length;
}
function renderAiPostEditActions(segment, translation) {
  return `<span class="ai-post-edit-actions">
    <button class="save-segment-button" data-action="edit-ai-post-edit" data-segment-id="${segment.id}" title="Ctrl+Enter">继续编辑</button>
    <button class="more-button" data-action="open-right-tab" data-tab="prompt" data-segment-id="${segment.id}" data-translation-id="${translation?.id || ''}">更多</button>
  </span>`;
}

function allVersionTargets(state, project, segment, index) {
  if (!segment.translations.length) return '<div class="empty-state">尚无译文版本</div>';
  const versions = [...segment.translations].sort((left, right) => {
    const currentOrder = Number(right.id === segment.currentTranslationId) - Number(left.id === segment.currentTranslationId);
    return currentOrder || segment.translations.indexOf(right) - segment.translations.indexOf(left);
  });
  const cards = versions.map((translation) => {
    const aiVersion = translation.aiPostEdit
      ? aiPostEditVersionTarget(project, segment, index, translation) : '';
    if (translation.serverVersionKind === 'ai_post_edit') return aiVersion;
    const regular = versionTarget(state, project, segment, index, translation);
    if (!aiVersion) return regular;
    return translation.id === segment.currentTranslationId
      ? `${aiVersion}${regular}` : `${regular}${aiVersion}`;
  }).join('');
  return `<div class="all-versions-group" aria-label="第 ${index + 1} 句全部译文版本">${cards}</div>`;
}
function versionTarget(state, project, segment, index, translation) {
  const isSelectedBase = translation.id === segment.currentTranslationId;
  const hasAiVersion = hasPairedAiVersion(translation);
  const isCurrent = isSelectedBase && !hasAiVersion;
  const translationIndex = segment.translations.indexOf(translation) + 1;
  const prompt = store.getPrompt(translation.promptId);
  const target = hasAiVersion ? translation.aiText : (translation.postEditText || translation.aiText || '');
  const editor = versionEditor(segment, index, target, isCurrent);
  const diff = state.diffMode && !hasAiVersion
    ? translationDiff(translation, target, project.direction, isCurrent ? segment.id : '') : '';
  return `<section class="embedded-version ${isCurrent ? 'is-current' : ''}">
    <div class="embedded-version-header"><strong>译文 T${translationIndex} · ${escapeHtml(translationSourceLabel(translation, prompt))}</strong><span>${translationSubmissionLabel(translation, isCurrent)}</span></div>
    ${editor}${diff}${versionActions(segment, translation, isCurrent, hasAiVersion)}
  </section>`;
}

function translationSubmissionLabel(translation, isCurrent) {
  if (translation.submittedBy) return `已提交 · ${escapeHtml(translation.submittedBy)}`;
  return isCurrent ? '当前版本' : escapeHtml(translation.createdAt);
}

function versionEditor(segment, index, target, isCurrent) {
  if (!isCurrent) {
    return `<div class="embedded-version-text" aria-label="第 ${index + 1} 句译文">${escapeHtml(target)}</div>`;
  }
  return renderTargetTextarea(segment, index, target);
}

function versionActions(segment, translation, isCurrent, hasAiVersion) {
  if (hasAiVersion) return originalVersionActions(segment, translation);
  if (isCurrent) return `<div class="target-actions"><span class="version-current-label">当前显示</span>
    <span class="target-action-buttons"><button class="save-segment-button" data-action="save-segment" data-segment-id="${segment.id}">保存译后编辑</button>
      <button class="more-button" data-action="open-right-tab" data-tab="prompt" data-segment-id="${segment.id}" data-translation-id="${translation.id}">更多</button></span></div>`;
  return `<div class="target-actions"><span class="version-history-label">历史版本</span>
    <span class="target-action-buttons"><button class="text-button set-current-button" data-action="set-current-version" data-segment-id="${segment.id}" data-translation-id="${translation.id}">设为当前显示</button>
      <button class="more-button" data-action="open-right-tab" data-tab="prompt" data-segment-id="${segment.id}" data-translation-id="${translation.id}">更多</button></span></div>`;
}

function originalVersionActions(segment, translation) {
  return `<div class="target-actions"><span class="version-history-label">原始版本</span>
    <span class="target-action-buttons"><button class="text-button set-current-button" data-action="discard-ai-post-edit" data-segment-id="${segment.id}" data-translation-id="${translation.id}">设为当前显示</button>
      <button class="more-button" data-action="open-right-tab" data-tab="prompt" data-segment-id="${segment.id}" data-translation-id="${translation.id}">更多</button></span></div>`;
}

function aiPostEditVersionTarget(project, segment, index, translation) {
  const isCurrent = translation.id === segment.currentTranslationId;
  const translationIndex = segment.translations.indexOf(translation) + 1;
  const draft = isCurrent ? store.getAiPostEditDraft(segment.id) : null;
  const aiEditing = Boolean(draft?.active);
  const editor = aiVersionEditor(project, segment, index, translation, isCurrent, draft);
  const humanOverride = aiEditing ? draft.text : undefined;
  const actions = aiVersionActions(segment, translation, isCurrent, aiEditing);
  return `<section class="embedded-version is-ai-post-edit-version ${isCurrent ? 'is-current' : ''}">
    <div class="embedded-version-header"><strong>AI 译后编辑版本 · T${translationIndex}-AI</strong><span>${isCurrent ? '当前版本' : translation.aiPostEdit.createdAt}</span></div>
    ${editor}${aiPostEditDiffChain(translation, project.direction, humanOverride, isCurrent ? segment.id : '')}
    ${actions}
  </section>`;
}

function aiVersionEditor(project, segment, index, translation, isCurrent, draft) {
  if (draft?.active) return renderTargetTextarea(segment, index, draft.text, true);
  if (isCurrent) return renderAiPostEditField(project, segment, index, translation);
  const aiEdited = resolvedAiPostEditText(translation, project.direction);
  const displayText = translation.postEditText || aiEdited;
  return `<div class="embedded-version-text" aria-label="第 ${index + 1} 句 AI 译后编辑版本">${escapeHtml(displayText)}</div>`;
}

function aiVersionActions(segment, translation, isCurrent, aiEditing) {
  if (isCurrent) {
    const buttons = aiEditing ? aiPostEditDraftActions(segment, translation) : renderAiPostEditActions(segment, translation);
    return `<div class="target-actions"><span class="version-current-label">当前显示</span>${buttons}</div>`;
  }
  return `<div class="target-actions"><span class="version-history-label">历史版本</span>
    <span class="target-action-buttons"><button class="text-button set-current-button" data-action="set-current-version" data-segment-id="${segment.id}" data-translation-id="${translation.id}">设为当前显示</button>
      <button class="more-button" data-action="open-right-tab" data-tab="prompt" data-segment-id="${segment.id}" data-translation-id="${translation.id}">更多</button></span></div>`;
}
function aiPostEditDraftActions(segment, translation) {
  return `<span class="target-action-buttons"><button class="save-segment-button" data-action="save-segment" data-segment-id="${segment.id}">保存译后编辑</button>
    <button class="more-button" data-action="open-right-tab" data-tab="prompt" data-segment-id="${segment.id}" data-translation-id="${translation.id}">更多</button></span>`;
}

function aiPostEditDiffChain(translation, direction, humanOverride, liveSegmentId = '') {
  const aiEdited = resolvedAiPostEditText(translation, direction);
  const aiDiff = renderDiffBlock(
    'AI → AI编辑 Diff', translation.aiPostEdit.baseText, aiEdited, direction,
    'AI 编辑结果与原译一致', '', 'ai-edit', translation.aiPostEdit.diffArtifact?.parts,
  );
  const humanDiff = aiPostEditHumanDiffBlock(translation, direction, humanOverride, liveSegmentId);
  return `<div class="ai-post-edit-diff-chain">${aiDiff}${humanDiff}</div>`;
}

function aiPostEditHumanDiffBlock(translation, direction, humanOverride, liveSegmentId = '') {
  const aiEdited = resolvedAiPostEditText(translation, direction);
  const humanText = humanOverride !== undefined ? humanOverride : (translation.postEditText || aiEdited);
  return renderDiffBlock(
    'AI编辑Diff → 人工 Diff', aiEdited, humanText, direction, '尚无额外人工修改', liveSegmentId,
  );
}
function resolvedAiPostEditText(translation, direction) {
  const edit = translation.aiPostEdit;
  if (edit.status === 'applied' && typeof edit.resultText === 'string') return edit.resultText;
  return resolveAiPostEdit(edit, direction, true);
}

function renderDiffBlock(label, before, after, direction, unchanged, liveSegmentId = '', theme = '', storedParts) {
  const attribute = liveSegmentId ? ` data-ai-human-diff="${escapeHtml(liveSegmentId)}"` : '';
  const themeClass = theme === 'ai-edit' ? ' is-ai-edit-diff' : '';
  const content = storedParts ? renderStoredDiff(storedParts, unchanged)
    : renderDiffContent(before, after, direction, unchanged);
  return `<div class="inline-diff${themeClass}"><div class="inline-diff-label">${label}</div><div class="inline-diff-content"${attribute}>${content}</div></div>`;
}
function renderDiffContent(before, after, direction, unchanged) {
  const language = direction === 'EN → ZH' ? 'zh' : 'en';
  const parts = buildDiff(before || '', after || '', language);
  if (parts.every((part) => part.type === 'same')) return `<span class="diff-unchanged">${unchanged}</span>`;
  return renderDiffParts(parts);
}

function renderStoredDiff(parts, unchanged) {
  if (parts.every((part) => part.type === 'same')) return `<span class="diff-unchanged">${unchanged}</span>`;
  return renderDiffParts(parts);
}

export function renderAiHumanDiff(segmentId, editedText) {
  const project = store.getProject();
  const translation = store.getCurrentTranslation(store.getSegment(segmentId));
  if (!translation?.aiPostEdit) return '<span class="muted">尚无 AI 译后编辑可比较</span>';
  const aiEdited = resolvedAiPostEditText(translation, project.direction);
  return renderDiffContent(aiEdited, editedText, project.direction, '尚无额外人工修改');
}
function translationDiff(translation, target, direction, liveSegmentId = '') {
  const attribute = liveSegmentId ? ` data-inline-diff="${liveSegmentId}"` : '';
  if (isManualTranslation(translation)) return `<div class="inline-diff"><div class="inline-diff-label">译文来源</div>
    <div class="inline-diff-content"${attribute}>人工参考译文，不适用 AI → 人工 Diff。</div></div>`;
  const baseline = humanDiffBaseline(translation);
  return `<div class="inline-diff"><div class="inline-diff-label">${baseline.label}</div>
    <div class="inline-diff-content"${attribute}>${renderTranslationDiff(translation, target, direction)}</div></div>`;
}

function humanDiffBaseline(translation) {
  if (translation?.serverBaselineKind === 'ai_post_edit') {
    return { text: translation.aiText || '', label: 'AI 译后编辑 → 当前人工编辑',
      unchanged: '与 AI 译后编辑一致' };
  }
  const edit = translation?.aiPostEdit;
  if (edit?.status === 'applied') {
    return { text: edit.resultText, label: 'AI 译后编辑 → 当前人工编辑', unchanged: '与 AI 译后编辑一致' };
  }
  return { text: translation?.aiText || '', label: 'AI 原译 → 当前人工编辑', unchanged: '与 AI 原译一致' };
}

function renderTranslationDiff(translation, editedText, direction) {
  if (!translation) return '<span class="muted">尚无译文可比较</span>';
  const savedText = translation.postEditText || translation.aiText || '';
  if (translation.diffArtifact?.parts && editedText === savedText) {
    return renderStoredDiff(translation.diffArtifact.parts, humanDiffBaseline(translation).unchanged);
  }
  const language = direction === 'EN → ZH' ? 'zh' : 'en';
  const baseline = humanDiffBaseline(translation);
  const parts = buildDiff(baseline.text, editedText, language);
  if (parts.every((part) => part.type === 'same')) return `<span class="diff-unchanged">${baseline.unchanged}</span>`;
  return renderDiffParts(parts);
}

export function renderLiveDiff(segmentId, editedText) {
  const project = store.getProject();
  const current = store.getCurrentTranslation(store.getSegment(segmentId));
  return renderTranslationDiff(current, editedText, project.direction);
}

export function renderDiffParts(parts) {
  return parts.map((part) => {
    const className = part.type === 'added' ? 'diff-added' : part.type === 'removed' ? 'diff-removed' : '';
    return `<span class="${className}">${escapeHtml(part.value)}</span>`;
  }).join('');
}
function statusIcon(status) {
  if (status === 'submitted') return '⇧';
  if (status === 'reviewed') return '✓';
  if (status === 'edited') return '✎';
  if (status === 'ai-edited') return '✦';
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

function renderPromptPanel(project, state) {
  const segment = store.getSegment();
  const translation = store.getDetailTranslation(segment);
  if (!translation) return renderProjectPrompt(project);
  const prompt = project.prompts.find((item) => item.id === translation.promptId);
  const translationIndex = segment.translations.indexOf(translation) + 1;
  const segmentIndex = project.segments.indexOf(segment) + 1;
  return `<div class="panel-kicker">SELECTED TRANSLATION</div><h2 class="panel-title">译文详情 T${translationIndex}</h2>
    ${translationMeta(project, segmentIndex, translationIndex, translation, prompt)}
    <div class="translation-detail-card"><div class="detail-label">所选译文</div><p>${escapeHtml(translation.postEditText || translation.aiText)}</p></div>
    ${renderTranslationOrigin(project, segment, translation, prompt, state)}`;
}

function renderTranslationOrigin(project, segment, translation, prompt, state) {
  if (isManualTranslation(translation)) return `<div class="manual-translation-note"><strong>人工参考译文</strong>
    <p>此版本由用户手动翻译，不绑定任何 Prompt。</p></div>`;
  return `<div class="detail-label">绑定的 Prompt 快照</div>
    <textarea id="prompt-editor" class="prompt-editor" aria-label="绑定的 Prompt 快照">${escapeHtml(translation.promptSnapshot || prompt?.content || '')}</textarea>
    <p class="muted detail-note">这是该译文生成时冻结的快照。当前项目用于新生成的版本是 Prompt ${activePromptVersion(project)}。</p>
    <div class="prompt-action-stack"><button class="button button-secondary button-full" data-action="retranslate-with-prompt" data-segment-id="${segment.id}">用此 Prompt 重译</button>
      ${segment.currentTranslationId === translation.id ? `<button class="button button-secondary button-full" data-action="ai-post-edit-current" data-segment-id="${segment.id}" data-prompt-id="${prompt?.id || ''}">用此 Prompt AI 译后编辑</button>` : ''}
      <button class="button button-primary button-full" data-action="new-prompt-from-editor">基于此快照创建新 Prompt</button>
      ${translationSubmitAction(state, segment, translation)}</div>`;
}

function translationSubmitAction(state, segment, translation) {
  if (!state.serverMode || state.role !== 'student' || segment.currentTranslationId !== translation.id) return '';
  if (translation.submittedAt) return '<span class="submission-state-label">✓ 当前译文已提交教师</span>';
  return `<button class="button button-secondary button-full" data-action="submit-current-translation"
    data-segment-id="${segment.id}">提交当前译文给教师</button>`;
}

function translationMeta(project, segmentIndex, translationIndex, translation, prompt) {
  return `<div class="prompt-meta-card"><dl>
    <div class="meta-row"><dt>当前选择</dt><dd>句段 ${segmentIndex} · 译文 T${translationIndex}</dd></div>
    <div class="meta-row"><dt>绑定 Prompt</dt><dd>${isManualTranslation(translation) ? '无 Prompt · 用户手动翻译' : `${escapeHtml(promptLabel(prompt))} · ${escapeHtml(prompt?.title || '历史快照')}`}</dd></div>
    <div class="meta-row"><dt>译文状态</dt><dd>${translationStatus(translation)}</dd></div>
    <div class="meta-row"><dt>生成信息</dt><dd>${escapeHtml(translation.author)} · ${escapeHtml(translation.model)}</dd></div>
    <div class="meta-row"><dt>生成时间</dt><dd>${escapeHtml(translation.createdAt)}</dd></div>
  </dl></div>`;
}

function translationStatus(translation) {
  const edit = translation.aiPostEdit;
  if (edit?.status === 'pending') return `AI 已编辑 · 待逐项确认 · ${escapeHtml(edit.createdAt)}`;
  if (edit?.status === 'applied' && !edit.humanContinuedAt) return `AI 已编辑 · ${escapeHtml(edit.appliedAt)}`;
  if (translation.postEditText) return `已人工编辑 · ${escapeHtml(translation.editedAt || '已保存')}`;
  return isManualTranslation(translation) ? '人工译文 · 未改动' : 'AI 原译 · 尚未人工修改';
}

function activePromptVersion(project) {
  return promptLabel(project.prompts.find((item) => item.id === project.activePromptId));
}

function renderProjectPrompt(project) {
  const prompt = project.prompts.find((item) => item.id === project.activePromptId);
  return `<div class="panel-kicker">PROMPT STUDIO</div><h2 class="panel-title">项目翻译指令</h2>
    <div class="prompt-meta-card"><dl><div class="meta-row"><dt>当前版本</dt><dd>${escapeHtml(promptLabel(prompt))} · ${escapeHtml(prompt.title)}</dd></div>
      <div class="meta-row"><dt>共同作者</dt><dd>${escapeHtml(prompt.author)}（${escapeHtml(prompt.role)}）</dd></div>
      <div class="meta-row"><dt>版本说明</dt><dd>${escapeHtml(prompt.note)}</dd></div></dl></div>
    <textarea id="prompt-editor" class="prompt-editor" aria-label="当前 Prompt 内容">${escapeHtml(prompt.content)}</textarea>
    <div class="prompt-action-stack">
      <button class="button button-secondary button-full" data-action="retranslate-with-prompt" data-segment-id="${store.getSegment()?.id || ''}">用此 Prompt 重译</button>
      <button class="button button-secondary button-full" data-action="ai-post-edit-current" data-segment-id="${store.getSegment()?.id || ''}" data-prompt-id="${prompt.id}">用此 Prompt AI 译后编辑</button>
      <button class="button button-primary button-full" data-action="new-prompt-from-editor">由此创建新版本</button>
    </div>`;
}

export function renderTermsPanel(project) {
  const cards = project.terms.map((term) => `<div class="resource-card">
    <div class="resource-row"><strong>${escapeHtml(term.source)}</strong><span>→</span><strong>${escapeHtml(term.target)}</strong></div>
    <p>${escapeHtml(term.note || '项目统一译法')}</p></div>`).join('');
  const importButton = project.canManage ? '<button class="button button-soft" data-action="open-pair-import" data-import-kind="terms">导入术语库</button>' : '';
  return `<div class="panel-heading"><div><div class="panel-kicker">TERMBASE</div><h2 class="panel-title">项目术语库</h2></div><div class="resource-heading-actions">${importButton}<button class="icon-button" data-action="add-term">＋</button></div></div>
    <p class="muted" style="font-size:10px">服务器版生成时会把已批准术语注入模型上下文，并保留来源。</p>${cards || '<div class="empty-state">尚未添加术语</div>'}`;
}

export function renderTmPanel(project) {
  const cards = project.tm.map((item) => `<div class="resource-card">
    <div class="resource-row"><strong>相似句</strong><span class="match-score">${item.match}%</span></div>
    <p>${escapeHtml(item.source)}</p><p style="color:var(--ink)">${escapeHtml(item.target)}</p></div>`).join('');
  const importButton = project.canManage ? '<button class="button button-soft" data-action="open-pair-import" data-import-kind="tm">导入翻译记忆</button>' : '';
  const importPlus = project.canManage ? '<button class="icon-button" data-action="open-pair-import" data-import-kind="tm" title="上传翻译记忆">＋</button>' : '';
  return `<div class="panel-heading"><div><div class="panel-kicker">TRANSLATION MEMORY</div><h2 class="panel-title">翻译记忆</h2></div><div class="resource-heading-actions">${importButton}${importPlus}</div></div>
    <p class="muted" style="font-size:10px">当前为浏览器端预存匹配结果，未来可替换为 TMX 检索服务。</p>${cards || '<div class="empty-state">尚无翻译记忆</div>'}`;
}

export function renderMentorPanel(project) {
  const analysis = analyzePromptCoach(project);
  const cards = analysis.rules.map(renderCoachRule).join('');
  const summary = `已从 ${analysis.totalCount} 条 T2 中读取 ${analysis.editedCount} 组 AI 原译 → 人工编辑 Diff。`;
  return `<div class="panel-kicker">POST-EDIT LEARNING</div><h2 class="panel-title">AI Prompt 教练</h2>
    <div class="coach-mode"><span>本地分析 · 未调用 API</span><strong>Diff 成对学习</strong></div>
    <p class="coach-scope">${summary}<br>仅分析句界、谓语、施事、逻辑层级、回指和引语边界；术语差异不计入规则。</p>
    <div class="coach-rule-list">${cards || '<div class="empty-state">暂未发现可稳定归纳的句子结构规则。</div>'}</div>
    <div class="coach-actions">
      ${cards ? '<button class="button button-primary button-full" data-action="apply-coach-rules">将已选规则加入 Prompt 草稿</button>' : ''}
      ${analysis.editedCount ? '<button class="button button-soft button-full" data-action="download-coach-json">下载教练结果 JSON</button>' : ''}
      <button class="button button-soft button-full" data-action="download-post-edit-json">导出全部译后编辑 JSON</button>
    </div>
    <p class="coach-footnote">建议会先进入草稿供师生修改，只有发布后才创建新的 Prompt 版本。</p>`;
}

function renderCoachRule(rule, index) {
  const evidence = rule.evidence.map(renderCoachEvidence).join('');
  return `<article class="coach-rule">
    <label class="coach-rule-select"><input type="checkbox" data-coach-rule="${escapeHtml(rule.id)}" checked>
      <span><small>规则 ${index + 1}</small><strong>${escapeHtml(rule.title)}</strong></span></label>
    <p>${escapeHtml(rule.instruction)}</p>
    <details class="coach-evidence"><summary>查看结构依据 · ${rule.evidence.length} 处</summary>${evidence}</details>
  </article>`;
}

function renderCoachEvidence(item) {
  const hasDiff = item.diff.some((part) => part.type !== 'same');
  if (!hasDiff) return '';
  return `<div class="coach-evidence-item"><strong>${escapeHtml(item.label)} · ${escapeHtml(item.signal)}</strong>
    <div class="coach-evidence-diff" aria-label="T2 AI 原译到人工编辑 Diff">${renderDiffParts(item.diff)}</div></div>`;
}

function renderStatus(state) {
  const segment = store.getSegment();
  const project = store.getProject();
  let saveText = segment?.status === 'ai-edited'
    ? 'AI已编辑 · 建议与决策已保存在本机' : '所有更改保存在本机';
  if (state.serverMode) {
    saveText = project.editable
      ? '服务器已连接 · 点击“保存译后编辑”才写入'
      : '只读系统模板 · 发布并分配后可编辑';
  }
  document.querySelector('#save-status').textContent = saveText;
  document.querySelector('#current-user-status').textContent = document.body.dataset.authLabel
    || (state.role === 'teacher' ? '当前：林老师（教师）' : '当前：当前学生（学生）');
}
