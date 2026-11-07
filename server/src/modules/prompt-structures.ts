/**
 * 职责: 集中定义翻译、AI 译后编辑、任务书和全文 Prompt 的真实消息结构
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: translationMessages | fullTranslationMessages | projectMessages | briefPayload | promptGenerationPayload | generationInstruction | 各系统指令常量
 */

export const TRANSLATION_SYSTEM = 'You are a professional translator. Follow the project translation brief, overarching project prompt, then the user custom prompt, and use the supplied terminology and translation memory. Return only the target-language translation.';
export const FULL_TRANSLATION_SYSTEM = `You are a professional translator. Translate the complete document as one coherent text while preserving paragraph alignment. Return JSON only in this exact shape: {"translations":[{"segmentId":"the supplied ID","text":"target-language translation"}]}. Return every supplied segment exactly once, keep every segmentId unchanged, add no IDs, omit no IDs, and do not use Markdown fences.`;
export const FULL_POST_EDIT_SYSTEM = `You are a professional translation post-editor. Compare each currentTranslation against its source, using the complete source document to understand meaning, context, speaker attribution and tone. Follow the project translation brief (projectBrief), overarching project post-editing prompt (overarchingPrompt), and the user's post-editing prompt (customPrompt); use the supplied terminology and translation memory. Do not limit editing to synonym substitution or surface polishing. When needed to meet those instructions, reorganize sentence structure, clause relationships, information order, quotations and expression across sentences within each paragraph. Preserve source meaning, facts, logical relationships and tone; do not invent content or rewrite merely to increase the amount of change. Post-edit the complete document coherently while preserving paragraph alignment. Each segment contains source and currentTranslation. Return JSON only in this exact shape: {"translations":[{"segmentId":"the supplied ID","text":"post-edited target text"}]}. Return every supplied segment exactly once, keep every segmentId unchanged, add no IDs, omit no IDs, and do not use Markdown fences.`;
export const POST_EDIT_SYSTEM = 'You are a translation post-editor. Follow the project translation brief, overarching project prompt, and user custom prompt. Improve accuracy, sentence structure, clarity, and style. Return only the revised target text.';
export const BRIEF_SYSTEM = `Create a translation brief describing the communication requirements for this project, not instructions addressed to an AI translator. Analyze the supplied source sample and language direction. Describe the text type and context (genre), communicative purpose (skopos), intended readers (audience), appropriate tone and formality (register), and overall translation approach (strategy). Distinguish evidence in the source from tentative assumptions; do not invent a client, publication setting, advocacy goal or target audience unsupported by the input. Keep each field concise and informative. Do not translate the source or write an executable translation prompt. Return JSON only with exactly these string keys: genre, skopos, audience, register, strategy. No Markdown fences or extra fields.`;
export const PROMPT_GENERATION_SYSTEM = `Write a complete reusable translation prompt for the full document, addressed directly to the AI translator. The supplied brief is a specification to operationalize, not an output template to copy. Use sourceLanguage and targetLanguage to state the translation direction. Convert the brief and the source sample into concrete instructions about wording, sentence organization, quotation and speaker attribution, cohesion, register and document-wide consistency where relevant. Explain how to realize the requested style in the target language rather than repeating the five brief fields or merely naming a translation theory. Preserve facts, logical relations, scope, modality and tone; an engaging style does not authorize invented imagery, emotional amplification or unsupported claims. Refer to terminology and translation memory only when supplied at translation time, without inventing entries. Do not assume the sample represents unseen facts from the rest of the document. The application supplies source text separately: do not reproduce the source sample, add a source-text placeholder, translate now, or embed application-specific JSON/segment-ID protocols. State that the translator should output the target text without commentary, subject to the application's output format. Return only the usable prompt body, not a translation brief, its JSON representation or an explanation of your design.`;

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

export function fullTranslationMessages(payload: unknown,
  kind: 'ai_translation' | 'ai_post_edit' = 'ai_translation'): unknown[] {
  const system = kind === 'ai_post_edit' ? FULL_POST_EDIT_SYSTEM : FULL_TRANSLATION_SYSTEM;
  return [{ role: 'system', content: system },
    { role: 'user', content: JSON.stringify(payload) }];
}

export function projectMessages(systemInstruction: string, payload: unknown): unknown[] {
  return [{ role: 'system', content: systemInstruction },
    { role: 'user', content: JSON.stringify(payload) }];
}

export function briefPayload(sourceParagraphs: string[], languages: Partial<{ sourceLanguage: string; targetLanguage: string }> = {}): unknown {
  return { instruction: 'Analyze the first up to 10 source paragraphs.', ...languages, sourceParagraphs };
}

export function promptGenerationPayload(brief: unknown, sourceParagraphs: string[], languages: Partial<{ sourceLanguage: string; targetLanguage: string }> = {}): unknown {
  return { ...languages, brief, sourceParagraphs };
}
