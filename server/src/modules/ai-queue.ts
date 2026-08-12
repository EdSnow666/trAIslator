/**
 * 职责: 串行调度全站 AI 请求，提供排队位次、管理员插队、取消与模型失败冷却
 * 依赖内部: ../auth/types.ts, ../errors.ts
 * 依赖外部: 无
 * 暴露: enqueueAiRequest | aiQueueStatus | prioritizeAiRequest | cancelAiQueueRequest | 模型冷却状态
 */

import type { AuthUser } from '../auth/types.js';
import { AppError } from '../errors.js';

type QueueState = 'waiting' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface AiQueueStatus {
  requestId: string; operation: string; state: QueueState; ahead: number;
  estimatedWaitSeconds: number; canPrioritize: boolean;
}
interface QueueEntry {
  key: string; requestId: string; userId: string; operation: string; resourceKey: string;
  priority: number; sequence: number; state: QueueState; queuedAt: number; startedAt?: number;
  completedAt?: number; task: () => Promise<unknown>; resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const maxConcurrency = Math.max(1, Math.floor(positiveNumber(process.env.AI_MAX_CONCURRENCY, 1)));
const entries = new Map<string, QueueEntry>();
const waiting: QueueEntry[] = [];
const cooldowns = new Map<string, { until: number; failures: number }>();
let running = 0;
let sequence = 0;
let averageDurationMs = 30000;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

export class AiQueueCancelledError extends Error {
  code = 'AI_REQUEST_CANCELLED';
  retryable = false;
  attempts = 0;
  constructor() { super('生成任务已取消。'); }
}

function entryKey(userId: string, requestId: string): string {
  return `${userId}:${requestId}`;
}

function sortWaiting(): void {
  waiting.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
}

export function aiResourceCooldownRemaining(resourceKey: string): number {
  return Math.max(0, (cooldowns.get(resourceKey)?.until || 0) - Date.now());
}

function scheduleWake(): void {
  if (wakeTimer || !waiting.length) return;
  const delays = waiting.map((entry) => aiResourceCooldownRemaining(entry.resourceKey)).filter(Boolean);
  if (!delays.length) return;
  wakeTimer = setTimeout(() => { wakeTimer = null; drainQueue(); }, Math.min(...delays));
}

function nextReadyEntry(): QueueEntry | undefined {
  sortWaiting();
  const index = waiting.findIndex((entry) => aiResourceCooldownRemaining(entry.resourceKey) === 0);
  if (index < 0) return undefined;
  return waiting.splice(index, 1)[0];
}

export function cooldownAiResource(resourceKey: string): void {
  const previous = cooldowns.get(resourceKey)?.failures || 0;
  const failures = Math.min(previous + 1, 4);
  const delay = Math.min(60000, positiveNumber(process.env.AI_COOLDOWN_BASE_MS, 5000)
    * (2 ** (failures - 1)));
  cooldowns.set(resourceKey, { failures, until: Date.now() + delay });
}

export function clearAiResourceCooldown(resourceKey: string): void {
  cooldowns.delete(resourceKey);
}

function completeEntry(entry: QueueEntry, state: QueueState): void {
  entry.state = state;
  entry.completedAt = Date.now();
  if (entry.startedAt) {
    const duration = entry.completedAt - entry.startedAt;
    averageDurationMs = Math.round((averageDurationMs * 3 + duration) / 4);
  }
  setTimeout(() => entries.delete(entry.key), 10 * 60 * 1000).unref?.();
}

async function runEntry(entry: QueueEntry): Promise<void> {
  entry.state = 'running'; entry.startedAt = Date.now(); running += 1;
  try {
    const result = await entry.task();
    clearAiResourceCooldown(entry.resourceKey);
    completeEntry(entry, 'succeeded'); entry.resolve(result);
  } catch (error) {
    const cancelled = error instanceof AiQueueCancelledError
      || (error as { code?: string })?.code === 'AI_REQUEST_CANCELLED';
    if (!cancelled) cooldownAiResource(entry.resourceKey);
    completeEntry(entry, cancelled ? 'cancelled' : 'failed'); entry.reject(error);
  } finally { running -= 1; drainQueue(); }
}

function drainQueue(): void {
  while (running < maxConcurrency) {
    const entry = nextReadyEntry();
    if (!entry) { scheduleWake(); return; }
    void runEntry(entry);
  }
}

export function enqueueAiRequest<T>(user: AuthUser, requestId: string, operation: string,
  resourceKey: string, task: () => Promise<T>): Promise<T> {
  const key = entryKey(user.id, requestId);
  if (entries.has(key)) throw new AppError(409, 'AI_QUEUE_DUPLICATE', '该 AI 请求已在队列中。');
  return new Promise<T>((resolve, reject) => {
    const entry: QueueEntry = { key, requestId, userId: user.id, operation, resourceKey,
      priority: 0, sequence: sequence += 1, state: 'waiting', queuedAt: Date.now(),
      task, resolve: (value) => resolve(value as T), reject };
    entries.set(key, entry); waiting.push(entry); drainQueue();
  });
}

function visibleEntry(user: AuthUser, requestId: string): QueueEntry {
  const entry = entries.get(entryKey(user.id, requestId));
  if (!entry) throw new AppError(404, 'AI_QUEUE_JOB_NOT_FOUND', '排队任务不存在或已过期。');
  return entry;
}

export function aiQueueStatus(user: AuthUser, requestId: string): AiQueueStatus {
  const entry = visibleEntry(user, requestId);
  const ahead = entry.state === 'waiting' ? waiting.filter((item) => item !== entry
    && (item.priority > entry.priority || (item.priority === entry.priority
      && item.sequence < entry.sequence))).length + running : 0;
  return { requestId, operation: entry.operation, state: entry.state, ahead,
    estimatedWaitSeconds: Math.ceil((ahead * averageDurationMs
      + aiResourceCooldownRemaining(entry.resourceKey)) / 1000),
    canPrioritize: entry.state === 'waiting'
      && user.roles.some((role) => ['admin', 'teacher'].includes(role)) };
}

export function prioritizeAiRequest(user: AuthUser, requestId: string): AiQueueStatus {
  const entry = visibleEntry(user, requestId);
  if (!user.roles.some((role) => ['admin', 'teacher'].includes(role))) {
    throw new AppError(403, 'AI_QUEUE_PRIORITY_FORBIDDEN', '只有教师或管理员可以插队。');
  }
  if (entry.state === 'waiting') { entry.priority = 100; entry.sequence = 0; drainQueue(); }
  return aiQueueStatus(user, requestId);
}

export function cancelAiQueueRequest(user: AuthUser, requestId: string): boolean {
  const entry = entries.get(entryKey(user.id, requestId));
  if (!entry || entry.state !== 'waiting') return false;
  const index = waiting.indexOf(entry);
  if (index >= 0) waiting.splice(index, 1);
  completeEntry(entry, 'cancelled'); entry.reject(new AiQueueCancelledError());
  drainQueue(); return true;
}
