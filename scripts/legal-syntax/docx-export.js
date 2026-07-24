/**
 * 职责: 将选中的句法历史记录生成带结构着色的真正 DOCX
 * 依赖内部: 无
 * 依赖外部: Blob, URL, TextEncoder
 * 暴露: buildHistoryDocxBytes | downloadHistoryDocx
 */

const encoder = new TextEncoder();
const ROLE_STYLES = {
  main: { color: '245F99', fill: 'E5F0FA' },
  condition: { color: '7455A6', fill: 'EEE9F7' },
  co_condition: { color: '7455A6', fill: 'EEE9F7' },
  modifier: { color: '2F7C62', fill: 'E4F2EC' },
  limit: { color: 'B06B19', fill: 'FAEDDA' },
  extent: { color: 'B06B19', fill: 'FAEDDA' },
  proviso: { color: 'B84B48', fill: 'F8E7E5' },
  exception: { color: 'B84B48', fill: 'F8E7E5' },
  negation: { color: 'B84B48', fill: 'F8E7E5' },
  modal: { color: '64707C', fill: 'EDF0F2' },
  coordination: { color: '64707C', fill: 'EDF0F2' },
};

export function buildHistoryDocxBytes(records) {
  const files = {
    '[Content_Types].xml': contentTypesXml(),
    '_rels/.rels': rootRelationshipsXml(),
    'docProps/core.xml': corePropertiesXml(),
    'docProps/app.xml': appPropertiesXml(),
    'word/styles.xml': stylesXml(),
    'word/document.xml': documentXml(records),
  };
  return zipFiles(files);
}

export function downloadHistoryDocx(records) {
  const bytes = buildHistoryDocxBytes(records);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `legal-syntax-history-${fileTimestamp()}.docx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function documentXml(records) {
  const body = [
    titleBlock(records.length),
    ...records.map((record, index) => recordXml(record, index)),
    sectionProperties(),
  ].join('');
  return xmlHeader() + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

function titleBlock(count) {
  const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(new Date());
  return [
    paragraph([run('法律句法分析导出', { bold: true, size: 44, color: '243B5A' })], '', { after: 80 }),
    paragraph([run(`${count} 条成功分析记录 · ${date}`, { size: 20, color: '66717D' })], '', { after: 260 }),
  ].join('');
}

function recordXml(record, index) {
  const analysis = record.analysis;
  const parts = [];
  if (index > 0) parts.push(pageBreak());
  parts.push(paragraph([run(`法律句法分析 ${index + 1}`)], 'Heading1'));
  parts.push(metadataParagraph(record));
  parts.push(paragraph([run('原文结构着色')], 'Heading2'));
  parts.push(paragraph(sourceRuns(analysis), '', { after: 180, line: 340 }));
  parts.push(explanationXml(analysis));
  parts.push(translationXml(analysis));
  return parts.join('');
}

function metadataParagraph(record) {
  const date = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(record.createdAt));
  return paragraph([run(`${date} · ${record.model || 'AI'}`, { size: 18, color: '66717D' })], '', { after: 100 });
}

function explanationXml(analysis) {
  return [
    paragraph([run('同步讲解')], 'Heading2'),
    paragraph([run(analysis.summary_zh)]),
    paragraph([run('分句骨架')], 'Heading3'),
    ...analysis.clauses.flatMap((item) => itemExplanation(analysis, item, item.function_zh)),
    paragraph([run('修饰结构')], 'Heading3'),
    ...analysis.spans.flatMap((item) => itemExplanation(analysis, item, item.explanation_zh)),
    paragraph([run('特征语法词')], 'Heading3'),
    ...analysis.markers.map((item) => markerExplanation(analysis, item)),
    paragraph([run('结构关系')], 'Heading3'),
    ...analysis.relations.map(relationParagraph),
  ].join('');
}

function itemExplanation(analysis, item, explanation) {
  const style = roleStyle(item.role);
  const label = item.label_zh || item.grammar_type || item.role;
  return [
    paragraph([run(label, { bold: true, color: style.color })], '', { before: 80, after: 40, keepNext: true }),
    paragraph([run(itemText(analysis, item), { italic: true, fill: style.fill })], '', { after: 40 }),
    paragraph([run(explanation || '暂无解释。')]),
  ];
}

function markerExplanation(analysis, item) {
  const style = roleStyle(item.role);
  const label = item.label_zh || item.category || item.role;
  const text = `${itemText(analysis, item)}：${item.explanation_zh || label}`;
  return paragraph([run(text, { bold: true, underline: true, color: style.color })]);
}

function relationParagraph(relation) {
  const text = `${relation.label_zh}（${relation.from_id} → ${relation.to_id}）`;
  return paragraph([run(text)]);
}

function translationXml(analysis) {
  return [
    paragraph([run('参考翻译')], 'Heading2'),
    paragraph([run(analysis.translation.full_zh)], '', { after: 180, line: 320 }),
  ].join('');
}

function sourceRuns(analysis) {
  const metadata = tokenMetadata(analysis);
  const runs = [];
  let cursor = 0;
  analysis.source.tokens.forEach((token) => {
    const value = analysis.source.text.slice(cursor, token.end);
    runs.push(run(value, wordStyle(metadata.get(token.id))));
    cursor = token.end;
  });
  if (cursor < analysis.source.text.length) runs.push(run(analysis.source.text.slice(cursor)));
  return runs;
}

function tokenMetadata(analysis) {
  const metadata = new Map(analysis.source.tokens.map((token) => [token.id, {}]));
  assignRanges(metadata, analysis, analysis.clauses, false);
  assignRanges(metadata, analysis, analysis.spans, true);
  assignMarkers(metadata, analysis);
  return metadata;
}

function assignRanges(metadata, analysis, items, override) {
  const indexes = tokenIndexes(analysis.source.tokens);
  items.forEach((item) => {
    const start = indexes.get(item.token_start);
    const end = indexes.get(item.token_end);
    analysis.source.tokens.slice(start, end + 1).forEach((token) => {
      if (override || !metadata.get(token.id).role) metadata.get(token.id).role = item.role;
    });
  });
}

function assignMarkers(metadata, analysis) {
  const indexes = tokenIndexes(analysis.source.tokens);
  analysis.markers.forEach((item) => {
    const start = indexes.get(item.token_start);
    const end = indexes.get(item.token_end);
    analysis.source.tokens.slice(start, end + 1).forEach((token) => {
      metadata.get(token.id).markerRole = item.role;
    });
  });
}

function tokenIndexes(tokens) {
  return new Map(tokens.map((token, index) => [token.id, index]));
}

function wordStyle(metadata = {}) {
  const structure = roleStyle(metadata.role);
  const marker = roleStyle(metadata.markerRole);
  return {
    fill: metadata.role ? structure.fill : '',
    color: metadata.markerRole ? marker.color : '202833',
    bold: Boolean(metadata.markerRole),
    underline: Boolean(metadata.markerRole),
  };
}

function roleStyle(role) {
  return ROLE_STYLES[role] || { color: '64707C', fill: 'EDF0F2' };
}

function itemText(analysis, item) {
  const indexes = tokenIndexes(analysis.source.tokens);
  const start = analysis.source.tokens[indexes.get(item.token_start)];
  const end = analysis.source.tokens[indexes.get(item.token_end)];
  return analysis.source.text.slice(start.start, end.end);
}

function paragraph(runs, style = '', options = {}) {
  const styleXml = style ? `<w:pStyle w:val="${style}"/>` : '';
  const spacing = spacingXml(options);
  const shouldKeepNext = options.keepNext || style.startsWith('Heading');
  const keepNext = shouldKeepNext ? '<w:keepNext/>' : '';
  return `<w:p><w:pPr>${styleXml}${spacing}${keepNext}</w:pPr>${runs.join('')}</w:p>`;
}

function spacingXml(options) {
  const before = options.before ?? 0;
  const after = options.after ?? 120;
  const line = options.line ?? 300;
  return `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>`;
}

function run(text, options = {}) {
  const properties = runProperties(options);
  return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function runProperties(options) {
  const values = [
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/>',
    `<w:sz w:val="${options.size || 22}"/><w:szCs w:val="${options.size || 22}"/>`,
  ];
  if (options.color) values.push(`<w:color w:val="${options.color}"/>`);
  if (options.fill) values.push(`<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>`);
  if (options.bold) values.push('<w:b/>');
  if (options.italic) values.push('<w:i/>');
  if (options.underline) values.push('<w:u w:val="single"/>');
  return values.join('');
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function sectionProperties() {
  return '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
}

function stylesXml() {
  return xmlHeader() + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    ${styleDefinition('Normal', 'Normal', 22, '202833', 0, 120, 300)}
    ${styleDefinition('Heading1', 'heading 1', 32, '2E74B5', 360, 200, 300, true)}
    ${styleDefinition('Heading2', 'heading 2', 26, '2E74B5', 280, 140, 300, true)}
    ${styleDefinition('Heading3', 'heading 3', 24, '1F4D78', 200, 100, 300, true)}
  </w:styles>`;
}

function styleDefinition(id, name, size, color, before, after, line, bold = false) {
  const basedOn = id === 'Normal' ? '' : '<w:basedOn w:val="Normal"/>';
  const keepNext = id === 'Normal' ? '' : '<w:keepNext/>';
  return `<w:style w:type="paragraph" w:styleId="${id}"${id === 'Normal' ? ' w:default="1"' : ''}>
    <w:name w:val="${name}"/>${basedOn}<w:next w:val="Normal"/>
    <w:pPr>${keepNext}<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/>
    ${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>
  </w:style>`;
}

function contentTypesXml() {
  return xmlHeader() + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
    <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  </Types>`;
}

function rootRelationshipsXml() {
  return xmlHeader() + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
    <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
  </Relationships>`;
}

function corePropertiesXml() {
  const timestamp = new Date().toISOString();
  return xmlHeader() + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
    xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <dc:title>法律句法分析导出</dc:title><dc:creator>Translation AIducator</dc:creator>
    <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  </cp:coreProperties>`;
}

function appPropertiesXml() {
  return xmlHeader() + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Translation AIducator</Application></Properties>';
}

function xmlHeader() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function zipFiles(files) {
  const entries = Object.entries(files).map(([name, content]) => createZipEntry(name, content));
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  entries.forEach((entry) => {
    localParts.push(localHeader(entry), entry.nameBytes, entry.data);
    centralParts.push(centralHeader(entry, offset), entry.nameBytes);
    offset += 30 + entry.nameBytes.length + entry.data.length;
  });
  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  return concatBytes([...localParts, ...centralParts, endOfCentral(entries.length, centralSize, offset)]);
}

function createZipEntry(name, content) {
  const nameBytes = encoder.encode(name);
  const data = typeof content === 'string' ? encoder.encode(content) : content;
  const { time, date } = dosDateTime(new Date());
  return { nameBytes, data, crc: crc32(data), time, date };
}

function localHeader(entry) {
  const header = new Uint8Array(30);
  write32(header, 0, 0x04034b50);
  write16(header, 4, 20);
  write16(header, 6, 0x0800);
  write16(header, 10, entry.time);
  write16(header, 12, entry.date);
  write32(header, 14, entry.crc);
  write32(header, 18, entry.data.length);
  write32(header, 22, entry.data.length);
  write16(header, 26, entry.nameBytes.length);
  return header;
}

function centralHeader(entry, offset) {
  const header = new Uint8Array(46);
  write32(header, 0, 0x02014b50);
  write16(header, 4, 20);
  write16(header, 6, 20);
  write16(header, 8, 0x0800);
  write16(header, 12, entry.time);
  write16(header, 14, entry.date);
  write32(header, 16, entry.crc);
  write32(header, 20, entry.data.length);
  write32(header, 24, entry.data.length);
  write16(header, 28, entry.nameBytes.length);
  write32(header, 42, offset);
  return header;
}

function endOfCentral(count, size, offset) {
  const record = new Uint8Array(22);
  write32(record, 0, 0x06054b50);
  write16(record, 8, count);
  write16(record, 10, count);
  write32(record, 12, size);
  write32(record, 16, offset);
  return record;
}

function concatBytes(parts) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function write16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function write32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = (year - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate();
  return { time, date: day };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function fileTimestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
