/**
 * 职责: 组装 Fastify、Cookie Session、业务 API 和受控静态资源服务
 * 依赖内部: ./auth, ./context.ts, ./errors.ts, ./modules
 * 依赖外部: fastify, @fastify/cookie, @fastify/multipart, @fastify/static, node:fs, node:path
 * 暴露: buildServer
 */

import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attachSession } from './auth/authorization.js';
import { registerAuthRoutes } from './auth/routes.js';
import { appConfig } from './config.js';
import { createAppContext } from './context.js';
import { AppError } from './errors.js';
import { registerActivityRoutes } from './modules/activity-routes.js';
import { registerAiRoutes } from './modules/ai-routes.js';
import { registerApiKeyRoutes } from './modules/api-key-routes.js';
import { registerAdminRoutes } from './modules/admin-routes.js';
import { registerDocumentImportRoutes } from './modules/document-import.js';
import { registerProjectRoutes } from './modules/project-routes.js';
import { registerPromptRoutes } from './modules/prompt-routes.js';
import { registerResourceImportRoutes } from './modules/resource-import-routes.js';
import { registerTeachingRoutes } from './modules/teaching-routes.js';
import { registerTranslationRoutes } from './modules/translation-routes.js';

function registerApi(app: FastifyInstance, context: ReturnType<typeof createAppContext>): void {
  registerAuthRoutes(app, context);
  registerAiRoutes(app, context);
  registerApiKeyRoutes(app, context);
  registerAdminRoutes(app, context);
  registerTeachingRoutes(app, context);
  registerProjectRoutes(app, context);
  registerPromptRoutes(app, context);
  registerResourceImportRoutes(app, context);
  registerTranslationRoutes(app, context);
  registerActivityRoutes(app, context);
  registerDocumentImportRoutes(app, context);
}

async function registerStaticAssets(app: FastifyInstance): Promise<void> {
  await app.register(staticFiles, { root: resolve(appConfig.rootDir, 'styles'), prefix: '/styles/' });
  await app.register(staticFiles, { root: resolve(appConfig.rootDir, 'scripts'), prefix: '/scripts/', decorateReply: false });
  const sendHtml = (name: string) => readFileSync(resolve(appConfig.rootDir, name), 'utf8');
  app.get('/', async (_request, reply) => reply.type('text/html').send(sendHtml('index.html')));
  app.get('/index.html', async (_request, reply) => reply.type('text/html').send(sendHtml('index.html')));
  app.get('/legal-syntax-lab.html', async (_request, reply) => reply.type('text/html').send(sendHtml('legal-syntax-lab.html')));
}

function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof AppError) return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    if (typeof error === 'object' && error !== null && 'code' in error
      && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return reply.code(409).send({ error: 'CONFLICT', message: '数据已存在或发生版本冲突。' });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: '服务器处理失败。' });
  });
}

export async function buildServer(databasePath?: string,
  logger = appConfig.environment !== 'test'): Promise<FastifyInstance> {
  const context = createAppContext(databasePath, appConfig.environment !== 'production');
  const app = Fastify({ logger });
  await app.register(cookie);
  await app.register(multipart, { limits: { files: 1, fileSize: 20 * 1024 * 1024, parts: 1 } });
  app.decorateRequest('authUser', null);
  app.decorateRequest('authSessionId', null);
  app.addHook('onRequest', async (request) => attachSession(context, request));
  app.get('/api/health', async () => ({ ok: true, release: appConfig.releaseVersion,
    sqliteVersion: context.db.prepare('SELECT sqlite_version() AS version').get() }));
  registerApi(app, context);
  await registerStaticAssets(app);
  registerErrorHandler(app);
  app.addHook('onClose', async () => context.db.close());
  return app;
}
