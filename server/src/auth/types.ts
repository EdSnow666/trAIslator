/**
 * 职责: 定义认证用户、角色和 Fastify 请求扩展
 * 依赖内部: 无
 * 依赖外部: fastify
 * 暴露: RoleCode | AuthUser | SessionIdentity
 */

export type RoleCode = 'admin' | 'teacher' | 'student' | 'experiment_user';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
  roles: RoleCode[];
}

export interface SessionIdentity {
  sessionId: string;
  user: AuthUser;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null;
    authSessionId: string | null;
  }
}