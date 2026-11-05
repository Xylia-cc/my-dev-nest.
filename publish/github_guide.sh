#!/bin/bash
# ============================================================
# GitHub 凭据配置 + 一键发布
#
#   方式 1（推荐，token 不进对话/命令历史）：
#       bash publish/github_guide.sh
#       → 会提示你粘贴 token（输入不回显），保存到本地
#
#   方式 2（自动化/脚本调用）：
#       bash publish/github_guide.sh <repo名> <token>
#
# Token 生成（GitHub → Settings → Developer settings → Tokens → Fine-grained
# 或 Classic）：
#   https://github.com/settings/tokens/new
#   权限勾选：repo（读写仓库）+ workflow（写 Actions）
# ============================================================
set -e
cd "$(dirname "$0")/.."

REPO=${1:-my-dev-nest}
TOKEN_FILE="$HOME/.workbuddy/github_token.txt"

# ---- 情况 A：命令行已带 token ----
if [ -n "$2" ]; then
  mkdir -p "$HOME/.workbuddy"
  printf '%s' "$2" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE" 2>/dev/null || true
  echo "[✓] token 已保存"
  node publish/github_auto_publish.js "$REPO" "$2"
  exit $?
fi

# ---- 情况 B：本地已存 token ----
if [ -f "$TOKEN_FILE" ] && [ -s "$TOKEN_FILE" ]; then
  TOKEN=$(cat "$TOKEN_FILE")
  if [ -n "$TOKEN" ]; then
    echo "[✓] 使用已保存的 token"
    node publish/github_auto_publish.js "$REPO" "$TOKEN"
    exit $?
  fi
fi

# ---- 情况 C：交互输入 ----
cat <<'GUIDE'

============================================
 生成 Personal Access Token（约 1 分钟）
============================================

  1. 打开 https://github.com/settings/tokens/new
  2. Note 填：assembly-calculator
  3. Expiration 选：90 days
  4. 勾选权限：
         ✅ repo        读写仓库（私有仓库必需）
         ✅ workflow    写入 GitHub Actions 配置
  5. 拉到底部点 Generate token
  6. 复制那串 ghp_ 开头的字符

  提示：token 只保存在你本机，不会进入任何对话记录。

GUIDE

printf "  粘贴 token（输入不回显，直接粘贴后回车）: "
read -r -s TOKEN
echo ""
echo ""

if [ -z "$TOKEN" ]; then
  echo "未输入 token，已退出。"
  exit 1
fi

mkdir -p "$HOME/.workbuddy"
printf '%s' "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE" 2>/dev/null || true
echo "[✓] token 已保存到 $TOKEN_FILE"

node publish/github_auto_publish.js "$REPO" "$TOKEN"
