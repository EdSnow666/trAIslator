/**
 * 职责: 提供服务器版账号、班级、项目、实验与活动审计弹窗
 * 依赖内部: ../services/auth-client.js, ./dialogs.js, ./render.js, ./management-experiments.js
 * 依赖外部: Fetch API, DOM API
 * 暴露: openManagementModal
 */

import { apiRequest, currentAuth } from '../services/auth-client.js?v=20260805-02';
import { showToast } from './dialogs.js?v=20260805-07';
import { experimentPane, auditPane } from './management-experiments.js?v=20260805-01';
import { escapeHtml } from './render.js?v=20260805-04';

const modalRoot = document.querySelector('#modal-root');
const roleLabels = { admin: '管理员', teacher: '教师', student: '学生', experiment_user: '实验用户' };
let managementState = emptyState();

function emptyState() {
  return { tab: 'teaching', classes: [], projects: [], users: [], experiments: [], events: [],
    classDetail: null, experimentDetail: null, selectedClassId: null, selectedExperimentId: null,
    auditPrefix: '', secret: null };
}

function isAdmin() {
  return currentAuth.user?.roles.includes('admin');
}

function canManage() {
  return currentAuth.mode === 'server'
    && currentAuth.user?.roles.some((role) => ['admin', 'teacher'].includes(role));
}

function safeRoles(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

async function loadClassDetail() {
  if (!managementState.selectedClassId) return null;
  const result = await apiRequest(`/api/classes/${encodeURIComponent(managementState.selectedClassId)}`);
  return result.class;
}

async function loadExperimentDetail() {
  if (!managementState.selectedExperimentId) return null;
  const result = await apiRequest(`/api/experiments/${encodeURIComponent(managementState.selectedExperimentId)}`);
  return result.experiment;
}

function auditUrl() {
  const query = new URLSearchParams({ limit: '120' });
  if (managementState.auditPrefix) query.set('eventPrefix', managementState.auditPrefix);
  return `/api/activity/managed?${query}`;
}

function selectAvailableRecords() {
  const hasClass = managementState.classes.some((item) => item.id === managementState.selectedClassId);
  if (!hasClass) managementState.selectedClassId = managementState.classes[0]?.id || null;
  const hasExperiment = managementState.experiments.some(
    (item) => item.id === managementState.selectedExperimentId,
  );
  if (!hasExperiment) managementState.selectedExperimentId = managementState.experiments[0]?.id || null;
}

async function loadManagementData() {
  const requests = [apiRequest('/api/classes'), apiRequest('/api/projects'),
    apiRequest('/api/experiments'), apiRequest(auditUrl())];
  if (isAdmin()) requests.push(apiRequest('/api/admin/users'));
  const [classResult, projectResult, experimentResult, activityResult, userResult] = await Promise.all(requests);
  managementState.classes = classResult.classes;
  managementState.projects = projectResult.projects;
  managementState.experiments = experimentResult.experiments;
  managementState.events = activityResult.events;
  managementState.users = userResult?.users || [];
  selectAvailableRecords();
  [managementState.classDetail, managementState.experimentDetail] = await Promise.all([
    loadClassDetail(), loadExperimentDetail(),
  ]);
}

function roleText(roles) {
  return safeRoles(roles).map((role) => roleLabels[role] || role).join(' · ');
}

function classOptions() {
  if (!managementState.classes.length) return '<option value="">请先创建班级</option>';
  return managementState.classes.map((item) => (
    `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.code)}</option>`)).join('');
}

function projectLabel(item) {
  return `${item.name} · ${item.isLocal ? '本地' : `班级 ${item.teachingAssignmentCount}`}`;
}

function projectSuggestions() {
  const projects = managementState.projects.filter((item) => item.canManage && item.projectKind !== 'system_template');
  if (!projects.length) return '';
  return projects.map((item) => `<option value="${escapeHtml(projectLabel(item))}"
    data-project-id="${item.id}"></option>`).join('');
}


function secretNotice() {
  if (!managementState.secret) return '';
  return `<section class="management-secret" aria-label="一次性密码">
    <strong>${escapeHtml(managementState.secret.label)}</strong>
    <code>${escapeHtml(managementState.secret.value)}</code>
    <p>请现在安全保存；关闭窗口后系统不会再次显示该密码。</p>
  </section>`;
}

function classCards() {
  if (!managementState.classes.length) return '<div class="empty-state">尚未创建班级。</div>';
  return managementState.classes.map((item) => `<button class="management-list-card ${item.id === managementState.selectedClassId ? 'is-active' : ''}"
      data-management-action="select-class" data-class-id="${item.id}">
      <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code)}</small></span>
      <span>${item.studentCount} 名学生 · ${item.memberCount} 名成员</span>
    </button>`).join('');
}

function memberRows() {
  const members = managementState.classDetail?.members || [];
  if (!members.length) return '<div class="empty-state">班级暂无成员。</div>';
  return members.map((member) => `<div class="management-member-row">
    <span><strong>${escapeHtml(member.displayName)}</strong><small>@${escapeHtml(member.username)} · ${roleLabels[member.membershipRole]}</small></span>
    <span class="management-row-actions"><em>${member.status === 'active' ? '有效' : '已移除'}</em>
      ${member.status === 'active' ? `<button class="text-button danger-text" data-management-action="remove-member"
        data-user-id="${member.id}" data-membership-role="${member.membershipRole}">移除</button>` : ''}</span>
  </div>`).join('');
}

function classProjectRows() {
  const projects = managementState.classDetail?.projects || [];
  if (!projects.length) return '<div class="empty-state">该班级尚未分配项目。</div>';
  return projects.map((project) => `<div class="management-member-row">
    <span><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.direction)} · ${escapeHtml(project.status)}</small></span>
  </div>`).join('');
}
function classDetailPanel() {
  const detail = managementState.classDetail;
  if (!detail) return '<section class="management-panel"><div class="empty-state">选择或创建班级后管理成员。</div></section>';
  return `<section class="management-panel"><div class="management-panel-title">
      <div><h3>${escapeHtml(detail.name)}</h3><p>${escapeHtml(detail.code)} · ${detail.memberCount} 名成员</p></div>
    </div><h4>已分配项目</h4><div class="management-members">${classProjectRows()}</div>
    <h4>班级成员</h4><div class="management-members">${memberRows()}</div>
    <form class="management-inline-form" data-management-form="add-member">
      <input type="hidden" name="classId" value="${detail.id}">
      <label>账号用户名<input class="field" name="username" required placeholder="例如 student-01"></label>
      <label>班级身份<select class="field" name="membershipRole"><option value="student">学生</option><option value="teacher">教师</option></select></label>
      <button class="button button-secondary" type="submit">添加成员</button>
    </form></section>`;
}

function createClassForm() {
  return `<form class="management-panel management-create-class" data-management-form="create-class"><h3>新建班级</h3>
    <label>班级名称<input class="field" name="name" required placeholder="例如 2026 春季英汉翻译"></label>
    <label>班级代码<input class="field" name="code" required placeholder="例如 ENZH-2026-01"></label>
    <button class="button button-secondary" type="submit">创建班级</button></form>`;
}

function projectForms() {
  return `<form class="management-panel" data-management-form="assign-project"><h3>分配项目</h3>
      <label>项目<input class="field" name="projectQuery" list="management-project-options"
        data-project-combobox autocomplete="off" required placeholder="选择或输入项目名筛选">
        <input type="hidden" name="projectId"><datalist id="management-project-options">${projectSuggestions()}</datalist></label>
      <label>发布到班级<select class="field" name="classId" required>${classOptions()}</select></label>
      <button class="button button-primary" type="submit">分配到班级</button></form>`;
}
function teachingPane() {
  return `<div class="management-columns"><section><div class="management-section-head"><h3>班级</h3><span>${managementState.classes.length} 个</span></div>
      <div class="management-list">${classCards()}</div>${classDetailPanel()}${createClassForm()}</section>
    <section><div class="management-section-head"><h3>项目分配</h3><span>把已有项目分配到班级</span></div>
      ${projectForms()}</section></div>`;
}

function userRows() {
  if (!managementState.users.length) return '<div class="empty-state">尚无账号。</div>';
  return managementState.users.map((user) => `<div class="management-user-row">
    <span><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)} · ${escapeHtml(roleText(user.roles))}</small></span>
    <span><em>${user.mustChangePassword ? '待首次改密' : user.status}</em>
      <button class="text-button" data-management-action="reset-password" data-user-id="${user.id}" data-user-name="${escapeHtml(user.username)}">重置密码</button></span>
  </div>`).join('');
}

function accountsPane() {
  return `<div class="management-account-layout"><form class="management-panel" data-management-form="create-user"><h3>创建账号</h3>
      <label>用户名<input class="field" name="username" required autocomplete="off"></label>
      <label>显示名称<input class="field" name="displayName" required></label>
      <label>账号角色<select class="field" name="role"><option value="student">学生</option><option value="teacher">教师</option><option value="experiment_user">实验用户</option><option value="admin">管理员</option></select></label>
      <button class="button button-primary" type="submit">生成账号与随机密码</button></form>
    <section class="management-panel"><div class="management-section-head"><h3>账号列表</h3><span>${managementState.users.length} 个</span></div>
      <div class="management-user-list">${userRows()}</div></section></div>`;
}

function activePane() {
  if (managementState.tab === 'experiments') return experimentPane(managementState);
  if (managementState.tab === 'audit') return auditPane(managementState);
  if (managementState.tab === 'accounts' && isAdmin()) return accountsPane();
  return teachingPane();
}

function tabButton(tab, label) {
  return `<button data-management-action="switch-tab" data-tab="${tab}"
    class="${managementState.tab === tab ? 'is-active' : ''}">${label}</button>`;
}

function modalMarkup() {
  const accountsTab = isAdmin() ? tabButton('accounts', '账号管理') : '';
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal management-modal" role="dialog" aria-modal="true" aria-label="教学管理" data-modal-stop>
    <header class="modal-header"><div><div class="eyebrow">SERVER MANAGEMENT</div><h2>教学管理</h2></div><button class="icon-button" data-action="close-modal">×</button></header>
    <div class="management-tabs">${tabButton('teaching', '班级与分配')}${tabButton('experiments', '实验管理')}${tabButton('audit', '活动审计')}${accountsTab}</div>
    <div class="modal-body management-body">${secretNotice()}${activePane()}</div>
    <footer class="modal-footer"><span>所有操作即时写入服务器并记录活动事件。</span><button class="button button-secondary" data-action="close-modal">关闭</button></footer>
  </section></div>`;
}

function renderManagement() {
  modalRoot.innerHTML = modalMarkup();
}

async function refreshManagement(message, projectsChanged = false) {
  await loadManagementData();
  renderManagement();
  if (projectsChanged) window.dispatchEvent(new CustomEvent('server-projects-changed'));
  if (message) showToast(message);
}

async function createClass(form) {
  const data = new FormData(form);
  const result = await apiRequest('/api/classes', { method: 'POST', body: JSON.stringify({
    name: data.get('name'), code: data.get('code'),
  }) });
  managementState.selectedClassId = result.id;
  await refreshManagement('班级已创建。');
}

async function addMember(form) {
  const data = new FormData(form);
  await apiRequest(`/api/classes/${encodeURIComponent(data.get('classId'))}/members`, {
    method: 'POST', body: JSON.stringify({ username: data.get('username'), membershipRole: data.get('membershipRole') }),
  });
  await refreshManagement('班级成员已添加。');
}

async function assignProject(form) {
  const data = new FormData(form);
  if (!data.get('projectId') || !data.get('classId')) throw new Error('请从项目候选中选择项目，并选择班级。');
  await apiRequest(`/api/projects/${encodeURIComponent(data.get('projectId'))}/publish`, { method: 'POST' });
  await apiRequest(`/api/projects/${encodeURIComponent(data.get('projectId'))}/assignments`, {
    method: 'POST', body: JSON.stringify({ classId: data.get('classId') }),
  });
  await refreshManagement('项目已分配到班级。', true);
}

async function createExperiment(form) {
  const data = new FormData(form);
  const result = await apiRequest('/api/experiments', { method: 'POST', body: JSON.stringify({
    name: data.get('name'), description: data.get('description'),
  }) });
  managementState.selectedExperimentId = result.id;
  await refreshManagement('实验已创建。');
}

async function createStage(form) {
  const data = new FormData(form);
  await apiRequest(`/api/experiments/${encodeURIComponent(data.get('experimentId'))}/stages`, {
    method: 'POST', body: JSON.stringify({ name: data.get('name'), stageOrder: Number(data.get('stageOrder')) }),
  });
  await refreshManagement('实验阶段已创建。');
}

async function enrollParticipant(form) {
  const data = new FormData(form);
  await apiRequest(`/api/experiments/${encodeURIComponent(data.get('experimentId'))}/participants`, {
    method: 'POST', body: JSON.stringify({ username: data.get('username'), participantCode: data.get('participantCode') }),
  });
  await refreshManagement('受试者已加入实验。');
}

async function assignExperimentProject(form) {
  const data = new FormData(form);
  if (!data.get('projectId') || !data.get('stageId')) throw new Error('请先创建项目和实验阶段。');
  await apiRequest(`/api/projects/${encodeURIComponent(data.get('projectId'))}/assignments`, {
    method: 'POST', body: JSON.stringify({ experimentStageId: data.get('stageId') }),
  });
  await refreshManagement('项目已分配到实验阶段。', true);
}

async function createUser(form) {
  const data = new FormData(form);
  const result = await apiRequest('/api/admin/users', { method: 'POST', body: JSON.stringify({
    username: data.get('username'), displayName: data.get('displayName'), roles: [data.get('role')],
  }) });
  managementState.secret = { label: `账号 ${data.get('username')} 的初始密码`, value: result.password };
  await refreshManagement('账号已创建，请立即保存随机密码。');
}

const formHandlers = { 'create-class': createClass, 'add-member': addMember,
  'assign-project': assignProject, 'create-user': createUser,
  'create-experiment': createExperiment, 'create-stage': createStage,
  'enroll-participant': enrollParticipant, 'assign-experiment-project': assignExperimentProject };

async function handleManagementSubmit(event) {
  const form = event.target.closest('[data-management-form]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  if (button) button.disabled = true;
  try { await formHandlers[form.dataset.managementForm](form); }
  catch (error) { showToast(`操作失败：${error.message}`); }
  finally { if (button?.isConnected) button.disabled = false; }
}

async function resetPassword(trigger) {
  const result = await apiRequest(`/api/admin/users/${encodeURIComponent(trigger.dataset.userId)}/reset-password`, { method: 'POST' });
  managementState.secret = { label: `账号 ${trigger.dataset.userName} 的新密码`, value: result.password };
  await refreshManagement('密码已重置，原登录会话已失效。');
}

async function removeMember(trigger) {
  const classId = managementState.selectedClassId;
  await apiRequest(`/api/classes/${encodeURIComponent(classId)}/members/${encodeURIComponent(trigger.dataset.userId)}/${trigger.dataset.membershipRole}`, { method: 'DELETE' });
  await refreshManagement('班级成员已移除。');
}

async function withdrawParticipant(trigger) {
  const experimentId = managementState.selectedExperimentId;
  await apiRequest(`/api/experiments/${encodeURIComponent(experimentId)}/participants/${encodeURIComponent(trigger.dataset.userId)}`, { method: 'DELETE' });
  await refreshManagement('受试者已撤回，既有活动记录继续保留。');
}

async function handleManagementClick(event) {
  const trigger = event.target.closest('[data-management-action]');
  if (!trigger || ['experiment-status', 'audit-filter'].includes(trigger.dataset.managementAction)) return;
  const action = trigger.dataset.managementAction;
  if (action === 'switch-tab') { managementState.tab = trigger.dataset.tab; return renderManagement(); }
  if (action === 'select-class') { managementState.selectedClassId = trigger.dataset.classId; return refreshManagement(); }
  if (action === 'select-experiment') {
    managementState.selectedExperimentId = trigger.dataset.experimentId;
    return refreshManagement();
  }
  trigger.disabled = true;
  try {
    if (action === 'reset-password') await resetPassword(trigger);
    if (action === 'remove-member') await removeMember(trigger);
    if (action === 'withdraw-participant') await withdrawParticipant(trigger);
  } catch (error) { showToast(`操作失败：${error.message}`); }
  finally { if (trigger.isConnected) trigger.disabled = false; }
}

async function handleManagementChange(event) {

  const trigger = event.target.closest('[data-management-action]');
  if (!trigger) return;
  try {
    if (trigger.dataset.managementAction === 'audit-filter') {
      managementState.auditPrefix = trigger.value;
      await refreshManagement();
    }
    if (trigger.dataset.managementAction === 'experiment-status') {
      await apiRequest(`/api/experiments/${encodeURIComponent(managementState.selectedExperimentId)}/status`, {
        method: 'POST', body: JSON.stringify({ status: trigger.value }),
      });
      await refreshManagement('实验状态已更新。');
    }
  } catch (error) { showToast(`操作失败：${error.message}`); }
}

function syncProjectCombobox(event) {
  const input = event.target.closest('[data-project-combobox]');
  if (!input) return;
  const hidden = input.form?.querySelector('[name="projectId"]');
  const options = [...(input.list?.options || [])];
  const selected = options.find((option) => option.value === input.value);
  if (hidden) hidden.value = selected?.dataset.projectId || '';
}
modalRoot.addEventListener('submit', handleManagementSubmit);
modalRoot.addEventListener('click', handleManagementClick);
modalRoot.addEventListener('change', handleManagementChange);
modalRoot.addEventListener('input', syncProjectCombobox);
modalRoot.addEventListener('change', syncProjectCombobox);

export async function openManagementModal() {
  if (!canManage()) return showToast('教学管理仅供服务器版教师和管理员使用。');
  managementState = emptyState();
  modalRoot.innerHTML = '<div class="modal-backdrop"><section class="modal management-modal"><div class="management-loading">正在加载教学管理数据…</div></section></div>';
  try { await loadManagementData(); renderManagement(); }
  catch (error) { modalRoot.innerHTML = ''; showToast(`教学管理加载失败：${error.message}`); }
}
