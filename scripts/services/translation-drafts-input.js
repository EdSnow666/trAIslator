/**
 * 职责: 监听普通译文编辑并即时写入本地草稿缓存
 * 依赖内部: ../state/store.js, ./translation-drafts.js
 * 依赖外部: DOM API
 * 暴露: 页面级草稿监听副作用
 */

import { store } from '../state/store.js';
import { saveTranslationDraft } from './translation-drafts.js';

function cacheEditorDraft(event) {
  const editor = event.target.closest('[data-segment-editor]:not([data-ai-post-edit-draft])');
  if (!editor) return;
  const project = store.getProject();
  const segment = store.getSegment(editor.dataset.segmentEditor);
  const translation = store.getCurrentTranslation(segment);
  if (project && segment && translation) {
    saveTranslationDraft(project.id, segment.id, translation.id, editor.value);
  }
}

document.addEventListener('input', cacheEditorDraft);
