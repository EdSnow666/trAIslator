/**
 * 职责: 查看与导出当前账号译文版本绑定的实际请求、原始响应和校验记录
 * 依赖内部: ../services/auth-client.js, ./dialogs.js, ./render.js
 * 依赖外部: DOM API, Blob API
 * 暴露: openAiRunAudit | downloadAiRunAudit
 */
import { apiRequest } from '../services/auth-client.js';
import { dialogs, showToast } from './dialogs.js';
import { escapeHtml } from './render.js';

let detail = null;
export async function openAiRunAudit(trigger) {
  try {
    detail = await apiRequest(`/api/ai/runs/${encodeURIComponent(trigger.dataset.runId)}/audit`);
    const labels = { request: '实际发送内容', response: '模型原始响应', validation: '段落校验结果', error: '运行错误' };
    const body = detail.events.map((event) => `<details><summary>${escapeHtml(labels[event.type] || event.type)} · ${escapeHtml(new Date(event.createdAt).toLocaleString())}</summary><pre class="coach-history-prompt">${escapeHtml(JSON.stringify(event.payload, null, 2))}</pre></details>`).join('');
    dialogs.modal('AI 译文运行审计', body || '<p>旧运行未保存完整请求和原始响应，无法补录。</p>',
      '<button class="button button-ghost" data-action="close-modal">关闭</button><button class="button button-secondary" data-action="download-ai-run-audit">导出运行 JSON</button>');
  } catch (error) { showToast(`运行审计读取失败：${error.message}`); }
}

export function downloadAiRunAudit() {
  if (!detail) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: `ai-run-${detail.run.id}.json` }).click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
