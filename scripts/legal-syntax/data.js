/**
 * 职责: 提供两条法律英语种子句及其结构化句法分析
 * 依赖内部: tokenizer.js
 * 依赖外部: 无
 * 暴露: EXAMPLE_OPTIONS | getPreparedExample
 */

import { resolveQuoteRange, tokenizeSource } from './tokenizer.js';

const EXAMPLE_ONE_SOURCE = 'If the proposed Insured has or acquires actual knowledge of any defect, lien, encumbrance, adverse claim or other matter affecting the estate or interest or mortgage thereon covered by this Commitment other than those shown on Schedule B hereof, and shall fail to disclose such knowledge to the Company in writing, the Company shall be relieved from liability for any loss or damage resulting from any act of reliance hereon to the extent the Company is prejudiced by failure to so disclose such knowledge.';

const EXAMPLE_TWO_SOURCE = 'If the proposed Insured shall disclose such knowledge of any such defect, lien, encumbrance, adverse claim or other matter, the Company at its option may amend Schedule B of this Commitment accordingly, but such amendment shall not relieve the Company from liability previously incurred pursuant to Paragraph 3 of these Conditions and Stipulations.';

const EXAMPLE_ONE = {
  id: 'example-1',
  title: '知情未披露与责任限制',
  source: EXAMPLE_ONE_SOURCE,
  analysis: {
    schema_version: '1.0',
    summary_zh: '本句以两个并列条件为前提，规定公司免责的主要法律后果，并以公司实际受到的不利影响为责任范围上限。',
    clauses: [
      clause('c1', 'condition', 'Conditional clause', '条件从句', 'If the proposed Insured has or acquires actual knowledge of any defect, lien, encumbrance, adverse claim or other matter affecting the estate or interest or mortgage thereon covered by this Commitment other than those shown on Schedule B hereof', '提出第一个前提：拟受保人已经知道或后来获悉未列于附表 B 的相关事项。'),
      clause('c2', 'co_condition', 'Coordinated condition', '并列条件', 'and shall fail to disclose such knowledge to the Company in writing', '通过 and 与第一条件并列，增加“未书面披露”这一免责前提。'),
      clause('c3', 'main', 'Main clause', '主句', 'the Company shall be relieved from liability for any loss or damage resulting from any act of reliance hereon', '规定条件成立后的法律效果：公司在相应范围内不承担损失或损害责任。'),
      clause('c4', 'extent', 'Extent limitation', '范围限制', 'to the extent the Company is prejudiced by failure to so disclose such knowledge', '限制免责范围：只有公司因未披露而受到不利影响的部分才适用免责。'),
    ],
    spans: [
      span('s1', 'modifier', 'present participle clause', '现在分词后置修饰语', 'affecting the estate or interest or mortgage thereon', 'c1', 'other matter', '说明前述 defect、lien、encumbrance、claim 或 matter 对哪些财产权利产生影响。'),
      span('s2', 'modifier', 'past participle clause', '过去分词后置修饰语', 'covered by this Commitment', 'c1', 'the estate or interest or mortgage thereon', '进一步限定相关财产权益或抵押属于本承诺的承保范围。'),
      span('s3', 'exception', 'exception phrase', '例外短语', 'other than those shown on Schedule B hereof', 'c1', 'covered matters', '排除已经列在附表 B 中的事项，缩小条件从句的适用范围。'),
      span('s4', 'modifier', 'present participle clause', '现在分词后置修饰语', 'resulting from any act of reliance hereon', 'c3', 'any loss or damage', '限定损失或损害必须源于对本承诺的依赖行为。'),
      span('s5', 'limit', 'prepositional phrase', '介词短语', 'by failure to so disclose such knowledge', 'c4', 'is prejudiced', '说明公司受到不利影响的原因是拟受保人未作披露。'),
    ],
    markers: [
      marker('m1', 'condition', 'conditional_connector', '条件标记', 'If', 0, '提示条件结构开始。'),
      marker('m2', 'coordination', 'coordinator', '选择并列', 'has or acquires', 0, 'or 连接两种获得实际知情的方式。'),
      marker('m3', 'exception', 'exception_marker', '例外标记', 'other than', 0, '提示后文将从前述范围中排除一种情况。'),
      marker('m4', 'condition', 'coordinator', '并列条件标记', 'and shall', 0, 'and 把未披露与知情条件连接为复合前提。'),
      marker('m5', 'modal', 'legal_modal', '法律情态词', 'shall', 1, '在主句中标示强制性的法律后果。'),
      marker('m6', 'modifier', 'participle_marker', '分词修饰标记', 'resulting from', 0, '提示其后结构修饰 loss or damage。'),
      marker('m7', 'extent', 'extent_marker', '范围限制标记', 'to the extent', 0, '提示法律效果只在后述程度内成立。'),
      marker('m8', 'limit', 'cause_marker', '原因标记', 'by failure', 0, 'by 引出公司受损的原因。'),
    ],
    relations: [
      relation('c1', 'c2', 'coordination', '两个条件并列成立'),
      relation('c2', 'c3', 'condition_result', '条件成立后产生免责效果'),
      relation('c4', 'c3', 'limitation', '对主句免责范围加以限制'),
      relation('s3', 'c1', 'modification', '排除已列于附表 B 的事项'),
    ],
    translation: {
      full_zh: '如果擬受保人知道或獲悉任何影響該財產產業權、權益或抵押的缺陷／欠妥之處、留置權、產權負擔、不利申索或其他事項（該等事項涵蓋在本承諾中，但不包括本承諾附表 B 所示的情況），且未以書面形式向公司披露該等事項，則公司對於因依賴本承諾而產生的任何損失或損害不承擔法律責任，但以公司因未披露該等事項而受到損害為限。',
      segments: [
        translation('z1', ['c1'], '如果擬受保人知道或獲悉任何影響該財產產業權、權益或抵押的缺陷／欠妥之處、留置權、產權負擔、不利申索或其他事項（該等事項涵蓋在本承諾中，但不包括本承諾附表 B 所示的情況），'),
        translation('z2', ['c2'], '且未以書面形式向公司披露該等事項，'),
        translation('z3', ['c3'], '則公司對於因依賴本承諾而產生的任何損失或損害不承擔法律責任，'),
        translation('z4', ['c4'], '但以公司因未披露該等事項而受到損害為限。'),
      ],
    },
  },
};

const EXAMPLE_TWO = {
  id: 'example-2',
  title: '披露、修改与既有责任',
  source: EXAMPLE_TWO_SOURCE,
  analysis: {
    schema_version: '1.0',
    summary_zh: '本句先以披露为条件授权公司修改附表 B，随后以 but 引出的但书保留公司此前已经产生的责任。',
    clauses: [
      clause('c1', 'condition', 'Conditional clause', '条件从句', 'If the proposed Insured shall disclose such knowledge of any such defect, lien, encumbrance, adverse claim or other matter', '规定公司取得修改权的前提：拟受保人披露相关知情事项。'),
      clause('c2', 'main', 'Main clause', '主句', 'the Company at its option may amend Schedule B of this Commitment accordingly', '赋予公司选择是否相应修改附表 B 的权利，而非设定必须修改的义务。'),
      clause('c3', 'proviso', 'Proviso', '但书', 'but such amendment shall not relieve the Company from liability previously incurred pursuant to Paragraph 3 of these Conditions and Stipulations', '对前述修改权设置限制：修改不能消灭公司在第 3 段下已经产生的责任。'),
    ],
    spans: [
      span('s1', 'modifier', 'prepositional phrase', '插入性介词短语', 'at its option', 'c2', 'may amend', '说明修改属于公司可以选择行使的权利。'),
      span('s2', 'modifier', 'prepositional phrase', '介词短语', 'of this Commitment', 'c2', 'Schedule B', '限定被修改的附表 B 属于本承诺。'),
      span('s3', 'modifier', 'past participle clause', '过去分词后置修饰语', 'previously incurred', 'c3', 'liability', '说明不得免除的是公司此前已经产生的责任。'),
      span('s4', 'limit', 'prepositional phrase', '法律依据短语', 'pursuant to Paragraph 3 of these Conditions and Stipulations', 'c3', 'previously incurred liability', '指出既有责任产生于本条件和规定第 3 段。'),
    ],
    markers: [
      marker('m1', 'condition', 'conditional_connector', '条件标记', 'If', 0, '提示条件从句开始。'),
      marker('m2', 'modal', 'legal_modal', '法律情态词', 'shall', 0, '位于条件中，表达合同拟制的正式条件。'),
      marker('m3', 'modifier', 'discretion_marker', '选择权标记', 'at its option', 0, '说明公司拥有选择权。'),
      marker('m4', 'main', 'permission_modal', '授权情态词', 'may', 0, '赋予公司修改附表的权利，而不是强制义务。'),
      marker('m5', 'proviso', 'contrast_connector', '但书标记', 'but', 0, '提示后文限制前述授权产生的效果。'),
      marker('m6', 'negation', 'negative_legal_effect', '否定法律效果', 'shall not', 0, '明确排除“修改可以免除既有责任”的解释。'),
      marker('m7', 'modifier', 'participle_marker', '既有状态标记', 'previously incurred', 0, '提示责任在修改前已经发生。'),
      marker('m8', 'limit', 'legal_basis_marker', '法律依据标记', 'pursuant to', 0, '引出责任所依据的合同条款。'),
    ],
    relations: [
      relation('c1', 'c2', 'condition_result', '披露条件触发修改权限'),
      relation('c2', 'c3', 'contrast', '但书限制修改的免责效果'),
      relation('s4', 's3', 'modification', '说明既有责任的条款依据'),
    ],
    translation: {
      full_zh: '如果擬受保人披露了任何該等缺陷／欠妥之處、留置權、產權負擔、不利申索或其他事項，公司可選擇對本承諾的附表 B 作出相應修改，但該修訂不得免除公司根據本條件和規定第 3 段先前所應承擔的法律責任。',
      segments: [
        translation('z1', ['c1'], '如果擬受保人披露了任何該等缺陷／欠妥之處、留置權、產權負擔、不利申索或其他事項，'),
        translation('z2', ['c2'], '公司可選擇對本承諾的附表 B 作出相應修改，'),
        translation('z3', ['c3'], '但該修訂不得免除公司根據本條件和規定第 3 段先前所應承擔的法律責任。'),
      ],
    },
  },
};

export const EXAMPLE_OPTIONS = [
  { id: EXAMPLE_ONE.id, title: EXAMPLE_ONE.title, source: EXAMPLE_ONE.source },
  { id: EXAMPLE_TWO.id, title: EXAMPLE_TWO.title, source: EXAMPLE_TWO.source },
];

const EXAMPLE_MAP = new Map([
  [EXAMPLE_ONE.id, EXAMPLE_ONE],
  [EXAMPLE_TWO.id, EXAMPLE_TWO],
]);

export function getPreparedExample(id) {
  const seed = structuredClone(EXAMPLE_MAP.get(id) || EXAMPLE_ONE);
  const tokens = tokenizeSource(seed.source);
  seed.analysis.clauses = prepareItems(seed.source, tokens, seed.analysis.clauses);
  seed.analysis.spans = prepareItems(seed.source, tokens, seed.analysis.spans);
  seed.analysis.markers = prepareItems(seed.source, tokens, seed.analysis.markers);
  seed.analysis.source = { language: 'en', text: seed.source, tokens };
  return seed;
}

function prepareItems(source, tokens, items) {
  return items.map((item) => prepareItem(source, tokens, item));
}

function prepareItem(source, tokens, item) {
  const range = resolveQuoteRange(source, tokens, item.quote, item.occurrence || 0);
  const prepared = { ...item, ...range };
  delete prepared.quote;
  delete prepared.occurrence;
  return prepared;
}

function clause(id, role, labelEn, labelZh, quote, functionZh) {
  return {
    id, role, label_en: labelEn, label_zh: labelZh,
    quote, parent_id: null, function_zh: functionZh,
  };
}

function span(id, role, grammarType, labelZh, quote, parentId, modifiesText, explanationZh) {
  return {
    id, role, grammar_type: grammarType, label_zh: labelZh, quote,
    parent_id: parentId, modifies_text: modifiesText, explanation_zh: explanationZh,
  };
}

function marker(id, role, category, labelZh, quote, occurrence, explanationZh) {
  return {
    id, role, category, label_zh: labelZh, quote, occurrence, explanation_zh: explanationZh,
  };
}

function relation(fromId, toId, type, labelZh) {
  return { from_id: fromId, to_id: toId, type, label_zh: labelZh };
}

function translation(id, sourceIds, textZh) {
  return { id, source_ids: sourceIds, text_zh: textZh };
}
