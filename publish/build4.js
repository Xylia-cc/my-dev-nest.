// 构建单文件版 + 准备 publish 目录
// ★ 关键1：内联时必须用函数形式 replace —— 替换串里的 $ 会被当作特殊模式导致字符串爆炸
// ★ 关键2：内联的第三方库（xlsx）源码里含 '</body></html>'、'<!--' 等字面量，
//          浏览器 HTML 解析器会当成真实标签，导致 body 提前结束、后续脚本不执行。
//          必须把这些序列中的 '/' 转义为 '\/'（JS 字符串语义完全等价）。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assembly_calculator');
const STAMP = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const PUB = path.join(ROOT, 'publish-' + STAMP);
fs.mkdirSync(PUB, { recursive: true });

// ---- HTML 解析器敏感序列转义 ----
function escapeForInline(js) {
  return js
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<\/body/gi, '<\\/body')
    .replace(/<\/html/gi, '<\\/html')
    .replace(/<!--/g, '<\\!--');
}

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

// 2) 单文件版：全部内联（带转义）
const deps = ['xlsx.full.min.js', 'engine.js', 'sample_data.js'];
let single = html;
let replaced = 0;
for (const name of deps) {
  const tag = '<script src="' + name + '"></script>';
  const content = escapeForInline(fs.readFileSync(path.join(PUB, name), 'utf8'));
  const rep = '<script data-inlined="' + name + '">\n' + content + '\n</script>';
  while (single.indexOf(tag) >= 0) {
    single = single.replace(tag, function () { return rep; });
    replaced++;
  }
}
const outPath = path.join(PUB, '分仓组装量计算器-离线版.html');
fs.writeFileSync(outPath, single, 'utf8');

const leftScript = single.match(/<script[^>]*src=[^>]*>/g);
const leftLink = single.match(/<link[^>]*href=[^>]*>/g);
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);

// 校验：库内 </body> 是否已转义
const libStart = single.indexOf('data-inlined="xlsx.full.min.js"');
const libEnd = single.indexOf('data-inlined="engine.js"');
const libChunk = single.slice(libStart, libEnd);
const badBody = (libChunk.match(/<\/body/gi) || []).length;
const badScript = (libChunk.match(/<\/script/gi) || []).length;

console.log('=== 构建完成 ===');
console.log('发布目录: ' + PUB);
console.log('单文件版: 分仓组装量计算器-离线版.html (' + kb + ' KB)');
console.log('内联替换数: ' + replaced);
console.log('剩余 script src: ' + (leftScript ? JSON.stringify(leftScript) : '无 OK'));
console.log('剩余 link href: ' + (leftLink ? JSON.stringify(leftLink) : '无 OK'));
console.log('CDN 残留: ' + (single.includes('cdn.sheetjs.com') ? '有 BAD' : '无 OK'));
console.log('xlsx 库内未转义 </body: ' + badBody + (badBody === 0 ? ' OK' : ' BAD'));
console.log('xlsx 库内未转义 </script: ' + badScript + (badScript === 0 ? ' OK' : ' BAD'));
console.log('真实 </body> 位置: ' + single.lastIndexOf('</body>') + ' / 文件长度 ' + single.length);
console.log('自动计算已移除: ' + (single.includes("runCompute(sd.bom") ? '否 BAD' : '是 OK'));
console.log('剩余库存列: ' + (single.includes('剩余库存') ? 'OK' : '缺'));
console.log('关系3: ' + (/relation: 3/.test(single) ? 'OK' : '缺'));
console.log('批次3边界: ' + (/candCaps/.test(single) ? 'OK' : '缺'));
console.log('PUB_DIR=' + PUB);
