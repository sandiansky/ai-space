# GPT.GE 接入依据与限制

查阅与实测日期：2026-10-13。使用用户授权的临时令牌获取到 333 个模型；gpt-6.1-sol 流式聊天、gpt-image-2.5-sunburst 生成和单图编辑均返回 HTTP 200。脱敏记录见 [live-check.json](live-check.json)。其他令牌的权限需要重新获取并验证。

## 官方依据

| 用途 | 官方文档 | 本站实现 |
| --- | --- | --- |
| 模型列表 | https://api-gpt-ge.apifox.cn/220081913e0 | GET `/v1/models`，Bearer 鉴权 |
| 通用聊天 | https://api-gpt-ge.apifox.cn/210153849e0 | POST `/v1/chat/completions`，JSON，支持 SSE/普通 JSON |
| o1/o3 参数 | https://api-gpt-ge.apifox.cn/215439574e0 | 推理适配器不发送 temperature；使用 max_completion_tokens；o1 非流式 |
| Nano Banana 生成 | https://api-gpt-ge.apifox.cn/345881374e0 | POST `/v1/images/generations`，JSON |
| Nano Banana 编辑 | https://api-gpt-ge.apifox.cn/345967870e0 | POST `/v1/images/edits`，multipart/form-data |
| GPT Image 生成 | https://api-gpt-ge.apifox.cn/288964677e0 | JSON：model、prompt、n（数字）、size（像素） |
| GPT Image 编辑 | https://api-gpt-ge.apifox.cn/210463340e0 | FormData：image、prompt、model、n、size |
| 图片模型目录 | https://gpt.ge/models | sunburst 标注生成与编辑；精确别名的请求兼容性以本次真实调用确认 |
| 兼容性总览 | https://api-gpt-ge.apifox.cn/ | 非 OpenAI 聊天模型也可使用通用聊天格式 |

文档中的部分介绍表格写成单数 `/image/...`，但端点标题和 cURL 示例均为复数 `/images/...`；本站遵循端点标题与示例，未新增猜测的接口。

## 能力适配

| 模型 ID | 尺寸请求 | 编辑参考图 |
| --- | --- | --- |
| gpt-image-2.5-sunburst / gpt-image-1 / gpt-image-1.5 | `size=1024x1024`，`n=1`，不传 aspect_ratio | 当前保守限制 1 张；sunburst 已实测 |
| nano-banana / gemini-2.5-flash-image | `size` 为画面比例 | 1–6 张 |
| nano-banana-pro / gemini-3-pro-image-preview | `size` 为分辨率；`aspect_ratio` 为比例 | 1–6 张，具体分组待实测 |
| nano-banana-pro-2k / nano-banana-pro-4k | `size` 为比例；不传 aspect_ratio | 1–6 张，具体分组待实测 |

生成与编辑调用分开的函数和端点；编辑将 `model`、`prompt`、尺寸参数和文件放进 FormData。Nano Banana 多图使用重复的 `image` 字段，浏览器自动设置 boundary；官方页面说明支持多图，但未详述数组编码，重复字段的服务端解析仍需有效密钥实测。不会将聊天图片分析当成图片编辑。

默认聊天模型为 `gpt-6.1-sol`，生成和编辑均为 `gpt-image-2.5-sunburst`。它们作为用户指定配置预置，不代表所有令牌都有权限。本次 sunburst 两次调用均返回 base64。实际生成图为 2048×2048、编辑图为 1254×1254，即服务商并未严格遵循请求的 1024×1024；本站展示并保存原始返回，不伪造尺寸。

默认不强制发送 `response_format`，以尊重令牌分组的返回格式；解析器同时接受 HTTPS URL 和 `b64_json`。收到 URL 时尝试无凭据下载为当前页面 Blob，若图片主机不允许跨域下载则保留原 URL，提示大图长按保存。不经公共代理。禁止协议不安全的返回地址。

未知图片、视频、语音、嵌入等模型不自动启用；设置中可指定已有协议适配器，只有服务商确实提供兼容协议时才应使用。新增协议须修改 `src/models.ts`、`src/api.ts` 并检查官方文档。自定义模型不会绕过令牌权限。

## 跨域检查

原始结果：[cors-check.json](cors-check.json)。

无密钥 OPTIONS 检查代表来源 `https://ai-space-example.github.io` 的四个接口均为 204，含 `Access-Control-Allow-Origin: *`、允许 GET/POST/OPTIONS，`Access-Control-Allow-Headers` 仅为 `*`。

随后用正常启动、未关闭安全策略、未拦截网络的 Chrome 155.0.8059.39 与 Playwright WebKit 27.2，从真实 `https://mdn.github.io` 页面发起携带确定无效 Bearer 标记的四端点请求。两个引擎均可读取 HTTP 401。该测试不使用有效密钥，未发起有效模型调用或产生 API 费用；测试网页是公开页面，只执行无凭据的临时检查，没有修改该站点。

**结论：此次测试环境中未观察到 CORS 阻塞，但不能据此保证所有手机、来源和有效请求都可用。** 按 [Fetch 标准](https://fetch.spec.whatwg.org/#cors-non-wildcard-request-header-name)，Authorization 属于不能被通配符替代的请求头。当前服务端配置仍有规范兼容性风险，建议 GPT.GE 显式允许 `Authorization, Content-Type`。最终部署域名、真实手机与令牌分组必须重测。鉴权失败的 401 不等于付费调用成功。

如果失败，只能让 API 服务商修正 CORS。静态网站不能代替 API 修改响应头；也不能用 `mode: no-cors` 读取 AI 返回值。本项目不含 CORS 代理或后端。生产请求为 `credentials: omit`，不会携带服务商 Cookie；Bearer Header 仍按用户配置正常发送。

## 错误与付费保护

- 同一次任务用同步 ref 锁防止连续点击；生成/编辑过程锁定模式与输入。
- 无自动重试；重新生成需要确认并提示再次计费。
- 聊天 180 秒、图片 300 秒、模型列表 20 秒超时。服务端是否取消不由浏览器控制。
- 错误归类包括密钥、权限、额度、频率、模型、文件大小、网络、超时和格式异常；服务商原始消息不直接回显，避免泄漏密钥。
- Markdown 不执行 HTML，不自动加载回答中的外部图片；链接在独立窗口打开。
- 图片结果与 API 响应不进入 Service Worker 缓存；对话历史仅存本机，不含设置中的 Key。
