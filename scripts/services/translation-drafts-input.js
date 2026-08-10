/**
 * 职责: 监听普通译文编辑并即时写入本地草稿缓存
 * 依赖内部: ../state/store.js, ./translation-drafts.js
 * 依赖外部: DOM API
 * 暴露: 页面级草稿监听副作用
 */

import { store } from '../state/store.js';
import { saveTranslationDraft } from './translation-drafts.js';

const STATUS_LABELS = {
  empty: '待生成', translated: '待确认', 'ai-edited': 'AI已编辑',
  edited: '已编辑', reviewed: '已确认', submitted: '已提交教师',
};

function statusIcon(status) {
  if (status === 'submitted') return '⇧';
  if (status === 'reviewed') return '✓';
  if (status === 'edited') return '✎';
  if (status === 'ai-edited') return '✦';
  if (status === 'translated') return 'AI';
  return '–';
}

function updateVisibleStatus(segment, dirty) {
  const row = [...document.querySelectorAll('[data-segment-row]')]
    .find((item) => item.dataset.segmentRow === segment.id);
  const icon = row?.querySelector('.status-icon');
  const label = row?.querySelector('.status-label');
  if (icon) {
    const status = dirty ? 'draft' : segment.status;
    icon.className = `status-icon ${status}`;
    icon.textContent = dirty ? '…' : statusIcon(status);
  }
  if (label) label.textContent = dirty ? '待保存' : (STATUS_LABELS[segment.status] || '待处理');
  const nav = [...document.querySelectorAll('.segment-nav-item')]
    .find((item) => item.dataset.segmentId === segment.id);
  const dot = nav?.querySelector('.status-dot');
  if (dot) dot.className = `status-dot ${dirty ? 'draft' : segment.status}`;
}

function cacheEditorDraft(event) {
  const editor = event.target.closest('[data-segment-editor]:not([data-ai-post-edit-draft])');
  if (!editor) return;
  const project = store.getProject();
  const segment = store.getSegment(editor.dataset.segmentEditor);
  const translation = store.getCurrentTranslation(segment);
  if (project && segment && translation) {
    saveTranslationDraft(project.id, segment.id, translation.id, editor.value);
    const saved = translation.postEditText || translation.aiText || '';
    updateVisibleStatus(segment, editor.value !== saved);
  }
}

document.addEventListener('input', cacheEditorDraft);
