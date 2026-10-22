/**
 * 职责: 独立展示不可变译文和编辑版本，生成版本标识及双向关联
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: visibleTranslationVersions | translationSequenceNumber | translationRootCount | translationVersionLabel | linkedTranslationVersions
 */

export function visibleTranslationVersions(segment) {
  return [...segment.translations];
}

function rootId(item, translations) {
  if (item.serverRootVersionId || item.serverBaseVersionId) return item.serverRootVersionId || item.serverBaseVersionId;
  const seen = new Set();
  let current = item;
  while (isEditVersion(current) && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = translations.find((candidate) => candidate.id === (current.serverComparisonVersionId || current.serverParentVersionId));
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

function isEditVersion(item) {
  return ['ai_post_edit', 'human_post_edit'].includes(item.serverVersionKind);
}

export function translationSequenceNumber(item, translations) {
  if (!item) return 0;
  const roots = translations.filter((candidate) => !isEditVersion(candidate));
  const root = rootId(item, translations);
  const rootIndex = roots.findIndex((candidate) => candidate.id === root);
  const ownIndex = roots.indexOf(item);
  return (rootIndex >= 0 ? rootIndex : Math.max(ownIndex, 0)) + 1;
}

export function translationRootCount(translations) {
  return translations.filter((item) => !isEditVersion(item)).length;
}

export function translationVersionLabel(item, translations) {
  const base = `T${translationSequenceNumber(item, translations)}`;
  if (!isEditVersion(item)) return base;
  const siblings = translations.filter((other) => other.serverVersionKind === item.serverVersionKind
    && rootId(other, translations) === rootId(item, translations));
  const number = siblings.findIndex((other) => other.id === item.id) + 1;
  return item.serverVersionKind === 'human_post_edit' ? `${base}-H${number}`
    : `${base}-AI${siblings.length > 1 ? number : ''}`;
}

export function linkedTranslationVersions(segment, item) {
  const parentId = item.serverParentVersionId || item.serverComparisonVersionId || item.serverBaseVersionId;
  const parent = segment.translations.find((other) => other.id === parentId && other.id !== item.id);
  const children = segment.translations.filter((other) => other.id !== item.id
    && (other.serverParentVersionId || other.serverComparisonVersionId || other.serverBaseVersionId) === item.id);
  return [...(parent ? [{ item: parent, relation: '来源版本' }] : []),
    ...children.map((child) => ({ item: child, relation: '派生版本' }))];
}
