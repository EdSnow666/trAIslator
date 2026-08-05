/**
 * 职责: 在导入弹窗中读取 TXT，并通过后端提取 DOCX、PDF 的段落文本
 * 依赖内部: 无
 * 依赖外部: Fetch API, File API, FormData
 * 暴露: extractImportFile
 */

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['txt', 'docx', 'pdf']);

function extensionOf(filename) {
  return filename.toLowerCase().split('.').pop() || '';
}

function validateFile(file) {
  const extension = extensionOf(file.name);
  if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error('仅支持 TXT、DOCX 和 PDF 文件。');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('文件超过 20 MB，请拆分后导入。');
  return extension;
}

async function responseData(response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `文件解析失败（${response.status}）`);
  return result;
}

async function extractRemoteFile(file) {
  const form = new FormData();
  form.append('file', file, file.name);
  let response;
  try {
    response = await fetch('/api/import/extract', {
      method: 'POST', credentials: 'same-origin', body: form,
    });
  } catch {
    throw new Error('DOCX/PDF 解析需要连接 Translation AIducator 后端。');
  }
  return responseData(response);
}

export async function extractImportFile(file) {
  const extension = validateFile(file);
  if (extension === 'txt') {
    const text = (await file.text()).replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('TXT 文件中没有可导入的文字。');
    return { filename: file.name, format: extension, text, paragraphCount: null };
  }
  return extractRemoteFile(file);
}
