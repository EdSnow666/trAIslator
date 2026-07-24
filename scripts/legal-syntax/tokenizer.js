/**
 * 职责: 将英文法律句子转换为带稳定编号和字符位置的 token
 * 依赖内部: 无
 * 依赖外部: JavaScript Unicode 正则
 * 暴露: tokenizeSource | resolveQuoteRange | textFromTokenRange | formatTokensForPrompt
 */

const TOKEN_PATTERN = /\p{L}+(?:['’]\p{L}+)*|\p{N}+(?:[.,]\p{N}+)*|[^\s]/gu;

export function tokenizeSource(text) {
  return [...text.matchAll(TOKEN_PATTERN)].map((match, index) => ({
    id: `t${String(index + 1).padStart(3, '0')}`,
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function resolveQuoteRange(source, tokens, quote, occurrence = 0) {
  const start = findOccurrence(source, quote, occurrence);
  if (start < 0) throw new Error(`种子数据片段未在原文中找到：${quote}`);
  const end = start + quote.length;
  const covered = tokens.filter((token) => token.start >= start && token.end <= end);
  if (!covered.length) throw new Error(`种子数据片段没有覆盖 token：${quote}`);
  return { token_start: covered[0].id, token_end: covered.at(-1).id };
}

function findOccurrence(source, quote, occurrence) {
  let fromIndex = 0;
  let foundIndex = -1;
  for (let index = 0; index <= occurrence; index += 1) {
    foundIndex = source.indexOf(quote, fromIndex);
    if (foundIndex < 0) return -1;
    fromIndex = foundIndex + quote.length;
  }
  return foundIndex;
}

export function textFromTokenRange(source, tokens, startId, endId) {
  const startToken = tokens.find((token) => token.id === startId);
  const endToken = tokens.find((token) => token.id === endId);
  if (!startToken || !endToken) return '';
  return source.slice(startToken.start, endToken.end);
}

export function formatTokensForPrompt(tokens) {
  return tokens.map((token) => `${token.id}=${JSON.stringify(token.text)}`).join(' ');
}

export function tokenIndex(tokens, tokenId) {
  return tokens.findIndex((token) => token.id === tokenId);
}
