/**
 * 职责: 验证 TXT、DOCX、PDF 文本提取器的基础格式支持
 * 依赖内部: ../src/modules/document-import.ts
 * 依赖外部: node:assert, node:test, jszip
 * 暴露: 文档提取单元测试
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { extractDocumentText } from '../src/modules/document-import.js';

async function buildDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>First paragraph.</w:t></w:r></w:p>
      <w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p>
    </w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function buildPdf(): Buffer {
  const stream = 'BT /F1 12 Tf 72 720 Td (PDF paragraph text.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  offsets.forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test('TXT 和 DOCX 保留段落边界', async () => {
  const txt = await extractDocumentText('txt', Buffer.from('One. Two.\n\nThree.'));
  assert.equal(txt, 'One. Two.\n\nThree.');
  const docx = await extractDocumentText('docx', await buildDocx());
  assert.match(docx, /First paragraph\.\s*\n\s*\nSecond paragraph\./);
});

test('PDF 可以提取文字', async () => {
  const text = await extractDocumentText('pdf', buildPdf());
  assert.match(text, /PDF paragraph text\./);
});
