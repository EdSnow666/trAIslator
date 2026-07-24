/**
 * 职责: 渲染法律句法着色、结构骨架、修饰关系、中文讲解与 JSON
 * 依赖内部: tokenizer.js
 * 依赖外部: DOM API
 * 暴露: renderAnalysis | renderInputOverlay | applyColorState | selectStructure
 */

import { textFromTokenRange, tokenIndex } from './tokenizer.js';

const LEGEND_ITEMS = [
  ['main', '主句'],
  ['condition', '条件／从句'],
  ['modifier', '修饰语'],
  ['limit', '介词／范围'],
  ['proviso', '否定／例外／但书'],
  ['neutral', '连接／情态'],
];

export function renderAnalysis(analysis) {
  const tokenMeta = buildTokenMetadata(analysis);
  renderLegend();
  renderAnalysedSentence(analysis, tokenMeta);
  renderClauseSpine(analysis);
  renderModifierTree(analysis);
  renderTranslation(analysis);
  document.querySelector('#json-output').textContent = JSON.stringify(analysis, null, 2);
  selectStructure(analysis, analysis.clauses[0]?.id);
}

export function renderInputOverlay(analysis, text) {
  const highlight = document.querySelector('#source-highlight');
  if (!analysis || analysis.source.text !== text) {
    highlight.textContent = text;
    return false;
  }
  const tokenMeta = buildTokenMetadata(analysis);
  highlight.innerHTML = renderTokenStream(analysis, tokenMeta);
  return true;
}

export function applyColorState(colorState, hasAnalysis) {
  const targets = [document.querySelector('#source-highlight'), document.querySelector('#analysed-sentence')];
  targets.forEach((target) => toggleColorClasses(target, colorState));
  const colored = hasAnalysis && (colorState.keywords || colorState.structure);
  document.querySelector('#source-editor').classList.toggle('is-colored', colored);
  updateColorButton('#toggle-keywords', colorState.keywords);
  updateColorButton('#toggle-structure', colorState.structure);
}

function toggleColorClasses(target, colorState) {
  target.classList.toggle('keyword-on', colorState.keywords);
  target.classList.toggle('structure-on', colorState.structure);
}

function updateColorButton(selector, active) {
  const button = document.querySelector(selector);
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', String(active));
}

function renderLegend() {
  document.querySelector('#legend').innerHTML = LEGEND_ITEMS
    .map(([role, label]) => legendItem(role, label))
    .join('');
}

function legendItem(role, label) {
  return `<span class="legend-item role-${role}"><i class="legend-swatch" aria-hidden="true"></i>${label}</span>`;
}

function renderAnalysedSentence(analysis, tokenMeta) {
  const sentence = document.querySelector('#analysed-sentence');
  sentence.innerHTML = renderTokenStream(analysis, tokenMeta);
  sentence.setAttribute('aria-label', `英文原文：${analysis.source.text}`);
}

function renderTokenStream(analysis, tokenMeta) {
  const { text, tokens } = analysis.source;
  const runs = buildRuns(tokens, tokenMeta, structureKey);
  let cursor = 0;
  const html = runs.map((run) => {
    const first = run.tokens[0];
    const last = run.tokens.at(-1);
    const gap = escapeHtml(text.slice(cursor, first.start));
    cursor = last.end;
    return gap + renderStructureRun(text, run, tokenMeta);
  }).join('');
  return html + escapeHtml(text.slice(cursor));
}

function buildRuns(tokens, metadata, getKey) {
  return tokens.reduce((runs, token) => {
    const key = getKey(metadata.get(token.id));
    const previous = runs.at(-1);
    if (previous?.key === key) previous.tokens.push(token);
    else runs.push({ key, tokens: [token] });
    return runs;
  }, []);
}

function structureKey(meta) {
  return `${meta.structureRole}|${meta.structureIds?.[0] || ''}`;
}

function markerKey(meta) {
  return `${meta.markerRole}|${meta.markerIds?.[0] || ''}`;
}

function renderStructureRun(text, run, tokenMeta) {
  const meta = tokenMeta.get(run.tokens[0].id);
  const roleClass = meta.structureRole ? `role-${normalizeRole(meta.structureRole)}` : '';
  const structureClass = meta.structureRole ? 'has-structure' : '';
  const ids = meta.structureIds || [];
  const content = renderMarkerContent(text, run.tokens, tokenMeta);
  return `<span class="syntax-group ${structureClass} ${roleClass}" data-select-id="${ids[0] || ''}" data-structure-ids="${ids.join(' ')}">${content}</span>`;
}

function renderMarkerContent(text, tokens, tokenMeta) {
  const runs = buildRuns(tokens, tokenMeta, markerKey);
  let cursor = tokens[0].start;
  const html = runs.map((run) => {
    const first = run.tokens[0];
    const last = run.tokens.at(-1);
    const gap = escapeHtml(text.slice(cursor, first.start));
    cursor = last.end;
    return gap + renderMarkerRun(text, run, tokenMeta);
  }).join('');
  return html + escapeHtml(text.slice(cursor, tokens.at(-1).end));
}

function renderMarkerRun(text, run, tokenMeta) {
  const first = run.tokens[0];
  const last = run.tokens.at(-1);
  const meta = tokenMeta.get(first.id);
  const value = escapeHtml(text.slice(first.start, last.end));
  const markerId = meta.markerIds?.[0];
  if (!markerId) return value;
  const role = normalizeRole(meta.markerRole);
  return `<span class="syntax-marker has-marker role-${role}" data-select-id="${markerId}" data-structure-ids="${markerId}">${value}</span>`;
}

function buildTokenMetadata(analysis) {
  const metadata = new Map(analysis.source.tokens.map((token) => [token.id, emptyTokenMeta()]));
  analysis.clauses.forEach((item) => assignStructure(metadata, analysis, item, false));
  analysis.spans.forEach((item) => assignStructure(metadata, analysis, item, true));
  analysis.markers.forEach((item) => assignMarker(metadata, analysis, item));
  return metadata;
}

function emptyTokenMeta() {
  return { structureRole: '', structureIds: [], markerRole: '', markerIds: [] };
}

function assignStructure(metadata, analysis, item, override) {
  rangeTokens(analysis, item).forEach((token) => {
    const meta = metadata.get(token.id);
    if (override || !meta.structureRole) meta.structureRole = item.role;
    meta.structureIds.unshift(item.id);
  });
}

function assignMarker(metadata, analysis, item) {
  rangeTokens(analysis, item).forEach((token) => {
    const meta = metadata.get(token.id);
    meta.markerRole = item.role;
    meta.markerIds.unshift(item.id);
  });
}

function rangeTokens(analysis, item) {
  const tokens = analysis.source.tokens;
  const start = tokenIndex(tokens, item.token_start);
  const end = tokenIndex(tokens, item.token_end);
  return tokens.slice(start, end + 1);
}

function renderClauseSpine(analysis) {
  document.querySelector('#clause-spine').innerHTML = analysis.clauses
    .map((clause) => clauseCard(analysis, clause))
    .join('');
}

function clauseCard(analysis, clause) {
  const text = getItemText(analysis, clause);
  return `<article class="clause-card role-${normalizeRole(clause.role)}" data-select-id="${clause.id}">
    <span class="clause-type">${escapeHtml(clause.label_zh)}</span>
    <div class="clause-text">${escapeHtml(text)}</div>
  </article>`;
}

function renderModifierTree(analysis) {
  const tree = document.querySelector('#modifier-tree');
  tree.innerHTML = analysis.spans.length
    ? analysis.spans.map((span) => modifierRow(analysis, span)).join('')
    : '<p class="detail-empty">本句没有需要单独展开的重要修饰结构。</p>';
}

function modifierRow(analysis, span) {
  const text = getItemText(analysis, span);
  return `<div class="modifier-row">
    <span class="modifier-branch" aria-hidden="true"></span>
    <article class="modifier-card role-${normalizeRole(span.role)}" data-select-id="${span.id}">
      <strong>${escapeHtml(span.label_zh)}</strong>
      <span>${escapeHtml(text)}</span>
    </article>
  </div>`;
}

function renderTranslation(analysis) {
  const segments = analysis.translation.segments;
  document.querySelector('#translation-view').innerHTML = segments
    .map((segment) => translationSegment(segment))
    .join('');
}

function translationSegment(segment) {
  const ids = segment.source_ids.join(' ');
  return `<span class="translation-segment" data-translation-ids="${ids}" data-select-id="${segment.source_ids[0]}">${escapeHtml(segment.text_zh)}</span>`;
}

export function selectStructure(analysis, id) {
  const item = findItem(analysis, id);
  if (!item) return;
  clearSelection();
  markMatchingElements(id);
  renderSelectedDetail(analysis, item);
}

function clearSelection() {
  document.querySelectorAll('.is-selected').forEach((element) => element.classList.remove('is-selected'));
}

function markMatchingElements(id) {
  document.querySelectorAll(`[data-select-id="${cssEscape(id)}"]`).forEach(markSelected);
  document.querySelectorAll('[data-structure-ids]').forEach((element) => {
    if (element.dataset.structureIds.split(' ').includes(id)) markSelected(element);
  });
  document.querySelectorAll('[data-translation-ids]').forEach((element) => {
    if (element.dataset.translationIds.split(' ').includes(id)) markSelected(element);
  });
}

function markSelected(element) {
  element.classList.add('is-selected');
}

function renderSelectedDetail(analysis, item) {
  const detail = document.querySelector('#selected-detail');
  const explanation = item.function_zh || item.explanation_zh || '暂无解释。';
  const relationText = getRelationText(analysis, item.id);
  detail.innerHTML = `<div class="role-${normalizeRole(item.role)}">
    <span class="detail-role">${escapeHtml(item.label_zh || item.category || item.role)}</span>
    <blockquote class="detail-quote">${escapeHtml(getItemText(analysis, item))}</blockquote>
    <p class="detail-explanation">${escapeHtml(explanation)}</p>
    ${relationText ? `<p class="detail-relation"><strong>结构关系：</strong>${escapeHtml(relationText)}</p>` : ''}
  </div>`;
}

function getRelationText(analysis, id) {
  return analysis.relations
    .filter((relation) => relation.from_id === id || relation.to_id === id)
    .map((relation) => relation.label_zh)
    .join('；');
}

function findItem(analysis, id) {
  return [...analysis.clauses, ...analysis.spans, ...analysis.markers]
    .find((item) => item.id === id);
}

function getItemText(analysis, item) {
  return textFromTokenRange(
    analysis.source.text,
    analysis.source.tokens,
    item.token_start,
    item.token_end,
  );
}

function normalizeRole(role) {
  if (role === 'co_condition') return 'co-condition';
  if (role === 'extent') return 'extent';
  if (role === 'exception') return 'exception';
  return role || 'neutral';
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
