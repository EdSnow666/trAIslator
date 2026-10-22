/**
 * 职责: 识别 AI 生成请求并轮询统一队列状态
 * 依赖内部: 无
 * 依赖外部: Fetch API, CustomEvent
 * 暴露: beginAiQueueWatch
 */

const generationPaths = [
  /\/ai\/execute(?:-full)?$/,
  /\/(?:brief|prompt)\/generate$/,
  /\/prompt-coach(?:\/projects)?$/,
  /\/prompt-coach\/instruction\/generate$/,
];

function requestIdFromOptions(options) {
  if (typeof options.body !== 'string') return '';
  try { return JSON.parse(options.body)?.requestId || ''; } catch { return ''; }
}

function isGenerationPath(path) {
  return generationPaths.some((pattern) => pattern.test(path));
}

function emitQueueStatus(detail) {
  window.dispatchEvent(new CustomEvent('ai-queue-status', { detail }));
}

async function readQueueStatus(requestId) {
  const response = await fetch(`/api/ai/queue/${encodeURIComponent(requestId)}`, {
    credentials: 'same-origin',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('队列状态读取失败');
  return response.json();
}

export function beginAiQueueWatch(path, options) {
  const requestId = requestIdFromOptions(options);
  if (!requestId || !isGenerationPath(path)) return null;
  let stopped = false; let timer = null;
  const poll = async () => {
    if (stopped) return;
    try {
      const status = await readQueueStatus(requestId);
      if (status) emitQueueStatus(status);
    } catch { /* 主请求仍负责呈现实际错误。 */ }
    if (!stopped) timer = window.setTimeout(poll, 500);
  };
  poll();
  return {
    requestId,
    stop() {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      window.setTimeout(() => emitQueueStatus({ requestId, state: 'hidden' }), 900);
    },
  };
}
