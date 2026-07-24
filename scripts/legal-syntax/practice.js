/**
 * 职责: 管理语序重组和修饰语结构归位两类拖拽练习
 * 依赖内部: tokenizer.js
 * 依赖外部: HTML Drag and Drop API
 * 暴露: setupPractice | loadPractice | shuffleSequence | showSequenceAnswer | resetNesting
 */

import { textFromTokenRange, tokenIndex } from './tokenizer.js';

let currentAnalysis = null;
let sequenceOrder = [];
let placements = new Map();
let dragged = null;

export function setupPractice() {
  const sequenceLane = document.querySelector('#sequence-lane');
  const modifierBank = document.querySelector('#modifier-bank');
  const nestingTargets = document.querySelector('#nesting-targets');
  [sequenceLane, modifierBank, nestingTargets].forEach(bindDragContainer);
}

function bindDragContainer(container) {
  container.addEventListener('dragstart', handleDragStart);
  container.addEventListener('dragend', handleDragEnd);
  container.addEventListener('dragover', handleDragOver);
  container.addEventListener('drop', handleDrop);
}

export function loadPractice(analysis) {
  currentAnalysis = analysis;
  placements = new Map();
  shuffleSequence();
  renderNesting();
}

export function shuffleSequence() {
  if (!currentAnalysis) return;
  const correct = sortedClauses(currentAnalysis).map((clause) => clause.id);
  sequenceOrder = createDeterministicShuffle(correct);
  renderSequence();
}

function createDeterministicShuffle(correct) {
  if (correct.length < 3) return [...correct].reverse();
  return [...correct.slice(2), correct[0], correct[1]];
}

export function showSequenceAnswer() {
  if (!currentAnalysis) return;
  sequenceOrder = sortedClauses(currentAnalysis).map((clause) => clause.id);
  renderSequence();
}

export function resetNesting() {
  placements = new Map();
  renderNesting();
}

function sortedClauses(analysis) {
  return [...analysis.clauses].sort((left, right) => {
    return tokenIndex(analysis.source.tokens, left.token_start)
      - tokenIndex(analysis.source.tokens, right.token_start);
  });
}

function renderSequence() {
  const clauseMap = new Map(currentAnalysis.clauses.map((clause) => [clause.id, clause]));
  document.querySelector('#sequence-lane').innerHTML = sequenceOrder
    .map((id) => sequenceUnit(clauseMap.get(id)))
    .join('');
  updateSequenceFeedback();
}

function sequenceUnit(clause) {
  const text = itemText(clause);
  return `<div class="draggable-unit role-${normalizeRole(clause.role)}" draggable="true"
    data-drag-type="sequence" data-unit-id="${clause.id}">${escapeHtml(shorten(text, 84))}</div>`;
}

function updateSequenceFeedback() {
  const correct = sortedClauses(currentAnalysis).map((clause) => clause.id);
  const count = sequenceOrder.filter((id, index) => id === correct[index]).length;
  const feedback = document.querySelector('#sequence-feedback');
  feedback.classList.toggle('is-correct', count === correct.length);
  feedback.innerHTML = `<span>${sequenceMessage(count, correct.length)}</span><strong>${count} / ${correct.length}</strong>`;
}

function sequenceMessage(count, total) {
  return count === total
    ? '顺序正确：你恢复了完整的法律逻辑。'
    : '观察条件词、结果主句、转折词和范围标记。';
}

function renderNesting() {
  renderModifierBank();
  renderNestingTargets();
  updateNestingFeedback();
}

function renderModifierBank() {
  const unplaced = currentAnalysis.spans.filter((span) => !placements.has(span.id));
  const bank = document.querySelector('#modifier-bank');
  bank.innerHTML = unplaced.length
    ? unplaced.map((span) => modifierUnit(span)).join('')
    : '<span class="detail-empty">所有修饰语都已放入结构中。</span>';
}

function modifierUnit(span) {
  return `<div class="draggable-unit role-${normalizeRole(span.role)}" draggable="true"
    data-drag-type="nesting" data-unit-id="${span.id}">${escapeHtml(shorten(itemText(span), 76))}</div>`;
}

function renderNestingTargets() {
  document.querySelector('#nesting-targets').innerHTML = currentAnalysis.clauses
    .map((clause) => nestingTarget(clause))
    .join('');
}

function nestingTarget(clause) {
  const children = currentAnalysis.spans.filter((span) => placements.get(span.id) === clause.id);
  return `<section class="nesting-target role-${normalizeRole(clause.role)}">
    <div class="nesting-host">
      <strong>${escapeHtml(clause.label_zh)}</strong>
      <span>${escapeHtml(shorten(itemText(clause), 90))}</span>
    </div>
    <div class="nesting-dropzone" data-nesting-target="${clause.id}">
      ${children.map((span) => modifierUnit(span)).join('')}
    </div>
  </section>`;
}

function updateNestingFeedback() {
  const correct = currentAnalysis.spans.filter((span) => placements.get(span.id) === span.parent_id).length;
  const total = currentAnalysis.spans.length;
  const feedback = document.querySelector('#nesting-feedback');
  feedback.classList.toggle('is-correct', correct === total && total > 0);
  feedback.innerHTML = `<span>${nestingMessage(correct, total)}</span><strong>${correct} / ${total}</strong>`;
}

function nestingMessage(correct, total) {
  if (!total) return '本句没有可练习的修饰结构。';
  return correct === total
    ? '全部归位正确：修饰范围已经恢复。'
    : '错误归位会保留，便于比较修饰范围。';
}

function handleDragStart(event) {
  const unit = event.target.closest('[data-drag-type]');
  if (!unit) return;
  dragged = { type: unit.dataset.dragType, id: unit.dataset.unitId };
  unit.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', dragged.id);
}

function handleDragEnd(event) {
  event.target.closest('[data-drag-type]')?.classList.remove('is-dragging');
  dragged = null;
}

function handleDragOver(event) {
  if (isValidDrop(event.target)) event.preventDefault();
}

function isValidDrop(target) {
  if (!dragged) return false;
  if (dragged.type === 'sequence') return Boolean(target.closest('#sequence-lane'));
  return Boolean(target.closest('[data-nesting-target], #modifier-bank'));
}

function handleDrop(event) {
  if (!isValidDrop(event.target)) return;
  event.preventDefault();
  if (dragged.type === 'sequence') dropSequence(event.target);
  if (dragged.type === 'nesting') dropNesting(event.target);
}

function dropSequence(target) {
  const targetUnit = target.closest('[data-unit-id]');
  if (targetUnit?.dataset.unitId === dragged.id) return;
  const fromIndex = sequenceOrder.indexOf(dragged.id);
  const targetIndex = targetUnit ? sequenceOrder.indexOf(targetUnit.dataset.unitId) : sequenceOrder.length;
  sequenceOrder.splice(fromIndex, 1);
  const insertIndex = targetUnit && fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
  sequenceOrder.splice(insertIndex, 0, dragged.id);
  renderSequence();
}

function dropNesting(target) {
  const dropzone = target.closest('[data-nesting-target]');
  if (dropzone) placements.set(dragged.id, dropzone.dataset.nestingTarget);
  else placements.delete(dragged.id);
  renderNesting();
}

function itemText(item) {
  return textFromTokenRange(
    currentAnalysis.source.text,
    currentAnalysis.source.tokens,
    item.token_start,
    item.token_end,
  );
}

function shorten(text, limit) {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function normalizeRole(role) {
  return role === 'co_condition' ? 'co-condition' : role;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
