#!/bin/bash
# ============================================================
# GitHub Pages 一键发布（交互式引导）
#
#   bash publish/github_guide.sh
#
# 首次使用会：
#   1. 引导你生成 Personal Access Token（浏览器里点几下）
#   2. 保存 token 到 ~/.workbuddy/github_token.txt
#   3. 自动建仓库 + 推代码 + 开 Pages
#
# 之后每次发版：bash publish/github_guide.sh   （直接输入 token 即可）
# ============================================================
set -e
cd "$(dirname "$0")/.."

REPO=${1:-assembly-calculator}
TOKEN_FILE="$HOME/.workbuddy/github_token.txt"

echo "============================================"
echo " 分仓组装量计算器 · GitHub Pages 自动发布"
echo "============================================"
echo ""

if [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(cat "$TOKEN_FILE")
  echo "[✓] 已找到保存的 token"
else
  echo "首次使用需要 GitHub Token（Personal Access Token）"
  echo ""
  echo "  生成方法（约 1 分钟）："
  echo "    1. 打开 https://github.com/settings/tokens/new"
  echo "    2. Note 随便填（如 assembly-calculator）"
  echo "    3. Expiration 选 90 days"
  echo "    4. 勾选这两项权限："
  echo "         ✅ repo         (读写仓库，用于建仓库和推送)"
  echo "         ✅ workflow     (写入 GitHub Actions 配置)"
  echo "    5. 拉到底点 Generate token"
  echo "    6. 复制那串 ghp_ 开头的字符"
  echo ""
  echo "  然后把 token 粘贴到下面（输入时不显示，安全）："
  echo ""
  read -r -s -p "  token: " TOKEN
  echo ""
  echo ""

  if [ -z "$TOKEN" ]; then
    echo "未输入 token，已退出。"
    exit 1
  fi

  mkdir -p "$HOME/.workbuddy"
  echo "$TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE" 2>/dev/null || true
  echo "[✓] token 已保存到 $TOKEN_FILE"
  echo ""
fi

echo "[1/3] 发布中..."
node publish/github_auto_publish.js "$REPO" "$TOKEN"
