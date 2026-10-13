# 验证记录

日期：2026-10-13（Asia/Shanghai）。本地开发环境：Windows、Node.js 24；Actions 使用 Node.js 22。

## 已验证

- `npm test`：20 项单元测试覆盖四种图片尺寸协议、指定默认模型、FormData、多图、生成/编辑端点、URL/base64、未知能力禁用、推理参数、UTF-8 分块 SSE、CRLF、流中断、普通 JSON、错误脱敏、额度/模型/频率/体积错误、上游过载流内错误、超时且不重试。
- `npm run test:ui`：18 项通过（Chrome 9 项、WebKit 9 项），覆盖 375、390、430、1440 像素三个页面无横向溢出，hash 导航和刷新、深色主题、sessionStorage 默认密钥、本机持久保存明确确认、流式 Markdown、本地历史、重新生成确认、编辑 multipart、生成 JSON、对比切换和错误显示，并增加 GPT Image 默认值与单图适配检查。
- UI 自动化中的 API 使用明确的协议测试样本，证明浏览器接线和行为；不宣称样本是 GPT.GE 的真实 AI 回答或图片。生产应用不包含测试样本。
- 生产 `/ai-space/` 子路径构建、manifest/start_url/scope、Service Worker 与离线刷新检查，原始记录见 [production-check.json](production-check.json)。
- 四端点真实 OPTIONS 与无效令牌的浏览器请求，Chrome/WebKit 可读到 401，见 [cors-check.json](cors-check.json)。已记录允许请求头通配符的规范风险。
- 用户授权临时有效令牌：模型列表 HTTP 200（333 个，包含两个指定默认模型）；gpt-6.1-sol 流式聊天 HTTP 200；gpt-image-2.5-sunburst 生成、单图 multipart 编辑均 HTTP 200，返回真实 base64 图片。实际图片已目视确认从蓝圆变成橙圆。详见 [live-check.json](live-check.json)。测试过程可能计费，未查询余额或具体扣费金额。
- 本机网页直接调用有效令牌：模型列表、聊天与单图编辑均成功收到结果，聊天显示“网页聊天测试成功。”。另外用与网页相同的 4096 输出上限验证三条消息的多轮聊天，HTTP 200，回答“多轮测试成功。”。密钥仅保存在浏览器会话，未写入源码、记录或压缩包。
- 较复杂聊天请求复查：实际 HTTP 200，但 SSE 内含 `upstream_error`，消息为服务器过载，没有有效文字回答。已修正原先统一映射到 HTTP 400 的提示，改为上游繁忙；不自动重试、不宣称成功。脱敏记录见 live-check.json。

## 未验证 / 需要上线验收

- 其他令牌的权限、各模型精确计费、Claude/Gemini/GLM 的实际回答；GPT Image 多参考图和其他尺寸。
- Nano Banana 基础、Pro 与固定分辨率模型的有效请求、1–6 张图的服务端解析、返回 URL/base64、生成质量和真实修图效果。
- 最终账号的 GitHub Actions 与 Pages 线上部署（当前目录没有指定远程仓库，不会擅自创建或推送）。已交付完整 workflow、依赖锁和中文部署步骤。
- iPhone Safari 与 Android Chrome 真机：软键盘、相册权限、HEIC 转换、照片保存/分享、PWA 安装、刘海与横竖屏。WebKit 自动化不能替代这些系统级验收。
- 实际部署域名、其他浏览器版本或服务商后续变更后的 CORS。

自动化截图输出在 `artifacts/`，已忽略提交；查看源码部署不需要上传这些截图。
