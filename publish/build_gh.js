// 构建 GitHub Pages 站点（跨平台：本地 + GitHub Actions 通用）
// 输出：site/ 目录（含 index.html / engine.js / sample_data.js / xlsx.full.min.js / 离线单文件版 / 404.html）
//
// ★ 内联铁律（详见 MEMORY.md）：
//   1. 替换必须用函数形式 html.replace(tag, function(){return rep;}) —— 替换串含 $ 会导致字符串爆炸
//   2. 第三方库（xlsx）源码含 '<html>...<body>'、'</body></html>' 字面量，
//      内联时必须包成 JSON 字符串字面量并把所有 '<' 转成 \u003c，运行时 eval() 执行
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assembly_calculator');
const OUT = path.join(ROOT, 'site');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// 清理旧产物（GitHub Actions 上是干净环境，本地可能有残留）
if (fs.existsSync(OUT)) {
  fs.readdirSync(OUT).forEach(function (f) {
    try { fs.unlinkSync(path.join(OUT, f)); } catch (e) { /* 忽略占用中的文件 */ }
  });
} else {
  ensureDir(OUT);
}

// 1) index.html：CDN → 本地库引用
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html.replace(
  /<script src="https:\/\/cdn\.sheetjs\.com[^"]*"><\/script>/,
  '<script src="xlsx.full.min.js"></script>'
);
fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');

// 2) 其余资源
fs.copyFileSync(path.join(SRC, 'engine.js'), path.join(OUT, 'engine.js'));
fs.copyFileSync(path.join(SRC, 'sample_data.js'), path.join(OUT, 'sample_data.js'));

// xlsx 库：优先用 node_modules；找不到则尝试从 npm 临时安装目录取
function resolveXlsx() {
  const candidates = [
    path.join(ROOT, 'node_modules/xlsx/dist/xlsx.full.min.js'),
    path.join(ROOT, 'node_modules/xlsx/dist/xlsx.full.min.js'.replace(/\//g, path.sep))
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('找不到 xlsx.full.min.js，请先执行 npm install xlsx');
}
fs.copyFileSync(resolveXlsx(), path.join(OUT, 'xlsx.full.min.js'));

// 3) 离线单文件版：全部内联
function toSafeJsonLiteral(js) {
  return JSON.stringify(js).replace(/</g, '\\u003c');
}
let single = html;
let replaced = 0;
{
  const tag = '<script src="xlsx.full.min.js"></script>';
  const raw = fs.readFileSync(path.join(OUT, 'xlsx.full.min.js'), 'utf8');
  const rep = '<script data-inlined="xlsx.full.min.js">\n' +
    'eval(' + toSafeJsonLiteral(raw) + ');\n' +
    '</script>';
  while (single.indexOf(tag) >= 0) {
    single = single.replace(tag, function () { return rep; });
    replaced++;
  }
}
['engine.js', 'sample_data.js'].forEach(function (name) {
  const tag = '<script src="' + name + '"></script>';
  const raw = fs.readFileSync(path.join(OUT, name), 'utf8');
  const safe = raw.replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
  const rep = '<script data-inlined="' + name + '">\n' + safe + '\n</script>';
  while (single.indexOf(tag) >= 0) {
    single = single.replace(tag, function () { return rep; });
    replaced++;
  }
});
fs.writeFileSync(path.join(OUT, '分仓组装量计算器-离线版.html'), single, 'utf8');

// 4) 404 回退页（Pages 路由需要）
fs.writeFileSync(path.join(OUT, '404.html'), html, 'utf8');

// ---- 校验 ----
const leftScript = single.match(/<script[^>]*src=[^>]*>/g);
const leftLink = single.match(/<link[^>]*href=[^>]*>/g);
const libStart = single.indexOf('data-inlined="xlsx.full.min.js"');
const libEnd = single.indexOf('data-inlined="engine.js"');
const libInner = single.slice(libStart, libEnd).slice(0, single.slice(libStart, libEnd).indexOf('</script'));
let rawLt = 0, p = -1;
while ((p = libInner.indexOf('<', p + 1)) >= 0) rawLt++;

const checks = [
  ['剩余 script src', leftScript ? JSON.stringify(leftScript) : '无 ✓'],
  ['剩余 link href', leftLink ? JSON.stringify(leftLink) : '无 ✓'],
  ['CDN 残留', single.indexOf('cdn.sheetjs.com') >= 0 ? '有 ✗' : '无 ✓'],
  ['xlsx 块内裸 < ', rawLt === 0 ? '0 ✓' : rawLt + ' ✗'],
  ['自动计算已移除', single.indexOf('runCompute(sd.bom') >= 0 ? '否 ✗' : '是 ✓'],
  ['剩余库存列', single.indexOf('剩余库存') >= 0 ? '✓' : '✗'],
  ['关系3 支持', /relation: 3/.test(single) ? '✓' : '✗'],
  ['批次3 边界修复', /candCaps/.test(single) ? '✓' : '✗']
];
let bad = 0;
console.log('=== 构建完成 → site/ ===');
checks.forEach(function (c) {
  if (String(c[1]).indexOf('✗') >= 0) bad++;
  console.log('  ' + c[0] + ': ' + c[1]);
});
console.log('  内联替换数: ' + replaced);
console.log('  产物: ' + fs.readdirSync(OUT).join(', '));
if (bad > 0) {
  console.error('构建校验未通过：' + bad + ' 项');
  process.exit(1);
}
