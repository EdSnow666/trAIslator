/**
 * 职责: 提供可重置的英中、中英路演项目与多版本译文数据
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: DEMO_PROJECTS | createDemoProjects
 */

const enZhPrompts = [
  {
    id: 'p-en-1',
    version: 1,
    title: '准确忠实基线',
    author: '林老师',
    role: '教师',
    status: 'published',
    createdAt: '2026-07-18 09:30',
    note: '建立可复核的直译基线，优先保留信息结构。',
    content: '将英文博物馆导览文本翻译为简体中文。准确传递事实、年代与专名，不增删信息；保持原文句序，使用正式、清楚的书面语。',
  },
  {
    id: 'p-en-2',
    version: 2,
    title: '公众导览优化',
    author: '陈同学',
    role: '学生',
    status: 'published',
    createdAt: '2026-07-19 15:10',
    note: '降低长句负担，让中文观众更容易跟随展览叙事。',
    content: '面向中国普通博物馆观众翻译。事实与术语必须准确；允许调整语序、拆分长句，并使用自然、有引导感的现代中文。保留历史距离感，避免宣传腔和生硬欧化表达。',
  },
];

const enZhSegments = [
  {
    id: 'enzh-001',
    source: 'This gallery traces how ordinary objects carried extraordinary stories across the maritime routes of the nineteenth century.',
    status: 'reviewed',
    currentTranslationId: 'enzh-001-t2',
    translations: [
      translation('enzh-001-t1', 'p-en-1', enZhPrompts[0], '本展厅追溯普通物品如何沿着十九世纪的海上路线承载非凡故事。', '本展厅展示了十九世纪海上航路中的日常物件，以及它们所承载的不凡故事。', '陈同学'),
      translation('enzh-001-t2', 'p-en-2', enZhPrompts[1], '本展厅从一件件日常物品出发，讲述它们如何沿十九世纪的海上航路，带着不平凡的故事远行。', '', '模拟引擎'),
    ],
  },
  {
    id: 'enzh-002',
    source: 'The porcelain bowl before you was made in Jingdezhen, shipped through Canton, and purchased in Liverpool in 1847.',
    status: 'edited',
    currentTranslationId: 'enzh-002-t2',
    translations: [
      translation('enzh-002-t1', 'p-en-1', enZhPrompts[0], '您面前的瓷碗产于景德镇，经广州装运，并于1847年在利物浦被购买。', '', '模拟引擎'),
      translation('enzh-002-t2', 'p-en-2', enZhPrompts[1], '眼前这只瓷碗烧制于景德镇，经广州装船远运，1847年最终在利物浦售出。', '眼前这只瓷碗烧制于景德镇，经广州装船，最终于1847年在利物浦售出。', '王同学'),
    ],
  },
  {
    id: 'enzh-003',
    source: 'Its journey was not exceptional; thousands of similar objects moved through the same commercial networks.',
    status: 'translated',
    currentTranslationId: 'enzh-003-t2',
    translations: [
      translation('enzh-003-t1', 'p-en-1', enZhPrompts[0], '它的旅程并不特殊；成千上万件类似物品通过相同的商业网络流通。', '', '模拟引擎'),
      translation('enzh-003-t2', 'p-en-2', enZhPrompts[1], '这样的旅程并非个例。成千上万件相似物品，都曾沿着同一张贸易网络流动。', '', '模拟引擎'),
    ],
  },
  {
    id: 'enzh-004',
    source: 'Yet every transfer changed what the object meant, who valued it, and how it was used.',
    status: 'reviewed',
    currentTranslationId: 'enzh-004-t2',
    translations: [
      translation('enzh-004-t1', 'p-en-1', enZhPrompts[0], '然而，每次转移都改变了物品的意义、重视它的人以及使用它的方式。', '然而，每一次转手，都改变了这件物品的意义、珍视它的人，以及人们使用它的方式。', '陈同学'),
      translation('enzh-004-t2', 'p-en-2', enZhPrompts[1], '但每一次易手，也都在重新定义它：它意味着什么，谁会珍视它，又会怎样使用它。', '', '模拟引擎'),
    ],
  },
  {
    id: 'enzh-005',
    source: 'Look closely at the repaired rim: the metal staples reveal a history of care rather than simple damage.',
    status: 'translated',
    currentTranslationId: 'enzh-005-t2',
    translations: [
      translation('enzh-005-t1', 'p-en-1', enZhPrompts[0], '请仔细观察修复过的边缘：金属锔钉揭示了一段照料的历史，而不仅仅是损坏。', '', '模拟引擎'),
      translation('enzh-005-t2', 'p-en-2', enZhPrompts[1], '请留意碗沿修补过的痕迹。那些金属锔钉记录的，不只是破损，更是人们长久珍惜它的方式。', '', '模拟引擎'),
    ],
  },
  {
    id: 'enzh-006',
    source: 'The exhibition invites you to see trade not as an abstract system, but as a chain of human choices.',
    status: 'edited',
    currentTranslationId: 'enzh-006-t2',
    translations: [
      translation('enzh-006-t1', 'p-en-1', enZhPrompts[0], '本次展览邀请您不要将贸易视为抽象系统，而要将其视为一连串人类选择。', '', '模拟引擎'),
      translation('enzh-006-t2', 'p-en-2', enZhPrompts[1], '展览希望邀请你换一个角度理解贸易：它并非抽象的系统，而是无数人的选择首尾相连。', '展览邀请你换一个角度理解贸易：它不是抽象的系统，而是无数人的选择彼此相连。', '王同学'),
    ],
  },
];

const zhEnPrompts = [
  {
    id: 'p-zh-1',
    version: 1,
    title: '通用学术英语',
    author: '林老师',
    role: '教师',
    status: 'published',
    createdAt: '2026-07-20 10:00',
    note: '保留中文论证结构，建立英译初稿。',
    content: 'Translate the Chinese academic passage into formal English. Preserve the argument structure and technical terms. Do not add claims or citations.',
  },
  {
    id: 'p-zh-2',
    version: 2,
    title: '期刊摘要风格',
    author: '周同学',
    role: '学生',
    status: 'published',
    createdAt: '2026-07-21 14:20',
    note: '强化研究动作、概念衔接和英文摘要的紧凑性。',
    content: 'Translate for an international Translation Studies journal. Use concise academic English, make the research action explicit, maintain terminological consistency, and reorganise topic-comment sentences where necessary. Avoid inflated claims.',
  },
];

const zhEnSegments = [
  {
    id: 'zhen-001',
    source: '本文考察人工智能介入之后译者角色的重新配置。',
    status: 'reviewed',
    currentTranslationId: 'zhen-001-t2',
    translations: [
      translation('zhen-001-t1', 'p-zh-1', zhEnPrompts[0], 'This article examines the reconfiguration of the translator\'s role after the intervention of artificial intelligence.', '', '模拟引擎'),
      translation('zhen-001-t2', 'p-zh-2', zhEnPrompts[1], 'This article examines how artificial intelligence is reconfiguring the role of the translator.', 'This study examines how artificial intelligence reconfigures the translator\'s role.', '周同学'),
    ],
  },
  {
    id: 'zhen-002',
    source: '研究重点不在于机器是否替代人，而在于人如何设计生成条件。',
    status: 'translated',
    currentTranslationId: 'zhen-002-t2',
    translations: [
      translation('zhen-002-t1', 'p-zh-1', zhEnPrompts[0], 'The focus is not on whether machines replace humans, but on how humans design the conditions of generation.', '', '模拟引擎'),
      translation('zhen-002-t2', 'p-zh-2', zhEnPrompts[1], 'Rather than asking whether machines replace human translators, the study asks how humans design the conditions under which translations are generated.', '', '模拟引擎'),
    ],
  },
  {
    id: 'zhen-003',
    source: '提示词由此不再是临时命令，而成为翻译目的、受众与语域的操作化表达。',
    status: 'edited',
    currentTranslationId: 'zhen-003-t2',
    translations: [
      translation('zhen-003-t1', 'p-zh-1', zhEnPrompts[0], 'The prompt is therefore no longer a temporary command, but an operational expression of translation purpose, audience and register.', '', '模拟引擎'),
      translation('zhen-003-t2', 'p-zh-2', zhEnPrompts[1], 'The prompt thus becomes more than an ad hoc command: it operationalises the translation purpose, intended audience, and register.', 'The prompt thus becomes more than an ad hoc instruction: it operationalises skopos, audience, and register.', '周同学'),
    ],
  },
  {
    id: 'zhen-004',
    source: '译后编辑则为评价这些条件是否有效提供了可观察的证据。',
    status: 'translated',
    currentTranslationId: 'zhen-004-t2',
    translations: [
      translation('zhen-004-t1', 'p-zh-1', zhEnPrompts[0], 'Post-editing provides observable evidence for evaluating whether these conditions are effective.', '', '模拟引擎'),
      translation('zhen-004-t2', 'p-zh-2', zhEnPrompts[1], 'Post-editing, in turn, provides observable evidence for evaluating whether those conditions work in practice.', '', '模拟引擎'),
    ],
  },
  {
    id: 'zhen-005',
    source: '不同版本的提示词与译文必须保持对应，才能使教学讨论可以复现。',
    status: 'reviewed',
    currentTranslationId: 'zhen-005-t2',
    translations: [
      translation('zhen-005-t1', 'p-zh-1', zhEnPrompts[0], 'Different versions of prompts and translations must remain corresponding so that teaching discussions can be reproduced.', '', '模拟引擎'),
      translation('zhen-005-t2', 'p-zh-2', zhEnPrompts[1], 'Each prompt version must remain linked to its translation output if classroom analysis is to be reproducible.', '', '模拟引擎'),
    ],
  },
];

function translation(id, promptId, prompt, aiText, postEditText, author) {
  return {
    id,
    promptId,
    promptSnapshot: prompt.content,
    aiText,
    postEditText,
    author,
    model: 'Mock-Translator 1.0',
    createdAt: prompt.createdAt,
    contextSnapshot: '术语命中 + 相邻句段 + 项目翻译任务书',
  };
}

export const DEMO_PROJECTS = [
  {
    id: 'demo-en-zh',
    name: '海上物件：博物馆导览',
    direction: 'EN → ZH',
    sourceLang: 'English',
    targetLang: '简体中文',
    activePromptId: 'p-en-2',
    brief: {
      genre: '博物馆展览导览',
      skopos: '帮助普通观众理解物件背后的跨文化流动',
      audience: '非专业中国观众',
      register: '清楚、克制、具有引导感',
      strategy: '事实层面忠实，句法层面适度归化',
    },
    prompts: enZhPrompts,
    segments: enZhSegments,
    terms: [
      { source: 'maritime routes', target: '海上航路', note: '避免译作“海洋路线”' },
      { source: 'metal staples', target: '金属锔钉', note: '传统器物修复术语' },
      { source: 'commercial networks', target: '贸易网络', note: '项目统一译法' },
      { source: 'gallery', target: '展厅', note: '本项目不用“画廊”' },
    ],
    tm: [
      { source: 'The gallery invites visitors to look closely.', target: '展厅邀请观众近距离观察。', match: 82 },
      { source: 'Each object carries a history of human choices.', target: '每件物品都承载着一段由人的选择构成的历史。', match: 74 },
    ],
  },
  {
    id: 'demo-zh-en',
    name: 'AI时代的译者角色：摘要',
    direction: 'ZH → EN',
    sourceLang: '简体中文',
    targetLang: 'English',
    activePromptId: 'p-zh-2',
    brief: {
      genre: '翻译研究论文摘要',
      skopos: '向国际期刊读者清楚说明研究问题与概念贡献',
      audience: 'Translation Studies researchers',
      register: 'Concise academic English',
      strategy: '重组主题述位，保持论断强度，不放大结论',
    },
    prompts: zhEnPrompts,
    segments: zhEnSegments,
    terms: [
      { source: '译后编辑', target: 'post-editing', note: '统一使用连字符' },
      { source: '翻译目的', target: 'skopos', note: '理论语境中使用 skopos' },
      { source: '语域', target: 'register', note: '不使用 style 替代' },
      { source: '操作化', target: 'operationalise', note: '英式拼写' },
    ],
    tm: [
      { source: '本文考察译者角色的变化。', target: 'This study examines changes in the translator’s role.', match: 88 },
      { source: '提示词将翻译目的转化为指令。', target: 'Prompts translate skopos into operational instructions.', match: 79 },
    ],
  },
];

export function createDemoProjects() {
  return structuredClone(DEMO_PROJECTS);
}
