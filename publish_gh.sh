#!/bin/bash
# ============================================================
# 一键发布到 GitHub Pages（发版自动同步）
#
# 用法：
#   bash publish_gh.sh              # 构建 + 提交 + 推送（触发 Actions 自动部署）
#   bash publish_gh.sh --build-only # 只构建，不提交
#
# 前置条件（只需配置一次）：
#   1. git config --global user.name  "你的名字"
#   2. git config --global user.email "你的邮箱"
#   3. git remote add origin https://github.com/<账号>/<仓库>.git
#   4. 配好 GitHub 认证（连接器授权 或 PAT）
#   5. 在仓库 Settings → Pages → Source 选 "GitHub Actions"
# ============================================================
set -e
cd "$(dirname "$0")"

echo "==> 1/3 构建静态站点"
node publish/build_gh.js

if [ "$1" = "--build-only" ]; then
  echo "==> 仅构建完成，产物在 site/"
  exit 0
fi

echo "==> 2/3 提交"
git add -A site .github publish/build_gh.js assembly_calculator 2>/dev/null || true
git add -A .gitignore README.md 2>/dev/null || true
if git diff --cached --quiet; then
  echo "    无变化，跳过提交"
else
  git commit -m "deploy: $(date +%Y-%m-%d\ %H:%M)"
fi

echo "==> 3/3 推送到 main（Actions 会自动部署到 GitHub Pages）"
git push origin HEAD:main

echo ""
echo "完成。GitHub Actions 会自动构建并发布。"
echo "查看进度：仓库 Actions 标签页"
echo "发布后地址：https://<账号>.github.io/<仓库>/"
