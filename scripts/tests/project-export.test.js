/**
 * 职责: 验证项目导出不会包含 Token、Cookie、加密字段或 API Key
 * 依赖内部: ../services/project-export.js
 * 依赖外部: node:assert, node:test
 * 暴露: 项目导出安全测试
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectExportArtifact } from '../services/project-export.js';

test('项目导出递归排除 Token 和 API Key', () => {
  const artifact = buildProjectExportArtifact({ id: 'project-1', name: '安全导出',
    apiKey: 'secret-api', personalApiKey: 'compound-api', nested: { token: 'secret-token',
      accessToken: 'compound-token', cookie: 'secret-cookie', ciphertext: 'sealed',
      iv: 'vector', authTag: 'tag', clientSecret: 'client-secret', tokenUsage: 42, content: '保留正文' } });
  const json = JSON.stringify(artifact);
  for (const secret of ['secret-api', 'compound-api', 'secret-token', 'compound-token', 'secret-cookie', 'sealed',
    'vector', 'tag', 'client-secret']) {
    assert.equal(json.includes(secret), false);
  }
  assert.equal(artifact.project.nested.content, '保留正文');
  assert.equal(artifact.project.nested.tokenUsage, 42);
});