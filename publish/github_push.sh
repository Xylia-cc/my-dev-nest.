#!/bin/bash
# ============================================================
# 一键发布到 GitHub Pages（完全非交互）
#
#   bash publish/github_push.sh
#
# 流程：读本地 token → 建/更新仓库 → 构建 → 推送 → 开 Pages → 打印地址
#
# 首次需要先存 token（二选一）：
#   A. 运行 bash publish/github_guide.sh（隐藏输入，安全）
#   B. 手动把 token 存到 ~/.workbuddy/github_token.txt
#
# Token 需勾选权限：repo + workflow
# ============================================================
set -e
cd "$(dirname "$0")/.."

REPO=${1:-my-dev-nest}
TOKEN_FILE="$HOME/.workbuddy/github_token.txt"

if [ ! -f "$TOKEN_FILE" ]; then
  echo ""
  echo "⚠️  未找到 token：$TOKEN_FILE"
  echo ""
  echo "请先执行以下命令生成并保存 token："
  echo "    bash publish/github_guide.sh"
  echo ""
  echo "（脚本会一步步提示你在 GitHub 生成 Personal Access Token）"
  echo ""
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")
if [ -z "$TOKEN" ]; then
  echo "⚠️  token 文件为空：$TOKEN_FILE"
  exit 1
fi

node publish/github_auto_publish.js "$REPO" "$TOKEN"
