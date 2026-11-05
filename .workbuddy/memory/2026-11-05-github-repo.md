# 2026-11-05 GitHub 仓库接入与推送

## 用户操作
```
cd D:\workbuddy\分仓组装计算
git remote add origin https://github.com/<Xylia-cc>/<my-dev-nest.>.git
```
→ 实际仓库名按 `my-dev-nest` 处理（去掉尖括号占位符与尾点）。

## 已完成
| 项 | 状态 |
|---|---|
| remote 指向 `https://github.com/Xylia-cc/my-dev-nest.git` | ✅ |
| 分支 `master` → **`main`**（Pages 工作流与脚本都依赖 main） | ✅ |
| 代码提交（工作区干净） | ✅ 最新提交 `21513f4` |
| `publish/` 目录清理（移除 30+ 历史副本/实验脚本，只留 5 个必要文件） | ✅ |
| Actions 构建流程在干净克隆中验证 | ✅ 8 项自检全过 |

## 仓库状态探测
- 用户 `Xylia-cc` 存在，**2026-11-05 当天创建**，公开仓库数 0
- `GET /repos/Xylia-cc/my-dev-nest` → **404**（未认证时私有仓库也返回 404）
- `git ls-remote` → **401 Unauthorized** → 说明仓库**私有**或需认证

## ⚠️ 关键结论：私有仓库不能用 Pages 分享
- **公开仓库** → Pages 直接公开访问 ✅
- **私有仓库** → GitHub 免费版**不支持 Pages**；Pro 版支持但访问需登录自己的账号 ❌ 不适合分享
→ **必须把仓库设为 Public**（Settings → General → 取消 Private，或 API `PATCH {"private":false}`）

## 凭据获取（唯一剩下的阻塞）
需要 PAT，权限勾 `repo` + `workflow`：
https://github.com/settings/tokens/new

**为什么没能自动完成**：
- `git push` 的 GUI 弹窗在此环境不可用（`fatal: User cancelled dialog` / `/dev/tty: No such device`）
- GitHub Device Flow 端点 `POST /login/device/code` → **ECONNRESET**（被重置，走不通）
- 本机无 `gh` CLI、无 credential.helper、无已存 token

## 已备好的脚本（token 一到手就能跑）
| 脚本 | 作用 |
|---|---|
| `bash publish/github_guide.sh` | 交互式：引导生成 token → 隐藏输入保存到 `~/.workbuddy/github_token.txt` → 自动建仓库/推送/开 Pages |
| `bash publish/github_guide.sh <repo> <token>` | 命令传参版（token 不进对话） |
| `bash publish/github_push.sh` | 纯非交互：读已存 token 直接发布 |
| `publish/凭据配置说明.md` | Token 生成 + 仓库可见性指引 |

`publish/github_auto_publish.js` 已用无效 token 测过：能清晰报 `HTTP 401: Bad credentials` 并正常退出，不会误操作。

## 网络抖动备忘
GitHub 连接**时通时断**（本次 3 次 push 里 2 次超时）。排查用：
- `GIT_CURL_VERBOSE=1 git ls-remote <url>` 能看到 TLS 握手是否成功（成功=网络OK，返回401=认证问题）
- Node `https.get` 与 `net.connect` 测 TCP 层
- **git 连不上时先重试**，别急着下"被墙"的结论

## 当前可用（不依赖 GitHub）
- 局域网：`http://192.168.8.94:8899/`（HTTP 200 已验证）
- 离线单文件版：`site/分仓组装量计算器-离线版.html`（977KB）
