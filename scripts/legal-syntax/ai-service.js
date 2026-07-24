/**
 * 职责: 调用 OpenAI-compatible 接口并校验请求身份与结构化法律句法分析
 * 依赖内部: prompt.js, schema.js, tokenizer.js
 * 依赖外部: Fetch API, Web Crypto, localStorage
 * 暴露: analyseWithAI | loadApiPreferences | saveApiPreferences
 */

import { buildLockedPrompt } from './prompt.js';
import { parseAnalysisJson, validateAndAttachSource } from './schema.js';
import { formatTokensForPrompt } from './tokenizer.js';

const STORAGE_KEY = 'legal-syntax-lab-api-v1';
const REQUEST_TIMEOUT = 90000;
const DEFAULT_API_CONFIG = {
  endpoint: 'http://127.0.0.1:8765/api/legal-syntax-analysis',
  model: 'gemini-3-flash-preview',
};

export async function analyseWithAI({ source, tokens, userPrompt, config }) {
  validateConfig(config);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestAnalysis({ source, tokens, userPrompt, config });
    } catch (error) {
      lastError = error;
      if (attempt > 0 || !isConsistencyError(error)) throw error;
    }
  }
  throw lastError;
}

async function requestAnalysis({ source, tokens, userPrompt, config }) {
  const context = await buildRequestContext(source, tokens);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const request = createRequest(source, context, userPrompt, config, controller);
    const response = await fetch(config.endpoint, request);
    const payload = await readPayload(response);
    const content = getMessageContent(payload);
    return validateAndAttachSource(
      parseAnalysisJson(content), source, context.tokens, context.identity,
    );
  } catch (error) {
    throw normalizeRequestError(error, config.endpoint);
  } finally {
    clearTimeout(timeoutId);
  }
}

function createRequest(source, context, userPrompt, config, controller) {
  const formattedTokens = formatTokensForPrompt(context.tokens);
  const tokenRange = {
    first: context.tokens[0]?.id,
    last: context.tokens.at(-1)?.id,
  };
  const body = {
    model: config.model,
    temperature: 0,
    messages: requestMessages(source, formattedTokens, tokenRange, context.identity, userPrompt),
  };
  return {
    method: 'POST',
    signal: controller.signal,
    headers: createHeaders(config.apiKey),
    body: JSON.stringify(body),
  };
}

function requestMessages(source, formattedTokens, tokenRange, identity, userPrompt) {
  return [
    {
      role: 'system',
      content: buildLockedPrompt(source, formattedTokens, tokenRange, identity),
    },
    {
      role: 'user',
      content: `请按以下可编辑要求分析系统消息中的原文：\n\n${userPrompt}`,
    },
  ];
}

async function buildRequestContext(source, tokens) {
  const requestId = `q${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const sourceFingerprint = await sha256(source);
  const namespaced = tokens.map((token) => ({
    ...token,
    id: `${requestId}_${token.id}`,
  }));
  return {
    tokens: namespaced,
    identity: { requestId, sourceFingerprint },
  };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeRequestError(error, endpoint) {
  if (error.name === 'AbortError') return new Error('AI 请求超时，请稍后重试。');
  if (error instanceof TypeError && endpoint.includes('127.0.0.1')) {
    return new Error('本机 Gemini 服务未启动，请运行 start-legal-syntax-lab.bat。');
  }
  return error;
}

function isConsistencyError(error) {
  return error.message.includes('请求身份')
    || error.message.includes('surface_text')
    || error.message.includes('schema_version');
}

function createHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function readPayload(response) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`接口返回了非 JSON 响应（HTTP ${response.status}）。`);
  }
  if (!response.ok) throw new Error(payload.error?.message || `AI 请求失败（HTTP ${response.status}）。`);
  return payload;
}

function getMessageContent(payload) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((item) => item.text || '').join('');
  throw new Error('接口响应中没有 choices[0].message.content。');
}

function validateConfig(config) {
  if (!config.endpoint || !config.model) {
    throw new Error('请先配置接口地址和模型名称。');
  }
}

export function loadApiPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.endpoint && saved?.model) return saved;
  } catch {
    // 配置损坏时回退到本机 Gemini 代理。
  }
  return { ...DEFAULT_API_CONFIG };
}

export function saveApiPreferences(config) {
  const safeConfig = { endpoint: config.endpoint, model: config.model };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeConfig));
}