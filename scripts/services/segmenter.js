/**
 * 职责: 按段落切分英中教学文本并创建导入项目
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: segmentParagraphs | segmentText | buildImportedProject
 */

function joinParagraphLines(lines) {
  return lines.reduce((result, line) => {
    const clean = line.trim();
    if (!clean) return result;
    if (!result) return clean;
    if (result.endsWith('-')) return result.slice(0, -1) + clean;
    if (/\p{Script=Han}$/u.test(result) && /^\p{Script=Han}/u.test(clean)) return result + clean;
    return result + ' ' + clean;
  }, '');
}

export function segmentParagraphs(text) {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n[ \t]*\n+/);
  if (blocks.length > 1) {
    return blocks.map((block) => joinParagraphLines(block.split('\n'))).filter(Boolean);
  }
  return normalized.split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

export const segmentText = segmentParagraphs;

export function buildImportedProject(name, direction, text) {
  const timestamp = Date.now();
  const segments = segmentParagraphs(text).map((source, index) => ({
    id: `import-${timestamp}-${index + 1}`,
    source,
    status: 'empty',
    currentTranslationId: null,
    translations: [],
  }));
  return createImportedProject(name, direction, timestamp, segments);
}

function createImportedProject(name, direction, timestamp, segments) {
  const promptId = `p-import-${timestamp}-1`;
  return {
    id: `project-${timestamp}`,
    name: name || '新建翻译教学项目',
    direction,
    sourceLang: direction === 'EN → ZH' ? 'English' : '简体中文',
    targetLang: direction === 'EN → ZH' ? '简体中文' : 'English',
    activePromptId: promptId,
    brief: defaultBrief(direction),
    prompts: [defaultPrompt(promptId, direction)],
    segments,
    terms: [],
    tm: [],
    isLocal: true,
    classTags: [],
    canManage: true,
  };
}

function defaultBrief(direction) {
  return {
    genre: '待识别',
    skopos: '课堂翻译与译后编辑练习',
    audience: direction === 'EN → ZH' ? '中文读者' : 'English-language readers',
    register: '待师生确认',
    strategy: '先准确传递信息，再根据课堂讨论调整',
  };
}

function defaultPrompt(id, direction) {
  return {
    id,
    version: 1,
    title: '初始课堂 Prompt',
    author: '林老师',
    role: '教师',
    status: 'published',
    createdAt: new Date().toLocaleString('zh-CN'),
    note: '导入文档时生成的初始版本。',
    content: `完成${direction}翻译。准确传递信息，保持术语一致，不增添原文没有的事实。`,
  };
}
