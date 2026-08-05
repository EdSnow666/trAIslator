/**
 * 职责: 管理版本抽屉、Prompt 协作谱系、Diff、冷启动、导入与导出弹窗
 * 依赖内部: ../state/store.js, ../services/diff-engine.js, ../services/ai-post-edit.js, ./render.js
 * 依赖外部: DOM API
 * 暴露: dialogs | showToast
 */

import { store } from '../state/store.js?v=20260805-04';
import { buildDiff } from '../services/diff-engine.js';
import { resolveAiPostEdit } from '../services/ai-post-edit.js?v=20260804-01';
import { escapeHtml } from './render.js?v=20260805-04';

const modalRoot = document.querySelector('#modal-root');
let projectResourceCatalog = [];
const drawerRoot = document.querySelector('#drawer-root');

function promptLabel(prompt) {
  return prompt?.displayLabel || `v${prompt?.version || '?'}`;
}

function isManualTranslation(item) {
  return Boolean(item && (item.origin === 'manual'
    || item.serverVersionKind === 'manual_reference'));
}

function isStandaloneAiEdit(item) {
  return item.serverVersionKind === 'ai_post_edit';
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
    const aiVersion = item.aiPostEdit ? aiPostEditVersionCard(project, segment, item) : '';
    if (isStandaloneAiEdit(item)) return aiVersion;
    const regular = versionCard(project, segment, item);
    if (!aiVersion) return regular;
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
  const hasAiVersion = Boolean(item.aiPostEdit) && !isStandaloneAiEdit(item);
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

function briefGenerateButton(project) {
  if (!store.getState().serverMode || !project.canManage) return '';
  const label = project.briefPendingGeneration ? '生成冷启动任务书' : '重新自动生成';
  return `<button class="button button-soft" data-action="generate-project-resource"
    data-resource="brief">${label}</button>`;
}

function openBriefModal() {
  const project = store.getProject();
  const editable = !store.getState().serverMode || project.canManage;
  const fields = Object.keys({ genre: '', skopos: '', audience: '', register: '', strategy: '' })
    .map((key) => `<label>${briefLabel(key)}<textarea class="field field-full brief-edit-field"
      data-brief-key="${key}" ${editable ? '' : 'readonly'}>${escapeHtml(project.brief?.[key] || '')}</textarea></label>`).join('');
  const pending = project.briefPendingGeneration
    ? '<p class="muted">当前任务书等待生成；配置服务器模型后可点击下方按钮生成，也可以直接手动填写。</p>' : '';
  const body = `<div class="eyebrow">IDENTIFICATION · COLD START</div>
    <p class="muted">当前任务书会与项目 Prompt、术语、TM 和相邻句段一起编译。保存修改会新增一个可追溯版本。</p>${pending}
    <div class="brief-edit-grid">${fields}</div>`;
  const footer = editable ? `<button class="button button-ghost" data-action="close-modal">取消</button>${briefGenerateButton(project)}
    <button class="button button-primary" data-action="save-project-brief">保存任务书新版本</button>`
    : '<button class="button button-secondary" data-action="close-modal">关闭</button>';
  modal('冷启动任务书', body, footer);
}

function briefLabel(key) {
  return { genre: '文本类型', skopos: '翻译目的', audience: '目标读者', register: '语域', strategy: '策略' }[key] || key;
}

function openPromptLineageModal() {
  const project = store.getProject();
  const items = [...project.prompts].sort((a, b) => b.version - a.version);
  const cards = items.map((prompt) => promptLineageCard(project, prompt)).join('');
  const body = `<p class="muted prompt-lineage-intro">每个版本均保留完整内容、作者、提交状态和修改说明。学生候选只有主动提交后教师才能看到；教师发布只影响项目默认 Prompt。</p>
    <div class="prompt-lineage-modal">${cards}</div>`;
  modal('Prompt 谱系', body, '<button class="button button-ghost" data-action="close-modal">关闭</button>');
}

function submissionBadge(prompt) {
  const labels = {
    submitted: '已提交教师',
    accepted: '已被教师采纳',
    rejected: '教师未采纳',
    withdrawn: '已撤回',
  };
  return prompt.submissionStatus
    ? `<span class="badge prompt-status-badge">${labels[prompt.submissionStatus] || prompt.submissionStatus}</span>`
    : '';
}

function promptLineageActions(project, prompt, isActive) {
  const actions = [];
  if (isActive) actions.push('<span class="badge badge-direction">当前使用</span>');
  if (prompt.isPublished) actions.push('<span class="badge prompt-published-badge">项目发布版</span>');
  if (project.canManage && prompt.isPublished) {
    actions.push(`<button class="button button-soft" data-action="unpublish-prompt"
      data-prompt-id="${prompt.id}">取消发布</button>`);
  }
  if (!isActive && (!store.getState().serverMode || project.workspaceId)) {
    actions.push(`<button class="button button-soft" data-action="activate-prompt"
      data-prompt-id="${prompt.id}">设为当前 Prompt</button>`);
  }
  if (prompt.canSubmit) {
    actions.push(`<button class="button button-soft" data-action="submit-prompt"
      data-prompt-id="${prompt.id}">提交给教师</button>`);
  }
  if (project.canManage && !prompt.isPublished) {
    actions.push(`<button class="button button-primary" data-action="publish-prompt"
      data-prompt-id="${prompt.id}">发布为项目 Prompt</button>`);
  }
  actions.push(submissionBadge(prompt));
  return `<div class="prompt-lineage-actions">${actions.join('')}</div>`;
}

function promptParentNote(project, prompt) {
  if (!prompt.parentPromptId) return '';
  const localParent = project.prompts.find((item) => item.id === prompt.parentPromptId);
  const source = prompt.parentTitle
    ? `${prompt.parentProjectName || project.name} · ${prompt.parentTitle}`
    : localParent ? promptLabel(localParent) : prompt.parentPromptId;
  return `<p class="prompt-lineage-meta">继承自：${escapeHtml(source)}</p>`;
}
function promptLineageCard(project, prompt) {
  const isActive = prompt.id === project.activePromptId;
  return `<article class="prompt-lineage-card ${isActive ? 'is-active' : ''}">
    <header class="prompt-lineage-card-header"><div><span class="prompt-version">${escapeHtml(promptLabel(prompt))}</span><strong>${escapeHtml(prompt.title)}</strong></div>
      ${promptLineageActions(project, prompt, isActive)}</header>
    <p class="prompt-lineage-meta">${escapeHtml(prompt.author)} · ${escapeHtml(prompt.role)} · ${escapeHtml(prompt.createdAt)}</p>
    ${promptParentNote(project, prompt)}<p class="prompt-lineage-note">${escapeHtml(prompt.note)}</p>
    <div class="prompt-lineage-content">${escapeHtml(prompt.content)}</div>
  </article>`;
}

function promptSubmitOption(state, project) {
  if (!state.serverMode || state.role !== 'student' || !project.editable) return '';
  return `<label class="prompt-submit-option"><input id="prompt-submit-teacher" type="checkbox">
    <span><strong>保存后提交给教师</strong><small>不勾选时仅自己可见，也可以稍后在 Prompt 谱系中提交。</small></span></label>`;
}

function promptSources(project) {
  const current = project.prompts.map((prompt) => ({ ...prompt, projectName: project.name }));
  const catalog = projectResourceCatalog.length ? projectResourceCatalog : store.getState().projects;
  const external = catalog.filter((item) => item.id !== project.id)
    .flatMap((item) => item.prompts.map((prompt) => ({ ...prompt, projectName: item.name })));
  const seen = new Set();
  return [...current, ...external].filter((prompt) => {
    if (seen.has(prompt.id)) return false;
    seen.add(prompt.id);
    return true;
  });
}

function promptBaseOptions(project, selectedId) {
  return promptSources(project).map((prompt) => (
    `<option value="${prompt.id}" ${prompt.id === selectedId ? 'selected' : ''}>${escapeHtml(prompt.projectName)} · ${escapeHtml(promptLabel(prompt))} · ${escapeHtml(prompt.title)}</option>`
  )).join('') || '<option value="">暂无可用 Prompt</option>';
}

function findPromptSource(promptId) {
  return promptSources(store.getProject()).find((prompt) => prompt.id === promptId) || null;
}

function promptBaseSelection() {
  if (!modalRoot.querySelector('#prompt-use-base')?.checked) return null;
  return findPromptSource(modalRoot.querySelector('#prompt-base-version')?.value);
}

function copyPromptVersionToEditor() {
  const prompt = promptBaseSelection();
  const editor = modalRoot.querySelector('#prompt-content');
  if (prompt && editor) editor.value = prompt.content;
}

function updatePromptBaseVisibility() {
  const enabled = Boolean(modalRoot.querySelector('#prompt-use-base')?.checked);
  const controls = modalRoot.querySelector('[data-prompt-base-controls]');
  if (controls) controls.hidden = !enabled;
  if (enabled) copyPromptVersionToEditor();
}

function openPromptModal(content = '', options = {}) {
  const state = store.getState();
  const project = store.getProject();
  const title = escapeHtml(options.title || '课堂共创优化');
  const note = escapeHtml(options.note || '根据课堂讨论调整翻译策略');
  const selectedId = options.basePromptId || project.activePromptId;
  const body = `<div class="form-group"><label for="prompt-title">版本名称</label><input id="prompt-title" class="field field-full" value="${title}"></div>
    <div class="form-group"><label for="prompt-note">修改说明</label><input id="prompt-note" class="field field-full" value="${note}"></div>
    <label class="prompt-submit-option"><input id="prompt-use-base" type="checkbox"><span><strong>在已有 Prompt 基础上修改</strong><small>确认后选择当前项目或其他项目中可见的 Prompt，并复制到编辑框。</small></span></label>
    <div class="form-group" data-prompt-base-controls hidden><label for="prompt-base-version">选择基础 Prompt</label>
      <select id="prompt-base-version" class="field field-full">${promptBaseOptions(project, selectedId)}</select>
      <p class="muted">选择后只复制内容，原 Prompt 不会被修改。</p></div>
    <div class="form-group"><label for="prompt-content">新 Prompt 内容</label><textarea id="prompt-content" class="field field-full">${escapeHtml(content)}</textarea></div>
    ${promptSubmitOption(state, project)}
    <p class="muted prompt-save-note">保存后创建不可变候选版本；既有译文继续绑定原 Prompt。</p>`;
  const saveLabel = state.serverMode ? '保存候选版本' : '发布新版本';
  modal('创建 Prompt 新版本', body, `<button class="button button-ghost" data-action="close-modal">取消</button>
    <button class="button button-primary" data-action="save-prompt-version">${saveLabel}</button>`);
}
function openImportModal() {
  const accept = '.txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const body = `<div class="form-group"><label for="import-name">项目名称</label><input id="import-name" class="field field-full" value="新建本地翻译项目"></div>
    <div class="form-group"><label for="import-direction">翻译方向</label><select id="import-direction" class="field field-full"><option>EN → ZH</option><option>ZH → EN</option></select></div>
    <div class="form-group"><label for="import-file">导入文档（TXT、Word DOCX、PDF）</label><input id="import-file" type="file" accept="${accept}" class="field field-full"><p id="import-file-status" class="muted">最大 20 MB；扫描版 PDF 暂不支持 OCR。</p></div>
    <div class="form-group"><label for="import-text">或粘贴原文</label><textarea id="import-text" class="field field-full" placeholder="粘贴后将按段落切分；空行表示段落边界"></textarea></div>
    ${projectResourceSetupFields()}`;
  modal('新建本地项目', body, '<button class="button button-ghost" data-action="close-modal">取消</button><button class="button button-primary" data-action="create-import-project">创建本地项目</button>');
  updateProjectSetupVisibility();
}

function inheritableProjects() {
  if (store.getState().serverMode && projectResourceCatalog.length) return projectResourceCatalog;
  return store.getState().projects.filter((project) => project.id !== 'server-empty');
}

function setProjectResourceCatalog(resources) {
  projectResourceCatalog = resources;
}

function inheritedBriefOptions() {
  const options = inheritableProjects().filter((project) => project.briefVersionId);
  return options.length ? options.map((project) => `<option value="${project.briefVersionId}">${escapeHtml(project.name)}</option>`).join('')
    : '<option value="">暂无可继承任务书</option>';
}

function inheritedPromptOptions() {
  const options = inheritableProjects().map((project) => ({ project,
    prompt: project.prompts.find((item) => item.id === project.activePromptId) })).filter((item) => item.prompt);
  return options.length ? options.map(({ project, prompt }) => `<option value="${prompt.id}">${escapeHtml(project.name)} · ${escapeHtml(promptLabel(prompt))}</option>`).join('')
    : '<option value="">暂无可继承 Prompt</option>';
}

function briefSetupEditor() {
  const keys = ['genre', 'skopos', 'audience', 'register', 'strategy'];
  return `<div class="brief-edit-grid" data-setup-field="brief-editor" hidden>${keys.map((key) => (
    `<label>${briefLabel(key)}<textarea class="field field-full brief-edit-field" data-brief-setup-key="${key}"></textarea></label>`
  )).join('')}</div>`;
}

function projectResourceSetupFields() {
  return `<section class="project-setup-section"><h3>冷启动任务书</h3>
    <label>创建方式<select id="import-brief-mode" class="field field-full"><option value="auto">采样前 10 段自动生成</option><option value="inherit">继承并编辑既有任务书</option><option value="manual">手动编辑</option></select></label>
    <label data-setup-field="brief-inherit" hidden>继承来源<select id="import-brief-version" class="field field-full">${inheritedBriefOptions()}</select></label>
    ${briefSetupEditor()}
  </section><section class="project-setup-section"><h3>全文 Prompt</h3>
    <label>创建方式<select id="import-prompt-mode" class="field field-full"><option value="auto">依据任务书自动生成全文 Prompt</option><option value="inherit">继承并编辑既有 Prompt</option><option value="manual">手动编辑</option></select></label>
    <label data-setup-field="prompt-inherit" hidden>继承来源<select id="import-prompt-version" class="field field-full">${inheritedPromptOptions()}</select></label>
    <textarea id="import-prompt-manual" data-setup-field="prompt-editor" hidden class="field field-full" placeholder="复制来源后可立即编辑，原 Prompt 不受影响"></textarea>
  </section>`;
}

function copyInheritedBrief() {
  const versionId = modalRoot.querySelector('#import-brief-version')?.value;
  const source = inheritableProjects().find((project) => project.briefVersionId === versionId)?.brief || {};
  modalRoot.querySelectorAll('[data-brief-setup-key]').forEach((field) => {
    field.value = source[field.dataset.briefSetupKey] || '';
  });
}

function copyInheritedPrompt() {
  const promptId = modalRoot.querySelector('#import-prompt-version')?.value;
  const prompt = inheritableProjects().flatMap((project) => project.prompts).find((item) => item.id === promptId);
  const editor = modalRoot.querySelector('#import-prompt-manual');
  if (editor) editor.value = prompt?.content || '';
}

function updateProjectSetupVisibility() {
  ['brief', 'prompt'].forEach((kind) => {
    const mode = modalRoot.querySelector(`#import-${kind}-mode`)?.value || 'auto';
    modalRoot.querySelectorAll(`[data-setup-field^="${kind}-"]`).forEach((field) => {
      const suffix = field.dataset.setupField.replace(`${kind}-`, '');
      field.hidden = suffix === 'inherit' ? mode !== 'inherit' : !['inherit', 'manual'].includes(mode);
    });
  });
}

function copySelectedResource(target) {
  if (target.id === 'prompt-use-base') return updatePromptBaseVisibility();
  if (target.id === 'prompt-base-version') return copyPromptVersionToEditor();
  if (target.id === 'import-brief-version' || (target.id === 'import-brief-mode' && target.value === 'inherit')) {
    copyInheritedBrief();
  }
  if (target.id === 'import-prompt-version' || (target.id === 'import-prompt-mode' && target.value === 'inherit')) {
    copyInheritedPrompt();
  }
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
  updateProjectSetupVisibility,
  copySelectedResource,
  setProjectResourceCatalog,
  promptBaseSelection,
  openExportModal,
  openTermModal,
};
