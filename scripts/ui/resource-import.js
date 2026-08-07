/**
 * 职责: 解析交错式原文/译文段落并上传术语、翻译记忆或参考译文
 * 依赖内部: ../state/store.js, ../services/document-import.js, ../services/segmenter.js, ../services/server-data.js, ./dialogs.js
 * 依赖外部: DOM API
 * 暴露: openPairImport | submitPairImport
 */

import { store } from '../state/store.js';
import { extractImportFile } from '../services/document-import.js';
import { segmentParagraphs } from '../services/segmenter.js';
import { importServerResourcePairs, refreshServerProject } from '../services/server-data.js';
import { dialogs, showToast } from './dialogs.js';

export function openPairImport(trigger) {
  if (!store.getState().serverMode) return showToast('资源批量导入仅在服务器项目中可用。');
  if (!store.getProject().canManage) return showToast('只有项目管理员可以批量导入资源。');
  dialogs.openPairImportModal(trigger);
}

async function importText() {
  const file = document.querySelector('#pair-import-file')?.files?.[0];
  const pasted = document.querySelector('#pair-import-text')?.value.trim();
  if (file) return extractImportFile(file);
  if (pasted) return pasted;
  throw new Error('请选择文件或粘贴交错文本。');
}

function alternatingPairs(text) {
  const paragraphs = segmentParagraphs(text);
  if (paragraphs.length % 2) throw new Error('段落数必须为偶数：奇数段原文，偶数段译文。');
  const pairs = [];
  for (let index = 0; index < paragraphs.length; index += 2) {
    pairs.push({ source: paragraphs[index], target: paragraphs[index + 1] });
  }
  return pairs;
}

export async function submitPairImport(trigger) {
  trigger.disabled = true;
  try {
    const project = store.getProject();
    const kind = document.querySelector('#pair-import-kind')?.value;
    const pairs = alternatingPairs(await importText());
    await importServerResourcePairs(project.id, kind, pairs);
    store.replaceServerProject(await refreshServerProject(project));
    dialogs.closeModal();
    showToast(`已按交错段落导入 ${pairs.length} 对内容。`);
  } catch (error) { showToast(`导入失败：${error.message}`); }
  finally { trigger.disabled = false; }
}
