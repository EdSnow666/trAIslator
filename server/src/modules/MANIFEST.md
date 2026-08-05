# 业务模块清单

| 文件组 | 职责 |
|---|---|
| `users.ts`、`admin-routes.ts` | 多角色账号、管理员跨用户查询和随机重置密码 |
| `teaching*.ts` | 班级清单、成员与已分配项目详情，以及实验、阶段、状态、受试者纳入和撤回 |
| `projects*.ts`、`project-resources.ts`、`project-snapshot.ts`、`template-clone.ts` | 本地项目创建、发布/取消发布与软删除、模板任务书目录、任务书/Prompt 初始化与失败降级、受管班级/实验分配、工作空间、CAT 快照与模板克隆 |
| `prompts*.ts` | 系统模板 Prompt 实体化继承、项目内递增版本、学生私有 Prompt、主动提交及教师 overarching Prompt 发布/取消 |
| `translations*.ts` | 不可变译文版本、当前指针、AI 决策和幂等保存 |
| `activity*.ts` | 有意义事件的追加式记录、管理员全局审计与教师受管范围审计 |
| `document-import.ts` | TXT、DOCX、PDF 文本提取、上传限制和导入事件记录 |
| `api-keys*.ts` | 个人模型 Key 的 AES-256-GCM 加密保存和所有者隔离 |
| `server-models.ts`、`ai*.ts`、`prompt-structures.ts`、`prompt-inspector.ts` | 教师/管理员统一模型配置、连接测试、加密 Key、真实分层 Prompt 调用、管理员发送结构检查、重试与 AI 运行追溯 |
| `access.ts` | 项目、班级和工作空间的统一授权边界 |

约束：新增跨用户查询必须通过管理员或项目管理者检查；Prompt 与译文版本只追加，不原地改写。
