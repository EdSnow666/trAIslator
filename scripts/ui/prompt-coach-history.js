/**
 * 职责: 浏览当前账号教练运行历史、查看规则与依据、导出完整运行快照
 * 依赖内部: ../services/auth-client.js, ../state/store.js, ./dialogs.js, ./render.js
 * 依赖外部: DOM API, Blob API
 * 暴露: openCoachHistory | viewCoachHistory | downloadCoachHistory
 */

import { apiRequest } from '../services/auth-client.js';
import { store } from '../state/store.js';
import { dialogs, showToast } from './dialogs.js';
import { escapeHtml, renderMentorPanel } from './render.js';

let scope = 'project';
let offset = 0;
let detail = null;
let requestSerial = 0;
const scopeLabels = { workspace: '个人项目', projects: '多项目总结', class: '全班总结' };

function formatTime(value) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function historyRow(run) {
  return `<button class="coach-history-row" data-action="view-coach-history" data-run-id="${escapeHtml(run.id)}">
    <strong>${escapeHtml(formatTime(run.createdAt))}</strong>
    <span>${escapeHtml(scopeLabels[run.scopeType] || run.scopeType)}${run.scopeName ? ` · ${escapeHtml(run.scopeName)}` : ''}</span>
    <small>${run.inputRecordCount} 组 Diff · ${run.ruleCount || 0} 条规则 · ${escapeHtml(run.model || '')}</small></button>`;
}

function listBody(data) {
  const filters = `<div class="coach-history-toolbar"><button class="button ${scope === 'project' ? 'button-secondary' : 'button-ghost'}" data-action="open-coach-history" data-scope="project">当前项目</button>
    <button class="button ${scope === 'all' ? 'button-secondary' : 'button-ghost'}" data-action="open-coach-history" data-scope="all">我的全部记录</button><span>${data.total} 次运行</span></div>`;
  const pages = `<div class="coach-history-toolbar"><button class="button button-ghost" data-action="open-coach-history" data-offset="${offset - 50}" ${offset === 0 ? 'disabled' : ''}>上一页</button>
    <button class="button button-ghost" data-action="open-coach-history" data-offset="${offset + 50}" ${offset + 50 >= data.total ? 'disabled' : ''}>下一页</button></div>`;
  return `${filters}<div class="coach-history-list">${data.runs.map(historyRow).join('') || '<p class="empty-state">暂无已完成的教练运行记录</p>'}</div>${data.total > 50 ? pages : ''}`;
}

export async function openCoachHistory(trigger) {
  const serial = ++requestSerial;
  scope = trigger?.dataset?.scope || (trigger?.dataset?.offset ? scope : 'project');
  offset = Math.max(0, Number(trigger?.dataset?.offset || 0));
  const params = new URLSearchParams({ offset });
  if (scope === 'project') params.set('projectId', store.getProject().id);
  dialogs.modal('教练历史运行记录', '<p data-coach-history-loading>正在加载历史记录…</p>');
  try {
    const data = await apiRequest(`/api/prompt-coach/history?${params}`);
    if (serial !== requestSerial || !document.querySelector('[data-coach-history-loading]')) return;
    dialogs.modal('教练历史运行记录', listBody(data));
  } catch (error) {
    if (document.querySelector('[data-coach-history-loading]')) {
      dialogs.modal('教练历史运行记录', `<p>${escapeHtml(error.message)}</p>`);
    }
  }
}

export async function viewCoachHistory(trigger) {
  const serial = ++requestSerial;
  dialogs.modal('教练运行详情', '<p data-coach-history-loading>正在加载运行详情…</p>');
  try {
    const run = await apiRequest(`/api/prompt-coach/history/${encodeURIComponent(trigger.dataset.runId)}`);
    if (serial !== requestSerial || !document.querySelector('[data-coach-history-loading]')) return;
    detail = run;
    const project = { ...store.getProject(), promptCoachResult: detail.result };
    const versionLabel = detail.coachPromptVersion ? `v${detail.coachPromptVersion.version} · ${detail.coachPromptVersion.title}` : '系统默认';
    const prompt = detail.coachPrompt ? `<details><summary>本次教练 Prompt · ${escapeHtml(versionLabel)}</summary><pre class="coach-history-prompt">${escapeHtml(detail.coachPrompt)}</pre></details>` : '';
    dialogs.modal('教练运行详情', `<p>${escapeHtml(formatTime(detail.createdAt))}</p>${prompt}${renderMentorPanel(project, { history: true })}`,
      `<button class="button button-ghost" data-action="open-coach-history" data-scope="${scope}" data-offset="${offset}">返回记录</button>
      <button class="button button-secondary" data-action="download-coach-history">导出运行 JSON</button>`);
  } catch (error) { showToast(`历史记录读取失败：${error.message}`); }
}

export function downloadCoachHistory() {
  if (!detail) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: `prompt-coach-${detail.id}.json` }).click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
