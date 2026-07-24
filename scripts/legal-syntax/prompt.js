/**
 * 职责: 提供可编辑分析模板、请求身份约束与不可编辑 JSON 数据协议
 * 依赖内部: 无
 * 依赖外部: structuredClone
 * 暴露: DEFAULT_USER_PROMPT | SCHEMA_PREVIEW | buildLockedPrompt
 */

export const DEFAULT_USER_PROMPT = `你是一名法律英语句法分析与翻译教学专家。

请分析用户提供的一条英文法律句子，并用中文解释。

分析要求：
1. 先识别句子的法律逻辑骨架，例如条件、并列条件、主句、但书、例外、范围限制和法律依据。
2. 再识别影响理解的修饰结构，例如现在分词、过去分词、介词短语、关系结构、否定和回指。
3. 标出具有结构提示作用的语法词或短语，例如 if、and、but、provided that、shall、may、not、other than、to the extent、pursuant to。
4. 每个解释必须说明该结构修饰什么、限制什么，或在法律效果中发挥什么作用。
5. 提供一份紧贴原文逻辑和顺序的繁体中文法律参考译文。
6. 不要为了简化而省略条件、例外、限制、否定或责任范围。`;

export const SCHEMA_PREVIEW = {
  schema_version: '1.1',
  request_id: '本次请求要求的精确值',
  source_fingerprint: '本次原文指纹的精确值',
  summary_zh: 'string',
  clauses: [{
    id: 'c1',
    role: 'condition | co_condition | main | proviso | exception | extent',
    label_en: 'string',
    label_zh: 'string',
    token_start: '带请求前缀的真实 token id',
    token_end: '带请求前缀的真实 token id',
    surface_text: 'token 范围对应的英文原文',
    parent_id: null,
    function_zh: 'string',
  }],
  spans: [{
    id: 's1',
    role: 'modifier | limit | exception',
    grammar_type: 'string',
    label_zh: 'string',
    token_start: '带请求前缀的真实 token id',
    token_end: '带请求前缀的真实 token id',
    surface_text: 'token 范围对应的英文原文',
    parent_id: 'c1',
    modifies_text: 'string',
    explanation_zh: 'string',
  }],
  markers: [{
    id: 'm1',
    role: 'condition | main | proviso | exception | extent | modifier | modal | coordination | negation | limit',
    category: 'string',
    label_zh: 'string',
    token_start: '带请求前缀的真实 token id',
    token_end: '带请求前缀的真实 token id',
    surface_text: 'token 范围对应的英文语法词或短语',
    explanation_zh: 'string',
  }],
  relations: [{
    from_id: 'c1',
    to_id: 'c2',
    type: 'condition_result | coordination | contrast | limitation | modification',
    label_zh: 'string',
  }],
  translation: {
    full_zh: 'string',
    segments: [{
      id: 'z1',
      source_ids: ['c1'],
      text_zh: 'string',
    }],
  },
};

export function buildLockedPrompt(source, formattedTokens, tokenRange, identity) {
  const schema = responseSchema(identity);
  return `以下数据协议不可修改。只返回一个合法 JSON 对象，不得输出 Markdown 代码围栏、标题或补充说明。

${identityBlock(identity)}

英文原文：
${source}

程序生成的 token：
${formattedTokens}

${tokenRules(tokenRange)}

${analysisRules()}

必须严格匹配以下结构：
${JSON.stringify(schema, null, 2)}`;
}

function responseSchema(identity) {
  const schema = structuredClone(SCHEMA_PREVIEW);
  schema.request_id = identity.requestId;
  schema.source_fingerprint = identity.sourceFingerprint;
  return schema;
}

function identityBlock(identity) {
  return `请求身份是最高优先级约束：
- request_id 必须逐字复制为 ${identity.requestId}
- source_fingerprint 必须逐字复制为 ${identity.sourceFingerprint}
- 不得使用上一请求、示例或缓存响应中的身份值。`;
}

function tokenRules(tokenRange) {
  return `TOKEN 引用是最高优先级约束：
- 本次允许使用的 token 编号范围为 ${tokenRange.first} 至 ${tokenRange.last}。
- token_start 和 token_end 只能逐字复制本次 token 列表中实际存在的完整编号，包括请求前缀。
- 不得去掉前缀、改用 t001、沿用上一请求的编号，或创造 token 编号。
- c1、s1、m1 等结构编号绝对不能填写到 token_start 或 token_end。
- token_start 不得晚于 token_end。
- 每个 clause、span、marker 的 surface_text 必须逐字符等于其 token 范围在英文原文中覆盖的文本。
- 无法准确定位时应缩小范围，不得猜测编号或 surface_text。`;
}

function analysisRules() {
  return `分析规则：
- clauses 应覆盖完整的法律逻辑骨架，不要把每个短语都提升为 clause。
- spans 用于 clauses 内部的重要修饰结构。
- markers 只收录帮助辨识结构的特征语法词，不收录普通实词。
- marker 的 explanation_zh 必须明确写出并解释该 marker 的 surface_text，不得解释其他词语。
- clauses、spans、markers 的 id 必须分别以 c、s、m 开头且全局唯一。
- parent_id、from_id、to_id、source_ids 必须引用已经定义的 clause 或 span。
- 角色只能从数据协议列出的枚举中选择。
- 中文解释必须针对本次英文原文，不得套用其他合同条款或上一请求。
- translation.segments 合并后应与 full_zh 内容一致，且 source_ids 能支持中英联动。
- 输出前静默核对 request_id、source_fingerprint、所有 token 编号和 surface_text，不要输出检查过程。`;
}