#!/bin/bash
# 一键发布：把最新代码同步到 dist/ 并提交推送到 GitHub Pages 仓库
# 用法：bash publish_to_github.sh
set -e
cd "$(dirname "$0")"
SRC=assembly_calculator
DIST=dist

echo "==> 同步代码到 $DIST/"
cp "$SRC/index.html" "$DIST/"
cp "$SRC/engine.js" "$DIST/"
cp "$SRC/sample_data.js" "$DIST/"
cp node_modules/xlsx/dist/xlsx.full.min.js "$DIST/"

# 把 CDN 引用改成本地库（离线/内网也能用）
node -e "
const fs=require('fs');
const p='$DIST/index.html';
let s=fs.readFileSync(p,'utf8');
s=s.replace(/<script src=\"https:////cdn/.sheetjs/.com[^/"]*/"><//script>/,'<script src=\"xlsx.full.min.js\"></script>');
fs.writeFileSync(p,s);
console.log('  CDN 引用 -> 本地库: ' + (s.includes('xlsx.full.min.js') ? 'OK' : 'FAIL'));
"

echo "==> 提交并推送"
cd "$DIST"
if [ ! -d .git ]; then
  git init -q
  git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPO.git
fi
git add -A
git commit -q -m "deploy: update $(date +%Y-%m-%d\ %H:%M)"
git push origin HEAD:main
echo "==> 完成。仓库设置中开启 Pages，来源选 main 分支 / 根目录即可。"
