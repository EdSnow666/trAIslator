# SQLite 基础设施清单

| 文件 | 职责 |
|---|---|
| `database.ts` | 打开数据库，强制外键、WAL、FULL 同步和最低 SQLite 版本 |
| `migrations.ts` | 按文件顺序执行 migration，并校验不可变 checksum |
| `backup.ts` | 使用 SQLite Online Backup API 创建可校验快照，并在迁移失败后恢复原业务库 |
| `instance.ts` | 维护本地或云端实例身份 |
| `../../migrations/0004_server_model_configs.sql` | 新增统一服务器模型配置，并扩展 AI 运行的配置与重试字段 |
| `../../migrations/0005_project_resources.sql` | 新增项目创建来源、隐藏个人工作区班级及可版本化冷启动任务书 |
| `../../migrations/0006_prompt_archives.sql` | Prompt 安全归档与恢复记录 |
| `../../migrations/0007_prompt_kinds.sql` | 分离翻译/译后编辑 Prompt 谱系和工作空间当前指针 |
| `../../migrations/0008_translation_submissions.sql` | 学生译文主动提交及教师/管理员跨工作空间查看索引 |
| `../../migrations/0009_translation_traceability.sql` | 译文根版本/机器比较基线、持久化 Diff、精确工作流事件与 AI 决策历史 |
| `../../migrations/0010_full_translation_batches.sql` | 全文 JSON 翻译与译后编辑批次的段落计数、ID 校验结果与响应哈希审计 |
| `../../migrations/0011_class_ai_coach_and_a36_recovery.sql` | 班级 AI 译后编辑策略、Prompt Coach 运行快照及 Article 36 人工 Diff 恢复 |
| `../../migrations/0012_addressing_workspace_prompt_coach.sql` | 将 Article 36 已恢复人工 Diff 重新挂接到管理员工作空间并标记为已确认，供 Prompt Coach 使用 |
| `../../migrations/0013_multi_project_prompt_coach.sql` | 多项目 Prompt Coach 范围、用户可编辑教练 Prompt 偏好及每次运行的实际 Prompt/项目快照 |
| `../../migrations/0014_personal_key_connection.sql` | 为个人 Key 补齐接口域名与模型名称元数据 |
| `../../migrations/0015_coach_prompt_versions.sql` | 教练 Prompt 不可变版本、当前版本指针、旧自定义偏好/运行快照回填及运行版本绑定 |
| `../../migrations/0016_coach_audit_events.sql` | 追加式保存教练逐次实际请求、原始 HTTP 响应、规则过滤轨迹与失败原因，保留原历史不回填虚构数据 |

约束：生产服务启动不自动迁移；必须先由无用户 Token 的 `db:deploy` 运维命令完成备份、migration 与完整性检查。
