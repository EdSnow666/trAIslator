/**
 * 职责: 启动本地或云端 Translation AIducator HTTP 服务
 * 依赖内部: ./app.ts, ./config.ts
 * 依赖外部: 无
 * 暴露: 服务进程入口
 */

import { buildServer } from './app.js';
import { appConfig } from './config.js';

const app = await buildServer();

try {
  const address = await app.listen({ host: appConfig.host, port: appConfig.port });
  app.log.info(`Translation AIducator 已启动：${address}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}