# 2026-11-05 GitHub Pages 正式发布成功 ✅

## 🎉 最终成果
**分享链接（永久、可对外、自动同步）**：
```
https://xylia-cc.github.io/my-dev-nest./
```
仓库：`Xylia-cc/my-dev-nest.`（公开）｜ 分支：`main` ｜ Pages：`build_type=workflow`

## 发布执行记录
1. token 存入 `~/.workbuddy/github_token.txt`（权限验证通过：账号 Xylia-cc）
2. `node publish/github_auto_publish.js "my-dev-nest." <token>` → 建仓检查 → 构建 → git push → 开 Pages → 打印地址
3. Actions 两个工作流均 **success**：
   - 「发布到 GitHub Pages」（我写的）
   - 「pages build and deployment」（GitHub 官方）
4. 线上所有资源 HTTP 200：index.html / engine.js / xlsx.full.min.js / 离线单文件版

## ⚠️ 踩坑：Pages 部署模式冲突（重要）
**现象**：Actions 全部 success，但线上返回的是 GitHub 的 **404 页面**（HTTP 200、6853 字节、标题带 `| my-dev-nest.`）。

**根因**：用 API 开启 Pages 时传了 `source:{branch:'main',path:'/'}` → `build_type=legacy`（从分支根目录发布），
而本项目用 `upload-pages-artifact` + `deploy-pages`（Actions 模式）。**仓库根目录没有 index.html** → 线上 404 页。

**修复**：
```js
// 开启时直接用 workflow 模式
await api('POST', '/repos/'+user+'/'+REPO+'/pages', { build_type: 'workflow' });
// 已存在且是 legacy 时：PATCH 改；PATCH 不支持则 DELETE + POST(build_type:'workflow') + rerun workflow
```
已写进 `publish/github_auto_publish.js`（自动检测并修正）。

**教训**：Actions 模式与 branch 模式互斥；`GET /pages` 的 `build_type` 字段要检查。

## 验证结果
| 项 | 结果 |
|---|---|
| 线上页面 DOM | 标题/上传控件/引擎/XLSX库/剩余库存列 全部 OK ✅ |
| 打开时结果区 | HIDDEN（打开无结果，需导入模板点计算）✅ |
| 完整模板端到端（浏览器内） | 总需求 58571 / 总组装 **9037** / 齐套率 15.4% / 结果723行 / 明细2179行 / slot4847行 ✅ |
| **Node 端交叉验证** | 总组装 9037、明细 2179、结果 723、关系{1:1936,2:135,3:108} —— **与浏览器完全一致** ✅ |
| 自动同步 | 插入测试标记 → push → Actions → 线上含新内容 ✅（标记已移除） |

## 以后发版（一条命令）
```bash
bash publish/github_push.sh          # 或 Windows 双击 publish\一键发布.bat
```
或直接说「发版」，我来跑。

## 注意
- token 是 PAT（repo+workflow），**用户已在对话中明文发过** → 建议用完后在 GitHub 撤销并重新生成
- token 存在 `~/.workbuddy/github_token.txt`（权限 600），**不在仓库里**
