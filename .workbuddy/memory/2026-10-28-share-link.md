# 2026-10-28 分享链接问题最终定位与解决方案

## 现象
用户反馈：**沙箱分享链接连自己都打不开**（截图 403「链接不完整」）。

## 彻底定位（读了 WorkBuddy 客户端源码）
文件：`F:/0411/WorkBuddy/resources/app.asar.unpacked/resources/builtin-skills/cloudstudio-deploy/scripts/deploy.js`

关键代码：
```js
async function getShareLink(spaceKey, port, expire = 157_680_000) {
  const data = await paasPost(`/workspaces/${spaceKey}/links`, { port, expire });
  return data?.host ? `${data.scheme}://${data.host}` : null;
}
```
- 分享链接由**服务端 PaaS 接口** `/workspaces/{spaceKey}/links` 生成，返回 `{scheme, host}`
- 本地 `cloudstudio-deploy-history/*.json` 里存的 shareLink **就是服务端的原始返回值**，没有截断
- 直接调该接口（无 API key）返回 `{code:16, message:"invalid token"}` → 令牌由宿主进程注入到工具环境，本地拿不到
- ⇒ **沙箱链接的可用性由平台会话决定，工具层无法补齐参数**，任何外部访问都 403

### 结论（权威）
**沙箱分享链接只能在 WorkBuddy 内嵌预览器里用（会话自动注入令牌），无法作为对外分享链接。**
这不是配置问题，是平台机制。对外分享必须用外部托管。

## 已交付的三种可用方案

### ① 局域网分享（立即可用，零配置）
```bash
cd site && python -m http.server 8899 --bind 0.0.0.0
```
访问 `http://192.168.8.33:8899/` —— 已验证 HTTP 200（28374 bytes），同一局域网内同事可直接打开。
限制：你的电脑必须开着、公司网络需互通。

### ② 离线单文件版（立即可用，最稳）
`分仓组装量计算器-离线版-20261028.html`（976KB，零外部依赖，双击即开，可微信/邮件直接发）

### ③ GitHub Pages（永久链接 + 发版自动同步，用户已选）
- `.github/workflows/publish.yml`（push main 自动部署）+ `publish/build_gh.js`（8 项自检）+ `publish_gh.sh`（交互式一键发布）
- 已验证：干净克隆 → `npm install xlsx` → 构建 → 8 项自检全过
- 用户侧一次性配置：建空仓库 → `git remote add origin ...` → Settings→Pages→Source 选 GitHub Actions → `bash publish_gh.sh`
- 凭据由 git 自身弹出输入，**不经对话**（用户明确选择此方式）

## 经验
- 平台工具返回的 URL 若在浏览器 403，不要反复猜参数 —— **去读工具的实现源码**（`app.asar.unpacked/resources/builtin-skills/*/scripts/`），一次定位根因
- `app.asar` 是压缩包，grep 不到；要看 **`app.asar.unpacked`** 目录
- 本地连接器状态在 `~/.workbuddy/connectors/<id>/connector-states.v3.json`（可查哪些已认证）
