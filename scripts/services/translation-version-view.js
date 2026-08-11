/**
 * 职责: 将不可变译文数据库版本折叠为适合前端展示的逻辑译文版本
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: visibleTranslationVersions | translationSequenceNumber | translationRootCount
 */

function comparisonId(item) {
  return item.serverComparisonVersionId || item.serverParentVersionId || item.serverBaseVersionId;
}

function preferredHumanVersions(segment) {
  const selected = new Map();
  segment.translations.forEach((item) => {
    if (item.serverVersionKind !== 'human_post_edit') return;
    const key = comparisonId(item);
    if (!key) return;
    const existing = selected.get(key);
    const isCurrent = item.id === segment.currentTranslationId;
    if (!existing || isCurrent || existing.id !== segment.currentTranslationId) selected.set(key, item);
  });
  return selected;
}

export function visibleTranslationVersions(segment) {
  const humans = preferredHumanVersions(segment);
  return segment.translations.filter((item) => {
    if (item.serverVersionKind === 'human_post_edit') return humans.get(comparisonId(item))?.id === item.id;
    return !humans.has(item.id);
  });
}

function isEditVersion(item) {
  return ['ai_post_edit', 'human_post_edit'].includes(item.serverVersionKind);
}

export function translationSequenceNumber(item, translations) {
  if (!item) return 0;
  const roots = translations.filter((candidate) => !isEditVersion(candidate));
  const rootId = item.serverRootVersionId || item.serverBaseVersionId || item.id;
  const rootIndex = roots.findIndex((candidate) => candidate.id === rootId);
  const ownIndex = roots.indexOf(item);
  return (rootIndex >= 0 ? rootIndex : Math.max(ownIndex, 0)) + 1;
}

export function translationRootCount(translations) {
  return translations.filter((item) => !isEditVersion(item)).length;
}
