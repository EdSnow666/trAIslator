/**
 * 职责: 生成随机初始密码并使用 Argon2id 安全哈希和校验
 * 依赖内部: 无
 * 依赖外部: argon2, node:crypto
 * 暴露: hashPassword | verifyPassword | randomInitialPassword
 */

import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

export function randomInitialPassword(): string {
  return randomBytes(18).toString('base64url');
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}