/**
 * 职责: 定义未来 OpenAI-compatible 翻译接口，当前版本只返回模拟模式状态
 * 依赖内部: 无
 * 依赖外部: Fetch API（预留）
 * 暴露: AIClient | compileTranslationRequest
 */

export class AIClient {
  constructor(config = {}) {
    this.config = config;
  }

  async translate() {
    throw new Error('实时 API 尚未启用；当前请使用模拟译文。');
  }

  async analyseBrief() {
    throw new Error('实时冷启动分析尚未启用；当前展示预存分析。');
  }
}

export function compileTranslationRequest({ project, prompt, segments }) {
  return {
    system: 'You are a translation assistant. Return JSON only.',
    projectPrompt: prompt.content,
    brief: structuredClone(project.brief),
    terminology: structuredClone(project.terms),
    translationMemory: structuredClone(project.tm),
    segments: segments.map(({ id, source }) => ({ id, source })),
    outputSchema: { translations: [{ segmentId: 'string', target: 'string' }] },
  };
}
