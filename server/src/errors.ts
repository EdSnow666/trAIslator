/**
 * 职责: 定义可由 Fastify 统一转换为 HTTP 响应的业务错误
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: AppError
 */

export class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}