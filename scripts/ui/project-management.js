/**
 * 职责: 提供独立的项目管理弹窗，集中处理项目创建、发布、取消发布与删除
 * 依赖内部: ../services/auth-client.js, ./dialogs.js, ./render.js
 * 依赖外部: Fetch API, DOM API
 * 暴露: openProjectManagementModal
 */

import { apiRequest, currentAuth } from '../services/auth-client.js';
import { dialogs, showToast } from './dialogs.js';
import { escapeHtml } from './render.js';

const modalRoot = document.querySelector('#modal-root');
let projects = [];

function canManageProjects() {
  return currentAuth.mode === 'server'
    && currentAuth.user?.roles.some((role) => ['admin', 'teacher'].includes(role));
}

function projectTags(project) {
  const tags = [project.isLocal ? '本地' : null, ...(project.classTags || [])].filter(Boolean);
  return tags.map((tag, index) => `<span class="badge ${index ? 'badge-project-class' : 'badge-project-origin'}">${escapeHtml(tag)}</span>`).join('');
}

function statusAction(project) {
  const published = project.status === 'published';
  const action = published ? 'unpublish' : 'publish';
  const label = published ? '取消发布' : '发布';
  return `<button class="text-button" data-project-management-action="${action}"
    data-project-id="${project.id}">${label}</button>`;
}

function projectCard(project) {
  return `<article class="management-panel"><div class="management-panel-title">
    <div><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.direction)} · ${escapeHtml(project.status)}</p>
      <div class="project-tags">${projectTags(project)}</div></div>
    <span class="management-row-actions">${statusAction(project)}
      <button class="text-button danger-text" data-project-management-action="delete"
        data-project-id="${project.id}" data-project-name="${escapeHtml(project.name)}">删除</button></span>
  </div></article>`;
}

function projectList() {
  if (!projects.length) return '<div class="empty-state">尚无可管理项目。</div>';
  return projects.map(projectCard).join('');
}

function modalMarkup() {
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal management-modal"
    role="dialog" aria-modal="true" aria-label="项目管理" data-modal-stop>
    <header class="modal-header"><div><div class="eyebrow">PROJECT MANAGEMENT</div><h2>项目管理</h2></div>
      <button class="icon-button" data-action="close-modal">×</button></header>
    <div class="modal-body management-body"><div class="management-section-head"><div><h3>我的项目</h3>
      <span>在这里发布、取消发布或删除项目</span></div>
      <button class="button button-primary" data-project-management-action="create">新建本地项目</button></div>
      <div class="management-list">${projectList()}</div></div>
    <footer class="modal-footer"><span>删除采用软删除，活动审计记录仍会保留。</span>
      <button class="button button-secondary" data-action="close-modal">关闭</button></footer>
  </section></div>`;
}

async function loadProjects() {
  const result = await apiRequest('/api/projects');
  projects = result.projects.filter((project) => project.canManage && project.projectKind !== 'system_template');
}

async function refresh(message) {
  await loadProjects();
  modalRoot.innerHTML = modalMarkup();
  window.dispatchEvent(new CustomEvent('server-projects-changed'));
  if (message) showToast(message);
}

function confirmAction(action, trigger) {
  if (action === 'unpublish') return window.confirm('取消发布会关闭班级与实验分配，但保留现有译文和活动记录。继续吗？');
  if (action === 'delete') return window.confirm(`确认删除项目“${trigger.dataset.projectName}”吗？项目将从列表隐藏，但审计记录仍保留。`);
  return true;
}

async function mutateProject(action, projectId) {
  const method = action === 'delete' ? 'DELETE' : 'POST';
  const suffix = action === 'delete' ? '' : `/${action}`;
  await apiRequest(`/api/projects/${encodeURIComponent(projectId)}${suffix}`, { method });
  const messages = { publish: '项目已发布。', unpublish: '项目已取消发布。', delete: '项目已删除。' };
  await refresh(messages[action]);
}

async function handleClick(event) {
  const trigger = event.target.closest('[data-project-management-action]');
  if (!trigger) return;
  const action = trigger.dataset.projectManagementAction;
  if (action === 'create') { dialogs.closeModal(); return dialogs.openImportModal(); }
  if (!confirmAction(action, trigger)) return;
  trigger.disabled = true;
  try { await mutateProject(action, trigger.dataset.projectId); }
  catch (error) { showToast(`项目操作失败：${error.message}`); }
  finally { if (trigger.isConnected) trigger.disabled = false; }
}

modalRoot.addEventListener('click', handleClick);

export async function openProjectManagementModal() {
  if (!canManageProjects()) return showToast('项目管理仅供服务器版教师和管理员使用。');
  modalRoot.innerHTML = '<div class="modal-backdrop"><section class="modal management-modal"><div class="management-loading">正在加载项目…</div></section></div>';
  try { await loadProjects(); modalRoot.innerHTML = modalMarkup(); }
  catch (error) { modalRoot.innerHTML = ''; showToast(`项目管理加载失败：${error.message}`); }
}