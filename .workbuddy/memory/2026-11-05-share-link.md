# 2026-11-05 生成可打开的分享链接

## 需求
用户要：**一个能真正打开的分享链接**（之前沙箱链接 403 打不开）。

## 排查与实测（今天做了大量外网探测）

### 各托管平台实测结果
| 平台 | 连通性 | 结论 |
|---|---|---|
| **surge.sh** | HTTP 200 ✅ | 需注册（邮箱+密码），`POST /token` 免交互注册可行，但**需邮箱验证**才能发布 |
| **github.io** | HTTP 200 ✅ | GitHub Pages 完全可达 |
| **api.github.com** | HTTP 200 ✅ | API 端点正常，未认证返回 401（预期） |
| **git 协议** | ✅ `git ls-remote` 成功 | 曾一度连不上，**是临时抖动**，重试即通 |
| **codeload.github.com** | HTTP 200 ✅ | 正常 |
| **jsdelivr** | HTTP 200 ✅ | 可托管 GitHub 仓库文件（备选） |
| **gitee** | HTTP 200 ✅ | 可达 |
| catbox.moe | 连接被重置 ❌ | 上传 977KB 失败 |
| litterbox | 能传但 1 小时限时 + 后转 500 ❌ | 不稳定 |
| temp.sh | 能传 ✅ 但路径随机 | 无法固定链接 |
| uguu.se | 415 拒绝 html | 不行 |
| 0x0.st | 已关停 | — |
| pixeldrain / transfer.sh / bashupload | 超时/域名解析失败 ❌ | — |
| mail.tm 临时邮箱 | 504 不稳定 ❌ | 无法用于 surge 注册 |

### GitHub Device Flow 也不行
`POST https://github.com/login/device/code` → **ECONNRESET**（被重置），走不通。

## 最终方案

### ① 立即可用：局域网链接（已启动、已验证）
```
http://192.168.8.94:8899/
```
- 服务：`publish/serve_lan.sh`（`python -m http.server 8899 --bind 0.0.0.0`）
- HTTP 200 ✅，浏览器实测：标题/上传控件/结果区默认隐藏/XLSX库/引擎/剩余库存列 **全部 OK**
- 限制：本机需常开、同事需同网段

### ② 永久 + 自动同步：GitHub Pages（脚本已全部就绪）
新增两个文件：
- **`publish/github_auto_publish.js`** —— 全自动：API 建公开仓库 → git push（token 走一次性 http.extraheader，**不落盘**）→ API 开 Pages（source=branch main）→ 输出 `https://<账号>.github.io/<仓库>/`
- **`publish/github_guide.sh`** —— 交互式引导：首次提示生成 PAT（勾 repo + workflow）、隐藏输入、保存到 `~/.workbuddy/github_token.txt`；之后一条命令发版

用法：
```bash
bash publish/github_guide.sh            # 首次（粘贴 token）
bash publish/github_guide.sh            # 之后（自动读已存 token）
```

### ③ 备用：离线单文件版
`site/分仓组装量计算器-离线版.html`（977KB，零依赖，可微信发）

## 经验
- 外网托管探测要**批量并发测**，逐个试太慢（本次写了 probe_hosts.js ~ probe_hosts5.js 分批探测）
- `curl` 在 Git Bash 下 `-o NUL` 可能报 curl(6) 无法解析主机 —— 是 curl 自身解析问题，换 Node https 更可靠
- GitHub API 未认证访问 `/user/repos` 返回 401「Requires authentication」= 端点正常，不是被墙
- **git 协议连不上可能是临时抖动**，一定要重试再下结论
- `bash` 里 `chmod`/`sleep`/`timeout` 等命令可能不存在（Git Bash 精简版），要用 `node -e` 替代
- mail.tm 的 domains 接口返回 **hydra 格式**（`hydra:member` 才是数组），不是普通数组
