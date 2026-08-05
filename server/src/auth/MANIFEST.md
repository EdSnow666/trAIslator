# 认证与授权清单

| 文件 | 职责 |
|---|---|
| `types.ts` | 用户身份、四种角色和 Fastify 请求扩展 |
| `password.ts` | 随机初始密码及 Argon2id 哈希 |
| `repository.ts` | 凭据、角色与 24 小时不透明 Session |
| `authorization.ts` | 登录、首次改密和角色门禁 |
| `routes.ts` | 登录、当前身份、退出和修改密码 API |

约束：管理员恢复走服务器 CLI，不依赖任何网页登录态或用户 Token；业务 API 不接受前端传入的 userId 作为授权依据。
