/**
 * 职责: 接收 TXT、DOCX、PDF 文件并提取适合按段落切分的纯文本
 * 依赖内部: ../auth/authorization.ts, ../context.ts, ../errors.ts, ./activity.ts
 * 依赖外部: fastify, @fastify/multipart, mammoth, pdf-parse
 * 暴露: registerDocumentImportRoutes | extractDocumentText
 */

import type { MultipartFile } from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { requireReadyAccount } from '../auth/authorization.js';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { recordActivity } from './activity.js';

type ImportFormat = 'txt' | 'docx' | 'pdf';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 2_000_000;
const END_PUNCTUATION = /[.!?。！？；:：]["'”’）)]?$/u;

function importFormat(filename: string): ImportFormat {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension === 'txt' || extension === 'docx' || extension === 'pdf') return extension;
  throw new AppError(415, 'UNSUPPORTED_DOCUMENT', '仅支持 TXT、DOCX 和 PDF 文件。');
}

function normalizeText(text: string): string {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) throw new AppError(422, 'EMPTY_DOCUMENT', '文档中没有提取到可导入的文字。');
  if (normalized.length > MAX_EXTRACTED_CHARS) {
    throw new AppError(413, 'DOCUMENT_TEXT_TOO_LARGE', '文档文字超过 200 万字符，请拆分后导入。');
  }
  return normalized;
}

function joinWrappedLines(lines: string[]): string {
  return lines.reduce((result, line) => {
    if (!result) return line;
    if (result.endsWith('-')) return result.slice(0, -1) + line;
    if (/\p{Script=Han}$/u.test(result) && /^\p{Script=Han}/u.test(line)) return result + line;
    return result + ' ' + line;
  }, '');
}

function medianLineLength(lines: string[]): number {
  const lengths = lines.map((line) => line.length).sort((a, b) => a - b);
  return lengths[Math.floor(lengths.length / 2)] || 1;
}

function looksLikeHeading(line: string, median: number): boolean {
  return line.length <= Math.min(60, median * 0.55) && !END_PUNCTUATION.test(line);
}

function inferPdfParagraphs(lines: string[]): string[] {
  const median = medianLineLength(lines);
  const paragraphs: string[] = [];
  let current: string[] = [];
  lines.forEach((line, index) => {
    current.push(line);
    const next = lines[index + 1];
    const shortEnding = line.length < median * 0.72 && END_PUNCTUATION.test(line);
    if (!next || shortEnding || looksLikeHeading(line, median) || looksLikeHeading(next, median)) {
      paragraphs.push(joinWrappedLines(current));
      current = [];
    }
  });
  return paragraphs.filter(Boolean);
}

function pdfPageParagraphs(text: string): string[] {
  const blocks = text.trim().split(/\n\s*\n+/).map((item) => item.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks.map((block) => joinWrappedLines(block.split(/\n+/).map((line) => line.trim())));
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return inferPdfParagraphs(lines);
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ pageJoiner: '' });
    return result.pages.flatMap((page) => pdfPageParagraphs(page.text)).join('\n\n');
  } finally {
    await parser.destroy();
  }
}

export async function extractDocumentText(format: ImportFormat, buffer: Buffer): Promise<string> {
  if (format === 'txt') return normalizeText(buffer.toString('utf8'));
  if (format === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeText(result.value);
  }
  return normalizeText(await extractPdf(buffer));
}

function validateSignature(format: ImportFormat, buffer: Buffer): void {
  if (format === 'pdf' && !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new AppError(422, 'INVALID_PDF', '文件扩展名是 PDF，但内容不是有效的 PDF。');
  }
  if (format === 'docx' && !buffer.subarray(0, 2).equals(Buffer.from('PK'))) {
    throw new AppError(422, 'INVALID_DOCX', '文件扩展名是 DOCX，但内容不是有效的 Word 文档。');
  }
}

async function receiveUpload(request: FastifyRequest): Promise<{ file: MultipartFile; buffer: Buffer }> {
  try {
    const file = await request.file({ limits: { files: 1, fileSize: MAX_UPLOAD_BYTES } });
    if (!file) throw new AppError(400, 'FILE_REQUIRED', '请选择要导入的文件。');
    return { file, buffer: await file.toBuffer() };
  } catch (error) {
    if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new AppError(413, 'FILE_TOO_LARGE', '文件超过 20 MB，请拆分后导入。');
    }
    throw error;
  }
}

function paragraphCount(text: string): number {
  return text.split(/\n\s*\n+/).filter((item) => item.trim()).length;
}

export function registerDocumentImportRoutes(app: FastifyInstance, context: AppContext): void {
  app.post('/api/import/extract', { preHandler: requireReadyAccount }, async (request) => {
    const upload = await receiveUpload(request);
    const format = importFormat(upload.file.filename);
    validateSignature(format, upload.buffer);
    const text = await extractDocumentText(format, upload.buffer);
    const count = paragraphCount(text);
    recordActivity(context, { eventType: 'document.text_extracted',
      actorUserId: request.authUser!.id, actorSessionId: request.authSessionId,
      metadata: { filename: upload.file.filename, format, bytes: upload.buffer.length, paragraphCount: count } });
    return { filename: upload.file.filename, format, text, paragraphCount: count };
  });
}
