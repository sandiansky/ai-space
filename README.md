# AI Space · 你的私人 AI 空间

React + Vite + TypeScript 开发的手机优先 AI 工具网站。纯静态前端，直接调用 GPT.GE（V-API），没有后端、数据库或登录。API Key 由使用者在网页设置中输入；仓库和构建文件不需要密钥。

## 先看验证范围

- 已实现：多轮聊天、Markdown/GFM、代码块复制、流式输出、停止等待、确认后重新生成、模型切换、本地历史；独立图片生成/编辑流程、多参考图 FormData、原图对比、大图、保存与分享；模型管理、明暗主题、安全区域、PWA 和 GitHub Actions。
- 已验证：TypeScript 与生产构建、375/390/430/1440 像素的 Chrome/WebKit 布局与基本交互、会话密钥保存、请求协议与异常处理。详见 [验证记录](docs/VERIFICATION.md)。
- 真实有效临时令牌已验证：333 个模型，`gpt-6.1-sol` 流式和多轮聊天，`gpt-image-2.5-sunburst` 生成及单图 multipart 编辑均 HTTP 200。已确认真实蓝色圆形被改为橙色，图片返回 base64。详见 [脱敏调用记录](docs/live-check.json)。
- 尚需验收：精确扣费金额、其他令牌权限、其他模型，以及 iPhone/Android 真机软键盘、相册、分享和安装。密钥不要写进 GitHub。
- Chrome 155 与 WebKit 27.2 从真实 GitHub Pages 页面能读到四个端点的 401 响应；本机网页有效令牌模型列表、聊天和图片编辑也成功返回。服务端 OPTIONS 的允许请求头仍仅为 `*`，存在规范兼容性风险，最终部署域名需重测，见 [跨域说明](docs/API.md)。

## 本机运行

1. 安装 Node.js 22 LTS 或更新的兼容版本。
2. 在此项目文件夹打开终端，执行：

```powershell
npm install
npm run dev
```

3. 打开终端显示的 Local 地址。如果默认端口被占用，可运行 `npm run dev -- --port 4175`。
4. 进入「设置」，检查 `https://api.gpt.ge/v1`，输入 Key，点击「获取模型」。不需要创建 `.env`。
5. 已按使用者要求预置默认聊天 `gpt-6.1-sol`、默认生成与编辑 `gpt-image-2.5-sunburst`。这两个模型已在本次临时令牌下实测；使用其他令牌时请重新获取模型、确认权限，也可自行修改默认值。

## 免费部署到 GitHub Pages（推荐 GitHub Desktop）

不需要购买服务器或域名。以下流程不需要写命令。

1. 注册 GitHub 账号，安装 **GitHub Desktop**。
2. GitHub Desktop → **File → Add local repository** → 选择本项目文件夹。若提示不是仓库，点击 **create a repository here**。确认创建后的实际路径仍是本项目目录，没有重复嵌套一个空文件夹。
3. 在 GitHub Desktop 的 Changes 列表中，应看到 `package.json`、`src`、`public` 和 `.github/workflows/deploy.yml`。`node_modules`、`dist`、`artifacts` 和任何密钥都不应被提交。
4. 填写提交摘要（如 `Initial AI Space`）→ **Commit to main**。如果默认分支不是 `main`，先将其重命名为 `main`，或同步修改部署文件中的分支名。
5. 点击 **Publish repository**，仓库名建议 `ai-space`。使用 GitHub Free 的常见免费 Pages 配置需要公开仓库，取消 **Keep this code private** 后发布。代码与页面可被访问，但其中不包含使用者的 API Key；“个人使用”不等于网站有访问密码。
6. 在浏览器打开该 GitHub 仓库 → **Settings → Pages → Build and deployment → Source → GitHub Actions**。
7. 打开仓库 **Actions** → **Deploy AI Space to GitHub Pages** → **Run workflow** → 选择 `main` → 运行。如果第一次推送时 Pages 尚未启用导致失败，按此步骤手动重跑即可。
8. 等待 `build` 与 `deploy` 都显示绿色成功。点击部署链接，常见地址为 `https://你的用户名.github.io/ai-space/`。以后每次修改、提交并 Push origin，都会自动重新部署。

**不必手改 Vite 路径。** Actions 使用 `configure-pages` 返回的实际 `base_path`，既支持仓库子目录，也支持用户主页或自定义域名。三个页面使用 `#chat`、`#images`、`#settings`，刷新不依赖服务器重写规则。

如果使用压缩包，请先完整解压源码，并保留 `.github` 文件夹。不要把压缩包本身作为网站上传；GitHub 不会自动解压运行它。

## 手机使用

- iPhone：使用 Safari 打开部署地址 → 分享 →「添加到主屏幕」。
- Android：使用 Chrome 打开部署地址 → 菜单 →「安装应用」或「添加到主屏幕」。
- 默认仅将 Key 保存在 `sessionStorage`。浏览器可能恢复旧会话，因此它不是“关闭标签后必然清除”的保证。
- 开启「在此设备记住密钥」需明确确认风险：Key 会明文存于本机 `localStorage`。关闭开关或清除配置即可移除持久副本。
- 对话历史在本机保存；清除浏览器数据会删除历史。图片结果只保留在当前页面中，请及时保存。
- 支持文件分享的手机优先打开系统分享面板；也可查看大图后长按保存。下载到「文件」的图片可再保存到相册。
- 离线时可打开 PWA 和查看本机聊天，调用 AI 仍需要网络。服务工作线程只缓存应用静态文件，不缓存 API 请求、密钥或图片结果。

## 模型与请求

官方资料与已实现的适配规则见 [API.md](docs/API.md)。聊天通用格式可用于 GPT、Claude、Gemini、GLM 等服务端实际提供的聊天模型；未知或媒体模型不会直接归类为聊天。图片分别适配 GPT Image 的像素尺寸参数与 Nano Banana 的比例/分辨率参数。

GPT Image 当前保守限制 1 张参考图；Nano Banana 最多 6 张。sunburst 已实测 1 张，多图能力尚未验证。请求 1024×1024 时，服务商实际返回的尺寸可能不同，保存时保留原始输出。20 MB/张与 5000 万像素为本站保护限制，服务商可能另有更低限制。JPG/PNG/WebP 可直接选择；HEIC 请先导出为 JPG。

请求不会自动重试。停止等待、刷新页面或超时不保证服务端任务取消，也可能已经产生费用；再次提交前请检查服务商调用记录。

## 开发验证

```powershell
npm ci
npm test
npm run build
npx playwright install webkit
npm run test:ui
```

浏览器测试默认使用本机 Chrome 和 Playwright WebKit；未安装 Chrome 的环境可自行改为 Playwright Chromium。测试中的协议样本只存在于 `tests/`，应用代码没有模拟响应或演示结果。

检查仓库子路径的构建：

```powershell
$env:VITE_BASE_PATH='/ai-space/'
npm run build
npm run preview -- --port 4176 --base /ai-space/
```

保持预览运行，在另一个终端执行 `node scripts/verify-production.mjs`，验证 `/ai-space/`、manifest 和离线刷新。直接通过 `file://` 打开 dist/index.html 不受支持。

重新执行无真实密钥的跨域检查：`node scripts/check-cors.mjs`。输出保存在 `docs/cors-check.json`；不会读取用户 Key。`scripts/live-test.mjs` 是交互式真实调用诊断工具，通过隐藏标准输入接收临时凭据，只在进程内存中使用；报告会脱敏。真实调用可能计费，严禁将密钥加进脚本或命令行参数。

## 首次上线验收（可能消耗少量额度）

1. 在最终 GitHub Pages 地址和实际手机上点击「测试连接」，再「获取模型」，确认不是网络/CORS错误。
2. 用一个低价聊天模型发送短问题，检查逐字输出；继续追问并切换模型，刷新后通过历史恢复对话。
3. 用令牌实际支持的 Nano Banana 模型生成一张简单图片；保存后确认文件能在相册/文件中打开。
4. 上传一张 JPG 做真实编辑，再用 2–6 张参考图验证服务商的重复 `image` 字段解析；检查原图对比与效果。
5. 试用基础/Pro/固定 2K、4K 模型各自的尺寸设置；未授权或不存在的模型应显示错误。
6. 在 iPhone/Android 上验证键盘、选图、保存、深色主题、横竖屏和添加桌面；PWA 更新请等当前请求结束后操作。

如浏览器出现 CORS 拒绝，请联系 GPT.GE 修正服务端响应头。本站没有后端，GitHub Pages 不能替服务商放行；不采用公共代理、`no-cors` 或关闭浏览器安全策略。
