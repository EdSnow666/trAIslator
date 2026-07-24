/**
 * 职责: 在本机提供静态页面和不暴露密钥的 Gemini 代理
 * 依赖内部: legal-syntax-lab.html 及其静态资源
 * 依赖外部: Node.js http, fs, fetch
 * 暴露: http://127.0.0.1:8765 与 /api/legal-syntax-analysis
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.LEGAL_SYNTAX_PORT || 8765);
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = 'C:\\Users\\Edward Snow\\.claude\\skills\\batch-pdf-ocr\\scripts\\user_config.json';
const ENV_PATH = 'C:\\Users\\Edward Snow\\.claude\\skills\\batch-pdf-ocr\\.env';
const SLOT_NAME = process.env.LEGAL_SYNTAX_GEMINI_SLOT || 'wolfai-k2';
const MAX_BODY_BYTES = 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

function parseDotEnv(text) {
  const values = {};
  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  });
  return values;
}

function loadGeminiConfig() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const env = parseDotEnv(fs.readFileSync(ENV_PATH, 'utf8'));
  const slot = config.apis.find((item) => item.enabled === true && item.name === SLOT_NAME);
  if (!slot) throw new Error(`Gemini slot is unavailable: ${SLOT_NAME}`);
  const apiKey = env[slot.key_env] || process.env[slot.key_env];
  if (!apiKey) throw new Error(`Gemini key is unavailable for slot: ${SLOT_NAME}`);
  return { apiKey, baseUrl: slot.url, model: slot.model, slotName: slot.name };
}

function upstreamEndpoint(baseUrl) {
  const clean = baseUrl.replace(/\/+$/, '');
  return clean.endsWith('/v1') ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
}

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
}

function sendJson(response, status, body) {
  setCors(response);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) reject(new Error('Request body is too large.'));
      else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function validateProxyPayload(payload) {
  if (!Array.isArray(payload.messages) || payload.messages.length < 2) {
    throw new Error('messages must contain the locked prompt and user instructions.');
  }
  return {
    model: payload.model,
    temperature: 0,
    messages: payload.messages,
  };
}

async function proxyGemini(request, response, gemini) {
  try {
    const payload = validateProxyPayload(JSON.parse(await readRequestBody(request)));
    payload.model = gemini.model;
    const upstream = await fetch(upstreamEndpoint(gemini.baseUrl), createUpstreamRequest(payload, gemini.apiKey));
    const text = await upstream.text();
    setCors(response);
    response.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(text);
  } catch (error) {
    sendJson(response, 500, { error: { message: error.message } });
  }
}

function createUpstreamRequest(payload, apiKey) {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  };
}

function safeStaticPath(urlPath) {
  const requested = decodeURIComponent(urlPath.split('?')[0]);
  const relative = requested === '/' ? 'legal-syntax-lab.html' : requested.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relative);
  return resolved.startsWith(ROOT + path.sep) ? resolved : null;
}

function serveStatic(request, response) {
  const filePath = safeStaticPath(request.url);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendJson(response, 404, { error: { message: 'Not found.' } });
  }
  setCors(response);
  response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
  if (request.method === 'HEAD') return response.end();
  return fs.createReadStream(filePath).pipe(response);
}

function routeRequest(request, response, gemini) {
  if (request.method === 'OPTIONS') {
    setCors(response);
    response.writeHead(204);
    return response.end();
  }
  if (request.url.startsWith('/api/health')) {
    return sendJson(response, 200, { ok: true, slot: gemini.slotName, model: gemini.model });
  }
  if (request.url.startsWith('/api/legal-syntax-analysis') && request.method === 'POST') {
    return proxyGemini(request, response, gemini);
  }
  if (request.method === 'GET' || request.method === 'HEAD') return serveStatic(request, response);
  return sendJson(response, 405, { error: { message: 'Method not allowed.' } });
}

function startServer() {
  const gemini = loadGeminiConfig();
  const server = http.createServer((request, response) => routeRequest(request, response, gemini));
  server.listen(PORT, HOST, () => {
    console.log(`Legal Syntax Lab: http://${HOST}:${PORT}/legal-syntax-lab.html`);
    console.log(`Gemini: ${gemini.slotName} / ${gemini.model}`);
  });
}

startServer();
