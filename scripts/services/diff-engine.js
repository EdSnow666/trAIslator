/**
 * 职责: 生成适合英中双语译后编辑展示的简化增删 Diff
 * 依赖内部: 无
 * 依赖外部: Intl.Segmenter
 * 暴露: buildDiff
 */

function tokenize(text, language) {
  if (!text) return [];
  try {
    const segmenter = new Intl.Segmenter(language, { granularity: 'word' });
    return [...segmenter.segment(text)].map((item) => item.segment);
  } catch {
    return [...text];
  }
}

function buildMatrix(original, modified) {
  const matrix = Array.from({ length: original.length + 1 }, () => Array(modified.length + 1).fill(0));
  for (let i = 1; i <= original.length; i += 1) {
    for (let j = 1; j <= modified.length; j += 1) {
      matrix[i][j] = original[i - 1] === modified[j - 1]
        ? matrix[i - 1][j - 1] + 1
        : Math.max(matrix[i - 1][j], matrix[i][j - 1]);
    }
  }
  return matrix;
}

function traceDiff(original, modified, matrix) {
  const parts = [];
  let i = original.length;
  let j = modified.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && original[i - 1] === modified[j - 1]) {
      parts.unshift({ type: 'same', value: original[i - 1] }); i -= 1; j -= 1;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      parts.unshift({ type: 'added', value: modified[j - 1] }); j -= 1;
    } else {
      parts.unshift({ type: 'removed', value: original[i - 1] }); i -= 1;
    }
  }
  return mergeParts(parts);
}

function mergeParts(parts) {
  return parts.reduce((result, part) => {
    const last = result.at(-1);
    if (last?.type === part.type) last.value += part.value;
    else result.push({ ...part });
    return result;
  }, []);
}

export function buildDiff(original, modified, language = 'zh') {
  const before = tokenize(original, language);
  const after = tokenize(modified, language);
  return traceDiff(before, after, buildMatrix(before, after));
}
