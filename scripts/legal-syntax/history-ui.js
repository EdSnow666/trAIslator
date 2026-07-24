/**
 * 职责: 渲染带一致性状态的历史记录并管理全选和导出选择状态
 * 依赖内部: 无
 * 依赖外部: DOM API, Intl.DateTimeFormat
 * 暴露: renderHistoryList | selectedHistoryIds | setAllHistorySelected | updateHistorySelection
 */

const QUALITY_LABELS = {
  verified: '已验证',
  legacy: '旧版待复核',
  invalid: '疑似错配，需重新分析',
};

export function renderHistoryList(records) {
  const container = document.querySelector('#history-list');
  container.innerHTML = records.length
    ? records.map(historyItem).join('')
    : '<p class="history-empty">还没有成功的 AI 分析记录。</p>';
  document.querySelector('#history-select-all').checked = false;
  updateHistorySelection();
}

function historyItem(record) {
  const counts = record.analysis;
  const quality = record.quality?.status || 'legacy';
  const invalid = quality === 'invalid';
  const disabled = invalid ? ' disabled' : '';
  const itemClass = invalid ? ' history-item-invalid' : '';
  return `<article class="history-item${itemClass}">
    <label class="history-check">
      <input type="checkbox" data-history-select="${escapeHtml(record.id)}"${disabled}>
      <span class="sr-only">选择这条分析记录</span>
    </label>
    <div class="history-content">
      <div class="history-meta">
        <time datetime="${escapeHtml(record.createdAt)}">${formatDate(record.createdAt)}</time>
        <span>${escapeHtml(record.model || 'AI')}</span>
        ${qualityBadge(quality)}
        <span>${counts.clauses.length} 分句 · ${counts.spans.length} 修饰 · ${counts.markers.length} 特征词</span>
      </div>
      <p>${escapeHtml(record.source)}</p>
    </div>
    <button class="button button-ghost history-open" type="button" data-history-open="${escapeHtml(record.id)}">查看</button>
  </article>`;
}

function qualityBadge(status) {
  const label = QUALITY_LABELS[status] || QUALITY_LABELS.legacy;
  return `<span class="history-quality is-${status}">${label}</span>`;
}

export function selectedHistoryIds() {
  return [...document.querySelectorAll('[data-history-select]:checked:not(:disabled)')]
    .map((checkbox) => checkbox.dataset.historySelect);
}

export function setAllHistorySelected(checked) {
  document.querySelectorAll('[data-history-select]:not(:disabled)').forEach((checkbox) => {
    checkbox.checked = checked;
  });
  updateHistorySelection();
}

export function updateHistorySelection() {
  const all = [...document.querySelectorAll('[data-history-select]:not(:disabled)')];
  const selected = all.filter((checkbox) => checkbox.checked);
  const selectAll = document.querySelector('#history-select-all');
  selectAll.checked = all.length > 0 && selected.length === all.length;
  selectAll.indeterminate = selected.length > 0 && selected.length < all.length;
  document.querySelector('#history-selected-count').textContent = `已选择 ${selected.length} 条`;
  document.querySelector('#export-history-button').disabled = selected.length === 0;
}

export function updateHistoryCount(count) {
  document.querySelector('#history-count').textContent = String(count);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}