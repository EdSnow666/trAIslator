# trAIslator — Translation AIducator

面向英中、中英翻译教学的 Prompt 驱动型 CAT 软件 Demo。该版本是项目的**第一个可路演 Demo 版本**，重点演示“Prompt 版本—AI 译文—人工译后编辑—AI 译后编辑”之间的可追溯关系。

## Demo 功能

- 类 CAT 的双语句段编辑界面
- Prompt 谱系、完整快照与译文版本绑定
- 学生 Prompt 默认私有，可主动提交；教师可审阅并发布为项目 overarching Prompt
- AI 译后编辑建议、逐项接受/拒绝和 Diff
- 人工译后编辑与全部版本对比
- 术语库、翻译记忆和 AI Prompt 教练入口
- 预存英中、中英文本，以及课堂路演项目
- 双模式运行：后端离线时使用浏览器本地 Demo；登录服务器后加载账号可见项目和个人工作空间
- 登录服务器后，“保存译后编辑”创建不可变数据库版本，切换当前译文与 AI 决策同步记录
- 顶部“管理”菜单集中教学管理与统一服务器模型；独立“项目 → 项目管理”弹窗负责项目发布、取消发布和软删除，管理员额外管理账号与随机密码
- 管理员和教师可配置统一 OpenAI-compatible 服务器模型；服务器模式支持真实翻译与 AI 译后编辑，本地 Demo 继续使用模拟数据
- 所有已登录用户可在顶栏管理个人 API Key；Key 加密保存、不回显，并默认不随业务数据迁移导出
- 项目采用“双路径”模型：先新建可独立编辑的本地项目，再按需把同一项目发布并分配到一个或多个班级
- 新建项目可采样原文前 10 段生成冷启动任务书和全文 Prompt，也可继承既有版本或手动填写；任务书后续修改保留版本链

## 本机运行

项目使用原生 HTML、CSS 和 JavaScript。由于页面采用 ES Modules，请通过本地静态服务器运行：

```powershell
python -m http.server 8770
```

然后访问：

```text
http://127.0.0.1:8770/
```

## 数据说明

- 演示状态默认保存在浏览器 `localStorage`。
- `.env`、实验目录和本机测试产物不会提交。
- 人工参考译文标记为“参考译文 / 人工翻译”，不绑定 Prompt，也不会取代当前 AI 译后编辑版本。

## 版本

`v0.1.0-demo` — 第一个可路演 Demo 版本。

## 发布版后端

后端采用 Node.js + Fastify + 单个 SQLite 数据库。所有业务表共享一个数据库，用户隔离由后端授权查询统一执行；管理员可跨用户审计，教师只可管理自己负责的班级、项目和学生主动提交的 Prompt。

首次本地启动：

```powershell
npm.cmd install
npm.cmd run db:deploy
npm.cmd run db:seed-demo
npm.cmd run admin:init -- --username admin --display-name "系统管理员"
npm.cmd run dev
```

`admin:init` 会生成一次性随机初始密码。首次网页登录后必须修改密码，Session 固定有效 24 小时。若管理员登录态丢失，可在服务器终端运行：

```powershell
npm.cmd run admin:reset-password -- --username admin
```

该恢复过程不需要任何用户 Token。

### 云端迁移规则

1. 进入维护模式并停止写入。
2. 对云端业务数据库执行在线备份。
3. 部署新的应用代码和静态资源，但绝不复制本地 `.db` 文件到云端。
4. 在云端执行 `npm.cmd run db:deploy`；迁移器直接操作云端数据库，不使用多用户 Token。
   migration 失败时命令会关闭数据库并从迁移前快照自动恢复；数据库包含当前程序不认识的更高版本 migration 时会拒绝启动和升级。
5. 通过完整性检查后启动应用并做登录、保存译后编辑烟雾测试。

云端启用后，云端用户、密码、管理员与业务数据均为权威源。本地开发库只用于迁移验证和模板开发，不提供覆盖云端业务库的发布入口。个人 API Key 使用 AES-256-GCM 加密；未设置 `PERSONAL_KEY_MASTER_KEY` 时该功能关闭，数据迁移工具默认不应导出个人 Key。

### 本地模型主密钥

开发环境未配置 `SERVER_MODEL_MASTER_KEY` 或 `PERSONAL_KEY_MASTER_KEY` 时，首次保存统一服务器模型会在 `data/server-model-master.key` 自动生成本机主密钥。该文件已被 Git 忽略，不随数据库备份或云端迁移。

生产环境不会自动生成主密钥，必须通过服务器环境变量提供 `SERVER_MODEL_MASTER_KEY`；发布应用代码与数据库迁移均不得覆盖云端主密钥和业务数据库。

### 验证

```powershell
npm.cmd run typecheck
npm.cmd test
```

集成测试覆盖随机管理员、首次改密、24 小时 Session、失效 Session 下无 Token 迁移、教师/学生/实验用户隔离、班级与实验管理、本地项目创建与班级分配、任务书/全文 Prompt 生成与继承、学生 Prompt 私有与主动提交、AI/人工译文幂等版本、无密钥导出、迁移失败恢复、过高数据库版本拒绝启动、备份和数据库完整性。
