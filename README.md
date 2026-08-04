# trAIslator — Translation AIducator

面向英中、中英翻译教学的 Prompt 驱动型 CAT 软件 Demo。该版本是项目的**第一个可路演 Demo 版本**，重点演示“Prompt 版本—AI 译文—人工译后编辑—AI 译后编辑”之间的可追溯关系。

## Demo 功能

- 类 CAT 的双语句段编辑界面
- Prompt 谱系、完整快照与译文版本绑定
- AI 译后编辑建议、逐项接受/拒绝和 Diff
- 人工译后编辑与全部版本对比
- 术语库、翻译记忆和 AI Prompt 教练入口
- 预存英中、中英文本，以及课堂路演项目
- 浏览器本地缓存，无需后端即可演示
- 预留用户自填 API Key 的模型接口；当前主要内容使用模拟数据

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
