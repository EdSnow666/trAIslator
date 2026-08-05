/**
 * 职责: 提供后端通用 ID、时间、哈希与 JSON 工具
 * 依赖内部: 无
 * 依赖外部: node:crypto
 * 暴露: newId | nowIso | sha256 | jsonText
 */

import { createHash, randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function jsonText(value: unknown): string {
  return JSON.stringify(value ?? {});
}