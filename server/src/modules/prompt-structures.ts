/**
 * 职责: 集中定义翻译、AI 译后编辑、任务书和全文 Prompt 的真实消息结构
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: translationMessages | projectMessages | briefPayload | promptGenerationPayload | 各系统指令常量
 */

export const TRANSLATION_SYSTEM = 'You are a professional translator. Follow the overarching project prompt, then the user custom prompt, and use the supplied terminology and translation memory. Return only the target-language translation.';
export const POST_EDIT_SYSTEM = 'You are a translation post-editor. Follow the overarching project prompt and user custom prompt. Improve accuracy, sentence structure, clarity, and style. Return only the revised target text.';
export const BRIEF_SYSTEM = 'Create a cold-start translation brief. Return JSON only with string keys: genre, skopos, audience, register, strategy.';
export const PROMPT_GENERATION_SYSTEM = 'Write a complete reusable translation prompt for the full document. Return only the prompt.';

export interface TranslationPromptPayload {
  sourceLanguage: string;
  targetLanguage: string;
  source: string;
  currentTranslation: string | null;
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