#!/bin/bash
# ============================================================
# 一键发布到 GitHub Pages
#
#   首次：需要设置 remote（下方会提示）
#   之后：bash publish_gh.sh  → 构建 + 提交 + 推送 → Actions 自动部署
#
# 凭据提示由 git 自身弹出（用户名 + Personal Access Token），
# 不会进入对话记录。
# ============================================================
set -e
cd "$(dirname "$0")"

echo "==> 1/4 构建静态站点"
node publish/build_gh.js

echo ""
echo "==> 2/4 检查远程仓库"
if ! git remote get-url origin > /dev/null 2>&1; then
  echo "    未设置 origin，请先执行："
  echo "      git remote add origin https://github.com/<账号>/<仓库>.git"
  echo "    （仓库可先在 https://github.com/new 创建一个空仓库）"
  exit 1
fi
echo "    origin = $(git remote get-url origin)"

echo ""
echo "==> 3/4 提交变更"
git add -A
if git diff --cached --quiet; then
  echo "    无变化，跳过提交"
else
  git commit -m "deploy: $(date +%Y-%m-%d\ %H:%M)"
  echo "    已提交"
fi

echo ""
echo "==> 4/4 推送到 main"
echo "    如提示输入凭据：用户名填 GitHub 账号，密码填 Personal Access Token"
echo "    （Token 需勾选 repo 权限：https://github.com/settings/tokens）"
echo ""
git push origin HEAD:main

echo ""
echo "=========================================="
echo "推送完成！GitHub Actions 将自动构建并部署。"
echo ""
echo "查看进度：仓库 → Actions 标签页"
echo "发布后地址：https://<账号>.github.io/<仓库>/"
echo ""
echo "★ 首次使用请到：仓库 → Settings → Pages → Source"
echo "  选择 'GitHub Actions'，保存后下次推送即自动生效。"
echo "=========================================="
