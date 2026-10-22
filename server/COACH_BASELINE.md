# AI Prompt 教练稳定基线

基线编号：`example-backed-style-2026-10-22.v1`。实现源文件为 `src/modules/coach-baseline.ts`。

## 提取 Prompt

默认提取指令和系统格式约束逐字固定为 2026-10-22 带示例实测版本；回归测试使用 SHA-256 锁定文本，修改时应显式更新基线编号与测试。用户自定义指令优先，部署不覆盖任何账号已保存的私有版本或历史运行。

规则内容在同一个 `instruction` 字符串中包含适用条件、具体方法、真实 AI 原译与人工改写示例，以及示例说明。示例不拆到另一个字段，确保加入翻译或译后编辑 Prompt 草稿时完整携带。模型实际请求、原始响应与证据过滤记录沿用现有追加式审计。

## 模型原始输出契约

```json
{
  "rules": [{
    "id": "quote-attribution",
    "category": "口吻与语体",
    "title": "先交代说话者",
    "instruction": "引语较长时先交代说话者。\nAI 原译：……\n人工改写：……\n该例展示归属前置的方法。",
    "signal": "单例候选",
    "evidenceRecordIds": ["输入中真实存在的记录ID"]
  }]
}
```

这是格式说明，省略号不作为模型运行时的固定示例。运行时示例只能取自授权输入记录。保留自由类别、不设最低支持数、允许空规则数组；后端仅校验格式与证据，不增加风格分类或句法限制。

## 持久化输出契约

继续使用 `translation-aiducator.prompt-coach.v3`，`coachSpecVersion` 记录上述基线编号；`coachPromptSource` 和 `coachPromptVersionId` 标识本次实际使用的默认或私有 Prompt，不将自定义版本误当作默认基线。历史 JSON 不回写。

每条规范化规则保留 `id/category/title/instruction`，附加 `supportCount/supportTier/evidence`。`evidence` 保留实际原文、AI 译文、人工译文、Diff、记录 ID 和 signal。支持数按去重后的有效记录计算，降序排列；单例为 candidate，多例为 repeated。已有摘要、项目范围、时间、模型和历史审计结构不变。

## 已知验证范围

实测一次教练调用及四次重译（有例/无例各两次）。带示例能明显促使说话者前置和句式重组，但仍可能增写意象或遗漏细节；同段学习与重译尚未证明跨文章泛化。本次固定可复现基线，不更改全文重译或 AI 译后编辑系统指令，不自动生成业务译文。
