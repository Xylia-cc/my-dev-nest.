#!/bin/bash
# ============================================================
# GitHub Pages 一键发布（交互式）
#
#   bash publish_gh.sh
#
# 首次会引导你完成：
#   1. 输入 GitHub 仓库地址（若未设置 origin）
#   2. 推送时 git 自行提示输入账号 + Personal Access Token
#      （凭据只在本机 git 中使用，不经过任何对话）
#
# 之后每次发版只需再跑一次；push 完成 Actions 自动部署，链接永久不变。
# ============================================================
set -e
cd "$(dirname "$0")"

echo "=========================================="
echo " 分仓组装量计算器 · 发布到 GitHub Pages"
echo "=========================================="
echo ""

# ---------- 1. 构建 ----------
echo "[1/4] 构建静态站点..."
node publish/build_gh.js
echo ""

# ---------- 2. 远程仓库 ----------
if ! git remote get-url origin > /dev/null 2>&1; then
  echo "[2/4] 设置远程仓库"
  echo ""
  echo "  还没设置 origin。请先在 https://github.com/new 建一个空仓库"
  echo "  （仓库名随意，不要勾选 README），然后把仓库地址发给我，"
  echo "  或自己执行："
  echo ""
  echo "    git remote add origin https://github.com/<账号>/<仓库>.git"
  echo ""
  exit 1
fi
echo "[2/4] origin = $(git remote get-url origin)"

# ---------- 3. 提交 ----------
echo ""
echo "[3/4] 提交变更..."
git add -A
if git diff --cached --quiet; then
  echo "      无变化，跳过提交"
else
  git commit -m "deploy: $(date +%Y-%m-%d\ %H:%M)"
  echo "      已提交"
fi

# ---------- 4. 推送 ----------
echo ""
echo "[4/4] 推送到 main（GitHub Actions 会自动部署）"
echo ""
echo "  若提示输入凭据："
echo "    Username → 你的 GitHub 账号"
echo "    Password → Personal Access Token"
echo "      (https://github.com/settings/tokens 生成，勾选 repo 权限)"
echo ""
git push origin HEAD:main

REPO_URL=$(git remote get-url origin)
REPO_NAME=$(echo "$REPO_URL" | sed 's#.*\.git##; s#.*/##')
USER_NAME=$(echo "$REPO_URL" | sed 's#.*github.com[:/]##; s#/.*##')

echo ""
echo "=========================================="
echo " 推送完成！"
echo ""
echo " 查看部署进度：$REPO_URL/actions"
echo " 发布后地址：  https://$USER_NAME.github.io/$REPO_NAME/"
echo ""
echo " ★ 首次使用请到：仓库 → Settings → Pages → Source"
echo "   选择 'GitHub Actions'，保存后下次推送即自动生效。"
echo "=========================================="
