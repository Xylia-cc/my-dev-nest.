// 构建单文件版 + 准备 publish 目录
// ★ 关键1：内联时必须用函数形式 replace —— 替换串里的 $ 会被当作特殊模式导致字符串爆炸
// ★ 关键2（关键！）：内联的第三方库（xlsx）源码里含 '<html><head>...<body>'、'</body></html>'、
//          '<!--' 等字面量。浏览器在 <script> 内遇到 '</script' 结束脚本，但遇到 '<body>' 等
//          标签会**提前结束 head/body**，导致后续页面结构错乱、脚本不执行。
//          稳妥方案：把库源码整体用 JSON.stringify 成一个 JS 字符串字面量再赋值给 window.XLSX，
//          并把其中所有 '<' 转义为 '\\u003c' —— JSON 解析后自动还原，HTML 解析器完全看不到标签。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assembly_calculator');
const STAMP = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const PUB = path.join(ROOT, 'publish-' + STAMP);
fs.mkdirSync(PUB, { recursive: true });

// 1) index.html（CDN → 本地库）
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html.replace(
  /<script src="https:\/\/cdn\.sheetjs\.com[^"]*"><\/script>/,
  '<script src="xlsx.full.min.js"></script>'
);
fs.writeFileSync(path.join(PUB, 'index.html'), html, 'utf8');
fs.copyFileSync(path.join(SRC, 'engine.js'), path.join(PUB, 'engine.js'));
fs.copyFileSync(path.join(SRC, 'sample_data.js'), path.join(PUB, 'sample_data.js'));
fs.copyFileSync(path.join(ROOT, 'node_modules/xlsx/dist/xlsx.full.min.js'), path.join(PUB, 'xlsx.full.min.js'));

// 2) 单文件版
//    - xlsx：整库包成 JSON 字符串字面量（'<' → '<u003c'），执行时 window.XLSX = JSON.parse(...)
//    - engine / sample_data：自研代码不含 HTML 标签字面量，但同样做 '<' 转义保险
function toSafeJsLiteral(js) {
  // 先做 JSON.stringify，再把 '<' 转成 < —— 避免 HTML 解析器误判标签
  return JSON.stringify(js).replace(/</g, '\\u003c');
}

let single = html;
let replaced = 0;

// xlsx 库
{
  const tag = '<script src="xlsx.full.min.js"></script>';
  const raw = fs.readFileSync(path.join(PUB, 'xlsx.full.min.js'), 'utf8');
  const rep = '<script data-inlined="xlsx.full.min.js">\n' +
    'window.XLSX = JSON.parse(' + toSafeJsLiteral(raw) + ');\n' +
    '</script>';
  while (single.indexOf(tag) >= 0) {
    single = single.replace(tag, function () { return rep; });
    replaced++;
  }
}

// engine / sample_data：直接内联（自研代码无标签字面量），但 '<' 也转义成 < 更保险
['engine.js', 'sample_data.js'].forEach(function (name) {
  const tag = '<script src="' + name + '"></script>';
  const raw = fs.readFileSync(path.join(PUB, name), 'utf8');
  // 直接内联原样（它们是普通 JS，不含 </script>），但把 '<' 转义为 < 以防万一
  const safe = raw.replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
  const rep = '<script data-inlined="' + name + '">\n' + safe + '\n</script>';
  while (single.indexOf(tag) >= 0) {
    single = single.replace(tag, function () { return rep; });
    replaced++;
  }
});

const outPath = path.join(PUB, '分仓组装量计算器-离线版.html');
fs.writeFileSync(outPath, single, 'utf8');

const leftScript = single.match(/<script[^>]*src=[^>]*>/g);
const leftLink = single.match(/<link[^>]*href=[^>]*>/g);
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);

// 校验：库块内不应再有未转义的 '<'
const libStart = single.indexOf('data-inlined="xlsx.full.min.js"');
const libEnd = single.indexOf('data-inlined="engine.js"');
const libChunk = single.slice(libStart, libEnd);
let badLt = 0, p = -1;
while ((p = libChunk.indexOf('<', p + 1)) >= 0) {
  const nxt = libChunk.charAt(p + 1);
  if (nxt === '/' || nxt === '!' || /[a-zA-Z]/.test(nxt)) badLt++;
}

console.log('=== 构建完成 ===');
console.log('发布目录: ' + PUB);
console.log('单文件版: 分仓组装量计算器-离线版.html (' + kb + ' KB)');
console.log('内联替换数: ' + replaced);
console.log('剩余 script src: ' + (leftScript ? JSON.stringify(leftScript) : '无 OK'));
console.log('剩余 link href: ' + (leftLink ? JSON.stringify(leftLink) : '无 OK'));
console.log('CDN 残留: ' + (single.includes('cdn.sheetjs.com') ? '有 BAD' : '无 OK'));
console.log('库块内可疑 < 标签序列: ' + badLt + (badLt === 0 ? ' OK' : ' BAD'));
console.log('真实 </body> 位置: ' + single.lastIndexOf('</body>') + ' / 长度 ' + single.length);
console.log('第一个 <body> 位置: ' + single.indexOf('<body'));
console.log('自动计算已移除: ' + (single.includes('runCompute(sd.bom') ? '否 BAD' : '是 OK'));
console.log('剩余库存列: ' + (single.includes('剩余库存') ? 'OK' : '缺'));
console.log('关系3: ' + (/relation: 3/.test(single) ? 'OK' : '缺'));
console.log('批次3边界: ' + (/candCaps/.test(single) ? 'OK' : '缺'));
console.log('PUB_DIR=' + PUB);
