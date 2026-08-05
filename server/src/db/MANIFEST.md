# SQLite 基础设施清单

| 文件 | 职责 |
|---|---|
| `database.ts` | 打开数据库，强制外键、WAL、FULL 同步和最低 SQLite 版本 |
| `migrations.ts` | 按文件顺序执行 migration，并校验不可变 checksum |
| `backup.ts` | 使用 SQLite Online Backup API 创建可校验快照，并在迁移失败后恢复原业务库 |
| `instance.ts` | 维护本地或云端实例身份 |
| `../../migrations/0004_server_model_configs.sql` | 新增统一服务器模型配置，并扩展 AI 运行的配置与重试字段 |
| `../../migrations/0005_project_resources.sql` | 新增项目创建来源、隐藏个人工作区班级及可版本化冷启动任务书 |

约束：生产服务启动不自动迁移；必须先由无用户 Token 的 `db:deploy` 运维命令完成备份、migration 与完整性检查。
