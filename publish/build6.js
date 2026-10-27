// 构建单文件版 + 准备 publish 目录
// ★ 关键1：内联时必须用函数形式 replace —— 替换串里的 $ 会被当作特殊模式导致字符串爆炸
// ★ 关键2（关键！）：内联的第三方库（xlsx）源码里含 '<html><head>...<body>'、'</body></html>'、
//          '<!--' 等字面量。浏览器在 <script> 内虽认 '</script' 为结束，但遇到 '<body>' 等标签
//          会**提前结束 head/body**，导致后续页面结构错乱、脚本不执行。
//          稳妥方案：把库源码包成 JSON 字符串字面量（所有 '<' → '<'），
//          运行时用 (0,eval)(...) 执行 —— 这样 HTML 解析器完全看不到标签，
//          且库代码真正执行（不是只 JSON.parse 出源码字符串）。
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
function toSafeJsonLiteral(js) {
  // JSON.stringify 后把 '<' 转成 < —— HTML 解析器看不到任何标签
  return JSON.stringify(js).replace(/</g, '\\u003c');
}

let single = html;
let replaced = 0;

// xlsx 库：JSON 字面量 + eval 真正执行
//   JSON.stringify(lib) 本身就是「一个 JS 字符串字面量」，直接 eval 它即可让库代码运行；
//   不要再套 JSON.parse（那会把库源码当 JSON 文本解析，必然失败）。
{
  const tag = '<script src="xlsx.full.min.js"></script>';
  const raw = fs.readFileSync(path.join(PUB, 'xlsx.full.min.js'), 'utf8');
  const rep = '<script data-inlined="xlsx.full.min.js">\n' +
    'eval(' + toSafeJsonLiteral(raw) + ');\n' +
    '</script>';
  while (single.indexOf(tag) >= 0) {
    single = single.replace(tag, function () { return rep; });
    replaced++;
  }
}

// engine / sample_data：直接内联（自研代码不含标签字面量），并把 '</' 转义保险
['engine.js', 'sample_data.js'].forEach(function (name) {
  const tag = '<script src="' + name + '"></script>';
  const raw = fs.readFileSync(path.join(PUB, name), 'utf8');
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

// 校验：xlsx 块内除收尾 </script> 外不得有裸 '<'
const libStart = single.indexOf('data-inlined="xlsx.full.min.js"');
const libEnd = single.indexOf('data-inlined="engine.js"');
const libChunk = single.slice(libStart, libEnd);
const firstClose = libChunk.indexOf('</script');
const libInner = libChunk.slice(0, firstClose);
let rawLt = 0, p = -1;
while ((p = libInner.indexOf('<', p + 1)) >= 0) rawLt++;

console.log('=== 构建完成 ===');
console.log('发布目录: ' + PUB);
console.log('单文件版: 分仓组装量计算器-离线版.html (' + kb + ' KB)');
console.log('内联替换数: ' + replaced);
console.log('剩余 script src: ' + (leftScript ? JSON.stringify(leftScript) : '无 OK'));
console.log('剩余 link href: ' + (leftLink ? JSON.stringify(leftLink) : '无 OK'));
console.log('CDN 残留: ' + (single.includes('cdn.sheetjs.com') ? '有 BAD' : '无 OK'));
console.log('xlsx 块内裸 < 数量: ' + rawLt + (rawLt === 0 ? ' OK' : ' BAD'));
console.log('真实 </body> 位置: ' + single.lastIndexOf('</body>') + ' / 长度 ' + single.length);
console.log('第一个 <body> 位置: ' + single.indexOf('<body'));
console.log('自动计算已移除: ' + (single.includes('runCompute(sd.bom') ? '否 BAD' : '是 OK'));
console.log('剩余库存列: ' + (single.includes('剩余库存') ? 'OK' : '缺'));
console.log('关系3: ' + (/relation: 3/.test(single) ? 'OK' : '缺'));
console.log('批次3边界: ' + (/candCaps/.test(single) ? 'OK' : '缺'));
console.log('PUB_DIR=' + PUB);
