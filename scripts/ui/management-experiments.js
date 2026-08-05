/**
 * 职责: 渲染实验管理与活动审计视图
 * 依赖内部: ./render.js
 * 依赖外部: DOM API
 * 暴露: experimentPane | auditPane
 */

import { escapeHtml } from './render.js?v=20260805-04';

const statusLabels = { draft: '草稿', active: '进行中', closed: '已结束', archived: '已归档' };
const eventLabels = {
  'class.created': '创建班级', 'class.member_added': '添加班级成员',
  'class.member_removed': '移除班级成员', 'project.created': '创建项目',
  'project.published': '发布项目', 'project.assigned': '分配项目',
  'experiment.created': '创建实验', 'experiment.stage_created': '创建实验阶段',
  'experiment.participant_enrolled': '加入受试者',
  'experiment.participant_withdrawn': '撤回受试者',
  'experiment.status_changed': '更改实验状态', 'prompt.created': '生成 Prompt',
  'prompt.submitted': '提交 Prompt', 'prompt.published': '发布 Prompt',
  'translation.generated': '生成译文版本', 'translation.ai_post_edit_generated': '生成 AI 译后编辑',
  'translation.human_post_edit_saved': '保存译后编辑', 'model.server_config_saved': '保存服务器模型配置',
  'model.server_config_disabled': '停用服务器模型配置', 'ai.request_started': '启动 AI 任务',
  'ai.request_failed': 'AI 任务失败',
};

function managedProjects(state) {
  return state.projects.filter((item) => item.canManage && item.projectKind !== 'system_template');
}

function projectOptions(state) {
  const projects = managedProjects(state);
  if (!projects.length) return '<option value="">请先创建项目</option>';
  return projects.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
}

function experimentCards(state) {
  if (!state.experiments.length) return '<div class="empty-state">尚未创建实验。</div>';
  return state.experiments.map((item) => `<button class="management-list-card ${item.id === state.selectedExperimentId ? 'is-active' : ''}"
      data-management-action="select-experiment" data-experiment-id="${item.id}">
    <span><strong>${escapeHtml(item.name)}</strong><small>${statusLabels[item.status] || item.status}</small></span>
    <span>${item.stageCount} 个阶段 · ${item.participantCount} 名受试者</span>
  </button>`).join('');
}

function stageRows(detail) {
  if (!detail.stages.length) return '<div class="empty-state">尚未创建实验阶段。</div>';
  return detail.stages.map((stage) => `<div class="management-member-row">
    <span><strong>阶段 ${stage.stageOrder}</strong><small>${escapeHtml(stage.name)}</small></span>
    <em>可分配项目</em>
  </div>`).join('');
}

function participantRows(detail) {
  if (!detail.participants.length) return '<div class="empty-state">尚未加入受试者。</div>';
  return detail.participants.map((item) => `<div class="management-member-row">
    <span><strong>${escapeHtml(item.participantCode)}</strong><small>${escapeHtml(item.displayName)} · @${escapeHtml(item.username)}</small></span>
    <span class="management-row-actions"><em>${item.status === 'active' ? '参与中' : '已撤回'}</em>
      ${item.status === 'active' ? `<button class="text-button danger-text" data-management-action="withdraw-participant"
        data-user-id="${item.id}">撤回</button>` : ''}</span>
  </div>`).join('');
}

function stageOptions(detail) {
  if (!detail.stages.length) return '<option value="">请先创建阶段</option>';
  return detail.stages.map((stage) => (
    `<option value="${stage.id}">阶段 ${stage.stageOrder} · ${escapeHtml(stage.name)}</option>`)).join('');
}

function statusControl(detail) {
  const options = Object.entries(statusLabels).map(([value, label]) => (
    `<option value="${value}" ${detail.status === value ? 'selected' : ''}>${label}</option>`)).join('');
  return `<label class="management-status-control">实验状态
    <select class="field" data-management-action="experiment-status">${options}</select></label>`;
}

function experimentForms(state, detail) {
  return `<div class="management-experiment-forms">
    <form class="management-panel" data-management-form="create-stage"><h3>新增阶段</h3>
      <input type="hidden" name="experimentId" value="${detail.id}">
      <label>阶段名称<input class="field" name="name" required placeholder="例如 初次翻译"></label>
      <label>阶段顺序<input class="field" name="stageOrder" type="number" min="1" required value="${detail.stages.length + 1}"></label>
      <button class="button button-secondary" type="submit">创建阶段</button></form>
    <form class="management-panel" data-management-form="enroll-participant"><h3>加入受试者</h3>
      <input type="hidden" name="experimentId" value="${detail.id}">
      <label>实验用户名<input class="field" name="username" required placeholder="experiment-01"></label>
      <label>受试者编号<input class="field" name="participantCode" required placeholder="P001"></label>
      <button class="button button-secondary" type="submit">加入实验</button></form>
    <form class="management-panel management-stage-assignment" data-management-form="assign-experiment-project"><h3>分配项目到阶段</h3>
      <label>项目<select class="field" name="projectId" required>${projectOptions(state)}</select></label>
      <label>实验阶段<select class="field" name="stageId" required>${stageOptions(detail)}</select></label>
      <button class="button button-primary" type="submit">分配项目</button></form>
  </div>`;
}

function experimentDetailPanel(state) {
  const detail = state.experimentDetail;
  if (!detail) return '<section class="management-panel"><div class="empty-state">选择或创建实验后配置阶段和受试者。</div></section>';
  return `<section class="management-panel management-experiment-detail">
    <div class="management-panel-title"><div><h3>${escapeHtml(detail.name)}</h3>
      <p>${escapeHtml(detail.description || '暂无说明')}</p></div>${statusControl(detail)}</div>
    <div class="management-detail-grid"><section><h4>实验阶段</h4>${stageRows(detail)}</section>
      <section><h4>受试者</h4>${participantRows(detail)}</section></div>
    ${experimentForms(state, detail)}
  </section>`;
}

function createExperimentForm() {
  return `<form class="management-panel management-create-experiment" data-management-form="create-experiment"><h3>新建实验</h3>
    <label>实验名称<input class="field" name="name" required placeholder="例如 结构优化实验"></label>
    <label>实验说明<textarea class="field" name="description" rows="3" placeholder="记录实验目标和阶段设计"></textarea></label>
    <button class="button button-primary" type="submit">创建实验</button></form>`;
}

export function experimentPane(state) {
  return `<div class="management-experiment-layout"><aside>
    <div class="management-section-head"><h3>实验</h3><span>${state.experiments.length} 个</span></div>
    <div class="management-list">${experimentCards(state)}</div>${createExperimentForm()}</aside>
    <div>${experimentDetailPanel(state)}</div></div>`;
}

function eventTitle(event) {
  return eventLabels[event.eventType] || event.eventType;
}

function metadataSummary(event) {
  const metadata = event.metadata || {};
  const values = [metadata.status, metadata.membershipRole, metadata.stageOrder ? `阶段 ${metadata.stageOrder}` : '']
    .filter(Boolean);
  return values.join(' · ') || event.projectName || '已记录';
}

function eventRows(state) {
  if (!state.events.length) return '<div class="empty-state">当前筛选条件下没有活动记录。</div>';
  return state.events.map((event) => `<div class="management-audit-row">
    <span class="management-audit-dot"></span><span><strong>${escapeHtml(eventTitle(event))}</strong>
      <small>${escapeHtml(event.displayName || event.username || '系统')} · ${escapeHtml(metadataSummary(event))}</small></span>
    <time>${new Date(event.occurredAt).toLocaleString('zh-CN', { hour12: false })}</time>
  </div>`).join('');
}

function auditFilters(state) {
  const options = [['', '全部活动'], ['experiment.', '实验'], ['project.', '项目'], ['class.', '班级'],
    ['prompt.', 'Prompt'], ['translation.', '译文'], ['model.', '模型配置'], ['ai.', 'AI 任务'],
    ['workspace.', '工作空间']];
  return options.map(([value, label]) => (
    `<option value="${value}" ${state.auditPrefix === value ? 'selected' : ''}>${label}</option>`)).join('');
}

export function auditPane(state) {
  return `<section class="management-panel management-audit-panel">
    <div class="management-section-head"><div><h3>活动审计</h3><p>仅记录创建、发布、生成和保存等有意义事件。</p></div>
      <label>显示范围<select class="field" data-management-action="audit-filter">${auditFilters(state)}</select></label></div>
    <div class="management-audit-list">${eventRows(state)}</div>
  </section>`;
}
