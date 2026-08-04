/**
 * 职责: 提供 Article 36 英中逐段三版本对比项目
 * 依赖内部: 无
 * 依赖外部: 无
 * 暴露: A36_PROJECT
 */

export const A36_PROJECT = {
  "id": "demo-a36-violence-against-children",
  "name": "Addressing Violence Against Children: Paraguayan University Students Step In",
  "direction": "EN → ZH",
  "sourceLang": "English",
  "targetLang": "简体中文",
  "activePromptId": "p-a36-f0-s1",
  "brief": {
    "genre": "联合国新闻特写",
    "skopos": "向中文公众介绍巴拉圭大学生参与预防暴力侵害儿童的行动",
    "audience": "中文公众与翻译课堂学习者",
    "register": "准确、清楚、凝练的新闻书面语",
    "strategy": "保留事实与引语归属，按中文信息推进调整句法结构"
  },
  "prompts": [
    {
      "id": "p-a36-f0-v0",
      "version": 1,
      "displayLabel": "F0-V0",
      "title": "Full-text baseline",
      "author": "实验项目",
      "role": "Prompt",
      "status": "published",
      "createdAt": "2026-07-29",
      "note": "面向中文公众的联合国新闻特写全文翻译基线。",
      "content": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。"
    },
    {
      "id": "p-a36-f0-s1",
      "version": 2,
      "displayLabel": "F0-S1",
      "title": "Grammar and concision refinement",
      "author": "实验项目",
      "role": "Prompt",
      "status": "published",
      "createdAt": "2026-07-30",
      "note": "强化语义骨架、结构动作与中文凝练度。",
      "content": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。"
    }
  ],
  "segments": [
    {
      "id": "a36-title",
      "unit": "A36-TITLE",
      "source": "Addressing Violence Against Children: Paraguayan University Students Step In",
      "status": "translated",
      "currentTranslationId": "a36-title-s1",
      "translations": [
        {
          "id": "a36-title-v0",
          "promptId": "p-a36-f0-v0",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "应对儿童暴力：巴拉圭大学生挺身而出",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-V0",
          "createdAt": "2026-07-29",
          "contextSnapshot": "整篇文章上下文 · F0 基线 Prompt"
        },
        {
          "id": "a36-title-s1",
          "promptId": "p-a36-f0-s1",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "应对针对儿童的暴力：巴拉圭大学生在行动",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-S1",
          "createdAt": "2026-07-30",
          "contextSnapshot": "16 个独立段落 · 结构与凝练 Prompt"
        },
        {
          "id": "a36-title-reference",
          "promptId": null,
          "promptSnapshot": "",
          "aiText": "抗击暴力侵害儿童，巴拉圭大学生在行动",
          "postEditText": "",
          "author": "用户手动翻译",
          "model": "人工参考译文",
          "createdAt": "参考译文",
          "contextSnapshot": "由用户手动翻译，不使用 Prompt。",
          "origin": "manual"
        }
      ]
    },
    {
      "id": "a36-p01",
      "unit": "A36-P01",
      "source": "“Violence against children is prevalent in each country where it is measured. Every survey conducted to date concerning violence against children has found that it is a significant and prevalent problem,” warns a UNICEF report about this situation in Latin America and the Caribbean. To contribute to addressing such issue, the University of the Southern Cone of the Americas (UCSA), a member institution of the United Nations Academic Impact (UNAI) in Paraguay, became part of the JERE Volunteer Program.",
      "status": "translated",
      "currentTranslationId": "a36-p01-s1",
      "translations": [
        {
          "id": "a36-p01-v0",
          "promptId": "p-a36-f0-v0",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "“在开展过评估的每一个国家，针对儿童的暴力行为都普遍存在。迄今为止进行的每项相关调查都显示，这是一个重大且普遍的问题。”联合国儿童基金会在一份关于拉丁美洲和加勒比地区状况的报告中警告道。为了协助解决这一问题，作为联合国学术影响在巴拉圭的成员机构，美洲南锥体大学加入了“JERE”志愿者项目。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-V0",
          "createdAt": "2026-07-29",
          "contextSnapshot": "整篇文章上下文 · F0 基线 Prompt"
        },
        {
          "id": "a36-p01-s1",
          "promptId": "p-a36-f0-s1",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "联合国儿童基金会一份关于拉丁美洲和加勒比地区状况的报告警告称：“在开展过相关评估的每一个国家，针对儿童的暴力行为都普遍存在。迄今为止开展的所有相关调查均表明，这是一个重大且普遍的问题。”为了助力解决这一问题，美洲南锥体大学加入了“JERE”志愿者项目。该大学是联合国学术影响在巴拉圭的成员机构。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-S1",
          "createdAt": "2026-07-30",
          "contextSnapshot": "16 个独立段落 · 结构与凝练 Prompt"
        },
        {
          "id": "a36-p01-reference",
          "promptId": null,
          "promptSnapshot": "",
          "aiText": "联合国儿童基金会一份有关拉丁美洲和加勒比地区情况的报告警示道：“在受调查的每个国家中，暴力侵害儿童行为均十分普遍。迄今为止，每一项儿童暴力行为调查都显示，这已经构成严重问题，且十分泛滥。”为协助解决这个问题，联合国学术影响 (UNAI)巴拉圭成员机构南美洲南部大学(UCSA)加入了JERE志愿者计划。",
          "postEditText": "",
          "author": "用户手动翻译",
          "model": "人工参考译文",
          "createdAt": "参考译文",
          "contextSnapshot": "由用户手动翻译，不使用 Prompt。",
          "origin": "manual"
        }
      ]
    },
    {
      "id": "a36-p02",
      "unit": "A36-P02",
      "source": "The program, created by the United Nations Children’s Fund (UNICEF) aims to prevent violence against children in the so-called ‘triple border’ of Argentina, Brazil, and Paraguay. JERE, which in the Guarani language means “spin,” helps train university students to prevent and reduce violence in vulnerable communities throughout the country using the UPSHIFT methodology. The latter, also developed by UNICEF, has already been used in other countries in the region, such as Guatemala and Nicaragua.",
      "status": "translated",
      "currentTranslationId": "a36-p02-s1",
      "translations": [
        {
          "id": "a36-p02-v0",
          "promptId": "p-a36-f0-v0",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "该项目由联合国儿童基金会设立，旨在预防阿根廷、巴西和巴拉圭交界所谓“三国边境”地区的儿童暴力行为。“JERE”在瓜拉尼语中意为“旋转”。该项目采用UPSHIFT方法培训大学生，以帮助预防和减少巴拉圭全国脆弱社区的暴力行为。这一方法同样由联合国儿童基金会开发，此前已在该地区的危地马拉和尼加拉瓜等其他国家得到应用。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-V0",
          "createdAt": "2026-07-29",
          "contextSnapshot": "整篇文章上下文 · F0 基线 Prompt"
        },
        {
          "id": "a36-p02-s1",
          "promptId": "p-a36-f0-s1",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "该项目由联合国儿童基金会发起，旨在阿根廷、巴西和巴拉圭交界的“三国边境”地区预防针对儿童的暴力行为。“JERE”在瓜拉尼语中意为“旋转”，该项目采用“UPSHIFT”方法培训大学生，以期预防和减少巴拉圭全国脆弱社区的暴力行为。这一方法同样由儿基会开发，此前已在危地马拉和尼加拉瓜等该地区其他国家应用。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-S1",
          "createdAt": "2026-07-30",
          "contextSnapshot": "16 个独立段落 · 结构与凝练 Prompt"
        },
        {
          "id": "a36-p02-reference",
          "promptId": null,
          "promptSnapshot": "",
          "aiText": "计划由联合国儿童基金会（UNICEF）创立，旨在于阿根廷、巴西和巴拉圭的“三重边境”内，预防暴力侵害儿童行为。JERE在瓜拉尼语中意指“旋转”。JERE计划培训大学生使用 UPSHIFT方法，在全国弱势社区预防并减少暴力行为。该方法同样由联合国儿童基金会设计，目前已经应用于地区内的其他国家，例如危地马拉和尼加拉瓜。",
          "postEditText": "",
          "author": "用户手动翻译",
          "model": "人工参考译文",
          "createdAt": "参考译文",
          "contextSnapshot": "由用户手动翻译，不使用 Prompt。",
          "origin": "manual"
        }
      ]
    },
    {
      "id": "a36-p03",
      "unit": "A36-P03",
      "source": "The goal is the development of soft skills such as leadership, teamwork, communication, innovation, and creativity among young people. According to its official description, “through a combination of outreach and inspiration, human-centered design workshops, mentorship and coaching and, in some cases, seed funding, participants gain valuable transferable skills.” Within that framework, UCSA has implemented three projects as a direct result of the capacity-building program in which the institution’s undergraduates were involved.",
      "status": "translated",
      "currentTranslationId": "a36-p03-s1",
      "translations": [
        {
          "id": "a36-p03-v0",
          "promptId": "p-a36-f0-v0",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "其目标是培养青年的领导力、团队合作、沟通、创新和创造力等软实力。根据官方介绍，“通过结合外展与启发活动、以人为本的设计工作坊、导师指导和教练辅导，并在某些情况下提供种子资金，参与者能够获得宝贵的、可迁移的技能。”在此框架下，美洲南锥体大学实施了三个项目，这些项目正是该校本科生参与上述能力建设项目所取得的直接成果。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-V0",
          "createdAt": "2026-07-29",
          "contextSnapshot": "整篇文章上下文 · F0 基线 Prompt"
        },
        {
          "id": "a36-p03-s1",
          "promptId": "p-a36-f0-s1",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "该项目的目标是培养青年的领导力、团队合作、沟通、创新和创造力等软实力。根据项目的官方介绍，“通过结合外联和启发活动、以人为中心的设计工作坊、导师辅导，并在某些情况下提供种子资金，参与者可以获得宝贵且可迁移的技能。”在此框架下，美洲南锥体大学的本科生参与了该能力建设项目，并直接促成该校实施了三个具体项目。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-S1",
          "createdAt": "2026-07-30",
          "contextSnapshot": "16 个独立段落 · 结构与凝练 Prompt"
        },
        {
          "id": "a36-p03-reference",
          "promptId": null,
          "promptSnapshot": "",
          "aiText": "计划的目标在于培养年轻人领导、团队合作、沟通、创新创造等软技能。官方描述为：“通过开展一系列外联活动，举办以创新、人本为核心的设计工作坊，加上辅导与培训，配给种子资金，赋予参与者宝贵且可迁移的技能。”得益于这个本科生能力培养计划，USCA根据上述UPSHIFT行动框架，展开了三个项目。",
          "postEditText": "",
          "author": "用户手动翻译",
          "model": "人工参考译文",
          "createdAt": "参考译文",
          "contextSnapshot": "由用户手动翻译，不使用 Prompt。",
          "origin": "manual"
        }
      ]
    },
    {
      "id": "a36-p04",
      "unit": "A36-P04",
      "source": "University students from UCSA received comprehensive instruction enabling them to raise awareness among impoverished and underprivileged communities in Paraguay regarding several critical issues of social nature affecting them, as well as the need to increase understanding among children, adolescents, parents, and caregivers. One of these projects was developed in the city of Luque within the small community of Tarumandy, in which over a hundred families depend on communal food services.",
      "status": "translated",
      "currentTranslationId": "a36-p04-s1",
      "translations": [
        {
          "id": "a36-p04-v0",
          "promptId": "p-a36-f0-v0",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "美洲南锥体大学的学生接受了全面培训，这使他们能够向巴拉圭贫困和弱势社区普及宣传影响居民的若干重大社会问题，并增进儿童、青少年、父母和看护者之间的理解。其中一个项目在卢克市的塔鲁曼迪小社区开展，那里有100多个家庭依靠社区公共餐饮服务维持生活。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-V0",
          "createdAt": "2026-07-29",
          "contextSnapshot": "整篇文章上下文 · F0 基线 Prompt"
        },
        {
          "id": "a36-p04-s1",
          "promptId": "p-a36-f0-s1",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "美洲南锥体大学的大学生接受了全面培训，从而能够帮助巴拉圭贫困和弱势社区了解影响自身的若干关键社会问题，并提高儿童、青少年、父母和照料者的认知。其中一个项目在卢克市的塔鲁曼迪社区开展，该社区是一个有百余户家庭依赖社区公共食堂的微型社区。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-S1",
          "createdAt": "2026-07-30",
          "contextSnapshot": "16 个独立段落 · 结构与凝练 Prompt"
        },
        {
          "id": "a36-p04-reference",
          "promptId": null,
          "promptSnapshot": "",
          "aiText": "经过全面指导，UCSA的学生深入了解了巴拉圭贫困弱势社区所面对的重大社会问题，并意识到当地儿童、青少年、父母和照顾者有必要进一步了解这些问题。卢克市有一个名叫塔鲁曼迪的小社区，内有超过一百个家庭依赖公共食物服务。其中一个项目便在这里展开。",
          "postEditText": "",
          "author": "用户手动翻译",
          "model": "人工参考译文",
          "createdAt": "参考译文",
          "contextSnapshot": "由用户手动翻译，不使用 Prompt。",
          "origin": "manual"
        }
      ]
    },
    {
      "id": "a36-p05",
      "unit": "A36-P05",
      "source": "The volunteer students delivered a series of in-person workshops on countering physical and psychological violence and used a wide range of recreational actions to expand the scope of their message, reaching 47 families with 89 children and young people between the ages of 2 and 17. In parallel, in the city of Asunción, the country's capital, the project ‘Angatu’ was implemented through field visits targeting individuals in Barrio San Francisco, addressing, among others, the issue of trafficking in persons.",
      "status": "translated",
      "currentTranslationId": "a36-p05-s1",
      "translations": [
        {
          "id": "a36-p05-v0",
          "promptId": "p-a36-f0-v0",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "志愿者学生举办了一系列线下工作坊以应对身体和心理暴力，并辅以丰富多样的娱乐活动来扩大宣传面，共覆盖了47个家庭，其中包括89名2至17岁的儿童和青少年。与此同时，在巴拉圭首都亚松森，志愿者通过对圣弗朗西斯科社区居民进行实地走访，实施了“Angatu”项目，重点解决包括人口贩运在内的问题。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-V0",
          "createdAt": "2026-07-29",
          "contextSnapshot": "整篇文章上下文 · F0 基线 Prompt"
        },
        {
          "id": "a36-p05-s1",
          "promptId": "p-a36-f0-s1",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "志愿者学生举办了一系列线下工作坊，教授如何应对身体和心理暴力，并辅以丰富的娱乐活动来扩大宣传影响，共覆盖47个家庭，涉及89名2至17岁的儿童和青年。与此同时，在巴拉圭首都亚松森，针对圣弗朗西斯科社区居民的“Angatu”项目通过实地走访开展，旨在解决人口贩运等问题。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-S1",
          "createdAt": "2026-07-30",
          "contextSnapshot": "16 个独立段落 · 结构与凝练 Prompt"
        },
        {
          "id": "a36-p05-reference",
          "promptId": null,
          "promptSnapshot": "",
          "aiText": "学生志愿者开展一系列面对面的工作坊，向当地家庭讲解如何对抗身体暴力和心理暴力，并采用多种娱乐活动广泛宣传，共触及47个家庭，包括89名儿童及青少年，他们的年龄界于2至17岁。与此同时，另一个名为“Angatu”的项目在巴拉圭首都亚松森的城市展开，实地访问圣弗朗西斯科社区民众，解决人口贩卖等问题。",
          "postEditText": "",
          "author": "用户手动翻译",
          "model": "人工参考译文",
          "createdAt": "参考译文",
          "contextSnapshot": "由用户手动翻译，不使用 Prompt。",
          "origin": "manual"
        }
      ]
    },
    {
      "id": "a36-p06",
      "unit": "A36-P06",
      "source": "Although this community in particular had, generally speaking, adequate infrastructure conditions, there was enough evidence of an alarming lack of sufficient knowledge on the subject of child exploitation and human trafficking. There was also a perceived deficit detected concerning psychological support for children and adolescents and an overall hostile environment for many of them. With this in mind, UCSA volunteer students used the “teaching through fiction” approach, called “superhero training.”",
      "status": "translated",
      "currentTranslationId": "a36-p06-s1",
      "translations": [
        {
          "id": "a36-p06-v0",
          "promptId": "p-a36-f0-v0",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "尽管该社区的基础设施条件总体较好，但有充分证据表明，居民对儿童剥削和人口贩运知识的匮乏程度令人担忧。此外，儿童和青少年心理支持明显不足，许多人所处的环境也较为恶劣。针对这一情况，美洲南锥体大学的志愿者学生采用了名为“超级英雄训练”的“虚构情境教学”方法。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-V0",
          "createdAt": "2026-07-29",
          "contextSnapshot": "整篇文章上下文 · F0 基线 Prompt"
        },
        {
          "id": "a36-p06-s1",
          "promptId": "p-a36-f0-s1",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "尽管该社区的基础设施条件总体较好，但迹象表明，当地对儿童剥削和人口贩运问题的认识严重匮乏。此外，针对儿童和青少年的心理支持明显不足，许多孩子所处的整体环境较为恶劣。为此，美洲南锥体大学的志愿者学生采用了“角色扮演教学法”，开展了名为“超级英雄训练”的活动。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-S1",
          "createdAt": "2026-07-30",
          "contextSnapshot": "16 个独立段落 · 结构与凝练 Prompt"
        },
        {
          "id": "a36-p06-reference",
          "promptId": null,
          "promptSnapshot": "",
          "aiText": "虽然这个社区的基础设施条件充足，但是有充分证据显示，当地民众对于剥削儿童和人口贩卖问题认知不足，令人担忧。除此之外，当地儿童及青少年所身处的环境整体上极不友善，但是他们却得不到足够的心理支援。考虑到这一点，UCSA的学生志愿者采取了一种名为“超级英雄训练”的“虚构故事教育法”。",
          "postEditText": "",
          "author": "用户手动翻译",
          "model": "人工参考译文",
          "createdAt": "参考译文",
          "contextSnapshot": "由用户手动翻译，不使用 Prompt。",
          "origin": "manual"
        }
      ]
    },
    {
      "id": "a36-p07",
      "unit": "A36-P07",
      "source": "The idea was to promote the learning of technical concepts on core school subjects in a safe and joyful environment through board games and other ludic activities, highlighting the role of education as the only way to have a life free from violence. On that note, the other project by UCSA volunteer students was the ‘Kakuaa Pora’ at the Divino Niño and María Auxiliadora settlements, where unfavorable social conditions are prevalent. There, psychologists and lawyers explained how to act and where to go whenever domestic violence occurs.",
      "status": "translated",
      "currentTranslationId": "a36-p07-s1",
      "translations": [
        {
          "id": "a36-p07-v0",
          "promptId": "p-a36-f0-v0",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "其理念是通过桌游等游戏活动，在安全和快乐的环境中促进核心学科专业知识的学习，以此强调教育是过上无暴力生活的唯一途径。在此背景下，美洲南锥体大学志愿者学生在社会条件恶劣的“Divino Niño”和“María Auxiliadora”居民点开展了另一个名为“Kakuaa Pora”的项目。在那里，心理学家和律师向居民讲解了面对家庭暴力时该如何应对以及前往何处求助。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-V0",
          "createdAt": "2026-07-29",
          "contextSnapshot": "整篇文章上下文 · F0 基线 Prompt"
        },
        {
          "id": "a36-p07-s1",
          "promptId": "p-a36-f0-s1",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "该活动旨在通过桌面游戏等趣味活动，让孩子们在安全快乐的环境中学习核心学科的学术概念，同时强调教育是摆脱暴力、过上正常生活的唯一途径。与此同时，美洲南锥体大学志愿者学生开展的另一个项目是“Kakuaa Pora”，地点设在社会条件艰苦的“神圣之子”和“进教之佑”定居点。心理学家和律师在当地向居民讲解发生家庭暴力时应如何应对以及去何处寻求帮助。",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-S1",
          "createdAt": "2026-07-30",
          "contextSnapshot": "16 个独立段落 · 结构与凝练 Prompt"
        },
        {
          "id": "a36-p07-reference",
          "promptId": null,
          "promptSnapshot": "",
          "aiText": "“超级英雄训练”倡导建立安全愉快的学习环境，通过开展棋盘游戏和其他趣味活动，教授核心学科的技术概念，并强调教育是摆脱暴力生活的唯一途径。无独有偶，UCSA的学生志愿者还开展了另一个名为“Kakuaa Pora”的项目，在社会条件普遍恶劣的“Divino Niño”和“María Auxiliadora”两个居民区展开。项目邀请心理学家和律师，向当地民众解释每当发生家庭暴力时民众应该如何应对，以及应该到哪里寻求帮助。",
          "postEditText": "",
          "author": "用户手动翻译",
          "model": "人工参考译文",
          "createdAt": "参考译文",
          "contextSnapshot": "由用户手动翻译，不使用 Prompt。",
          "origin": "manual"
        }
      ]
    },
    {
      "id": "a36-p08",
      "unit": "A36-P08",
      "source": "“Many of the kids even approach us to tell us stories about their own lives, what they keep with themselves, and I think that is part of our job too,” commented Mabel Acosta, one of the volunteer students. “Particularly my experience after visiting families and their children, and working with them, is that I truly believe that we all have to be the answer to the calls or prayers made by those children that need us as well as our time and support, and it is possible for the help of everybody,” she added.",
      "status": "translated",
      "currentTranslationId": "a36-p08-s1",
      "translations": [
        {
          "id": "a36-p08-v0",
          "promptId": "p-a36-f0-v0",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "“许多孩子甚至会主动走过来，向我们讲述他们自己的生活故事和藏在心里的心事，我认为这也是我们工作的一部分，”志愿者学生梅布尔·阿科斯塔说道。她补充说：“尤其是，在走访这些家庭和孩子并与他们一起工作后，我深信我们都必须做出行动，去回应那些渴望得到我们时间、支持与帮助的孩子的呼唤或祈祷，只要大家共同努力，这完全是可以做到的。”",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-V0",
          "createdAt": "2026-07-29",
          "contextSnapshot": "整篇文章上下文 · F0 基线 Prompt"
        },
        {
          "id": "a36-p08-s1",
          "promptId": "p-a36-f0-s1",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "志愿者学生梅布尔·阿科斯塔说：“许多孩子甚至主动向我们倾诉自己的生活经历和内心秘密，我认为这也是我们工作的一部分。”她补充道：“在走访这些家庭和孩子并与他们接触后，我深信我们必须回应那些需要我们、需要我们付出时间和支持的孩子的呼唤与期盼。只要每个人都施以援手，这就完全可以实现。”",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-S1",
          "createdAt": "2026-07-30",
          "contextSnapshot": "16 个独立段落 · 结构与凝练 Prompt"
        },
        {
          "id": "a36-p08-reference",
          "promptId": null,
          "promptSnapshot": "",
          "aiText": "其中一位学生志愿者梅布尔·阿科斯塔（Mabel Acosta）说道：“有很多孩子甚至会主动接近我们，讲述关于自己生活的故事，分享内心深处的想法。我认为倾听也是我们工作的一部分。尤其在拜访那些家庭，与那些孩子相处过后，我坚信我们必须付出时间和心血去帮助那些孩子，回应他们的呼唤和祈祷。并且，每个人都可以伸出援手，助他们一臂之力。\"",
          "postEditText": "",
          "author": "用户手动翻译",
          "model": "人工参考译文",
          "createdAt": "参考译文",
          "contextSnapshot": "由用户手动翻译，不使用 Prompt。",
          "origin": "manual"
        }
      ]
    },
    {
      "id": "a36-caption",
      "unit": "A36-CAPTION",
      "source": "University students were trained to prevent and reduce violence in vulnerable communities (Photo: UCSA)",
      "status": "translated",
      "currentTranslationId": "a36-caption-s1",
      "translations": [
        {
          "id": "a36-caption-v0",
          "promptId": "p-a36-f0-v0",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的整篇英文文章译成面向中文公众的联合国新闻特写。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 标题须简洁、有行动感并概括原文核心，但不得加入原文没有的主题判断。\n11. 利用整篇文章上下文统一专名、缩写和关键词；每个 `sample_id` 只能对应一个译文。\n12. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n\n输入是一个 JSON 对象。请原样复制其中的 `experiment_id`、`prompt_version`、`article_id`、`split`、`document_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.translation-doc.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"article_id\": \"原样复制\",\n  \"split\": \"原样复制\",\n  \"document_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "大学生接受培训，以预防和减少脆弱社区的暴力行为（照片：UCSA）",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-V0",
          "createdAt": "2026-07-29",
          "contextSnapshot": "整篇文章上下文 · F0 基线 Prompt"
        },
        {
          "id": "a36-caption-s1",
          "promptId": "p-a36-f0-s1",
          "promptSnapshot": "你是一名英汉新闻翻译专家。请把输入中的16个独立英文段落译成面向中文公众的联合国新闻特写语言。\n\n必须遵守以下要求：\n\n1. 完整保留数字、时间、机构、主客体、条件、因果、并列关系、引语归属和独立信息，不得漏译、增译或改写事实。\n2. 使用简体中文。语言清楚、凝练、自然，避免英文定语链、被动句和抽象名词堆叠。\n3. 可以按中文信息推进拆分长句或调整状语位置：先交代背景或主体，再写行动，最后写目的或结果。\n4. 使用明确、有行动感但不过度夸张的动词。鼓舞色彩必须能由原文直接支持。\n5. 优先使用自然、正式的中文搭配；不要使用网络化、俏皮或过分口语的表达。\n6. 可以显化上下文中已经明确的关系，但不得创造新的评价、因果或成效。\n7. 可以删去中文中没有功能的重复称谓，但任何独立事实、重复强调或结构性信息都必须保留。\n8. 代词可能造成歧义时，重复机构、小组或人物名称。\n9. 引语必须保持说话者立场；不得把引语改写成无来源的新闻事实。\n10. 每个样本独立翻译，不得借用其他样本补足上下文；每个 `sample_id` 只能对应一个译文。\n11. 不模仿专名误写、简繁混用或半角/全角符号偶差。\n12. 凝练不是追求机械短句；不得把同一动作、目的或结果拆成无意义碎片。\n\n\n## 五项高优先级结构动作\n\n这些动作按需使用，不要为了套规则而改写本来已经自然的句子。\n\n1. 身份和背景先落地：英文把机构身份、地点或背景插在主语中间时，先独立交代，再进入主要行动。\n2. 找出真实行动者和动作：把名词化、无生命主语和被动主干改成自然动词；无法确定行动者时不要擅自补人。\n3. 给方式、目的、结果和并列行动分层：先写主体行动，再写方式或目的，最后写结果；保留条件、转折和可能性。\n4. 让回指具体、断句有焦点：把悬空的“这、后者”换成明确对象，只在信息焦点改变处断句，不制造碎片句。\n5. 单独管理引语与归属：人物身份、头衔和归属不得遗漏；不同说话者不得合并，引语内外边界必须清楚。\n\n\n## 静默语义骨架\n\n翻译每个段落前，先在内部建立语义骨架，但不得输出骨架或分析：\n\n1. 主体与身份：谁在说话或行动，机构身份和人物头衔是什么；\n2. 核心行动与对象：谁对什么做了什么，不能用空泛名词替代动作；\n3. 硬限定：数字、时间、地点、范围、条件、否定、比较和转折；\n4. 事实强度：区分已经发生、正在发生、计划、目标、可能、有望和将来结果；\n5. 逻辑层级：区分并列行动、方式、目的、原因和结果，不擅自改成因果；\n6. 引语边界：说话者、引语内容和归属说明分别对应，不能遗漏头衔；\n7. 回指对象：确认“这、该举措、后者”等各自指向唯一对象。\n\n骨架确认完整后再组织中文。凝练只能删除中文语法负担，不能删除骨架中的任何信息。\n\n输入是一个 JSON 对象。请原样复制 `experiment_id`、`prompt_version`、`batch_id`、`batch_sha256` 和 `prompt_sha256`，并按输入顺序返回全部译文。只返回一个合法 JSON 对象：\n\n{\n  \"schema\": \"unai.grammar-concision-output.v1\",\n  \"experiment_id\": \"原样复制\",\n  \"prompt_version\": \"原样复制\",\n  \"batch_id\": \"原样复制\",\n  \"batch_sha256\": \"原样复制\",\n  \"prompt_sha256\": \"原样复制\",\n  \"translations\": [\n    {\n      \"sample_id\": \"原样复制\",\n      \"source_sha256\": \"原样复制\",\n      \"translation\": \"中文译文\"\n    }\n  ]\n}\n\n不得输出 Markdown 代码块、标题、解释、分析或额外字段。",
          "aiText": "大学生接受培训，以预防和减少脆弱社区的暴力。（图：美洲南锥体大学）",
          "postEditText": "",
          "author": "实验译文导入",
          "model": "F0-S1",
          "createdAt": "2026-07-30",
          "contextSnapshot": "16 个独立段落 · 结构与凝练 Prompt"
        },
        {
          "id": "a36-caption-reference",
          "promptId": null,
          "promptSnapshot": "",
          "aiText": "大学生接受训练，预防并减少弱势社区内的暴力行为（图片：南美洲南部大学）",
          "postEditText": "",
          "author": "用户手动翻译",
          "model": "人工参考译文",
          "createdAt": "参考译文",
          "contextSnapshot": "由用户手动翻译，不使用 Prompt。",
          "origin": "manual"
        }
      ]
    }
  ],
  "terms": [],
  "tm": []
};
