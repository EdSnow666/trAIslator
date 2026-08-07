/**
 * 职责: 集中定义翻译、AI 译后编辑、任务书和全文 Prompt 的真实消息结构
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: translationMessages | fullTranslationMessages | projectMessages | briefPayload | promptGenerationPayload | generationInstruction | 各系统指令常量
 */

export const TRANSLATION_SYSTEM = 'You are a professional translator. Follow the project translation brief, overarching project prompt, then the user custom prompt, and use the supplied terminology and translation memory. Return only the target-language translation.';
export const FULL_TRANSLATION_SYSTEM = `You are a professional translator. Translate the complete document as one coherent text while preserving paragraph alignment. Return JSON only in this exact shape: {"translations":[{"segmentId":"the supplied ID","text":"target-language translation"}]}. Return every supplied segment exactly once, keep every segmentId unchanged, add no IDs, omit no IDs, and do not use Markdown fences.`;
export const POST_EDIT_SYSTEM = 'You are a translation post-editor. Follow the project translation brief, overarching project prompt, and user custom prompt. Improve accuracy, sentence structure, clarity, and style. Return only the revised target text.';
export const BRIEF_SYSTEM = 'Create a cold-start translation brief. Return JSON only with string keys: genre, skopos, audience, register, strategy.';
export const PROMPT_GENERATION_SYSTEM = 'Write a complete reusable translation prompt for the full document. Return only the prompt.';

export type GenerationLanguage = 'zh-CN' | 'en';

export function generationInstruction(base: string, language: GenerationLanguage = 'zh-CN'): string {
  const rule = language === 'en' ? 'Write the generated content in English.'
    : 'Write the generated content in Simplified Chinese.';
  return base + ' ' + rule;
}

export interface TranslationPromptPayload {
  sourceLanguage: string;
  targetLanguage: string;
  source: string;
  currentTranslation: string | null;
  projectBrief: unknown;
  overarchingPrompt: string | null;
  customPrompt: string | null;
  terminology: unknown[];
  translationMemory: unknown[];
}

export function translationMessages(kind: 'ai_translation' | 'ai_post_edit',
  payload: TranslationPromptPayload): unknown[] {
  const system = kind === 'ai_post_edit' ? POST_EDIT_SYSTEM : TRANSLATION_SYSTEM;
  return [{ role: 'system', content: system },
    { role: 'user', content: JSON.stringify(payload) }];
}

export function fullTranslationMessages(payload: unknown): unknown[] {
  return [{ role: 'system', content: FULL_TRANSLATION_SYSTEM },
    { role: 'user', content: JSON.stringify(payload) }];
}

export function projectMessages(systemInstruction: string, payload: unknown): unknown[] {
  return [{ role: 'system', content: systemInstruction },
    { role: 'user', content: JSON.stringify(payload) }];
}

export function briefPayload(sourceParagraphs: string[]): unknown {
  return { instruction: 'Analyze the first up to 10 source paragraphs.', sourceParagraphs };
}

export function promptGenerationPayload(brief: unknown, sourceParagraphs: string[]): unknown {
  return { brief, sourceParagraphs };
}
