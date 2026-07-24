/**
 * 职责: 对英中教学文本进行轻量规则分句并创建新项目句段
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: segmentText | buildImportedProject
 */

const EN_ABBREVIATIONS = ['Mr.', 'Mrs.', 'Dr.', 'Prof.', 'e.g.', 'i.e.', 'No.'];

function protectAbbreviations(text) {
  return EN_ABBREVIATIONS.reduce(
    (result, item) => result.replaceAll(item, item.replaceAll('.', '<DOT>')),
    text,
  );
}

export function segmentText(text, direction) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const protectedText = direction === 'EN → ZH' ? protectAbbreviations(normalized) : normalized;
  const pattern = direction === 'EN → ZH' ? /(?<=[.!?])\s+|\n+/ : /(?<=[。！？；])|\n+/;
  return protectedText.split(pattern)
    .map((item) => item.replaceAll('<DOT>', '.').trim())
    .filter(Boolean);
}

export function buildImportedProject(name, direction, text) {
  const timestamp = Date.now();
  const segments = segmentText(text, direction).map((source, index) => ({
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
