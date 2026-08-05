/**
 * 职责: 构建不包含登录凭据、Token 或 API Key 的项目导出副本
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: buildProjectExportArtifact
 */

function isSensitiveKey(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (['iv', 'token', 'cookie', 'authorization', 'ciphertext', 'authtag', 'secret'].includes(normalized)) return true;
  if (normalized.includes('apikey') || normalized.endsWith('token')) return true;
  return normalized.endsWith('secret') || normalized.endsWith('ciphertext') || normalized.startsWith('cookie');
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !isSensitiveKey(key))
    .map(([key, item]) => [key, sanitize(item)]));
}

export function buildProjectExportArtifact(project) {
  return { schema: 'translation-aiducator.project-export.v1',
    generatedAt: new Date().toISOString(), project: sanitize(project) };
}