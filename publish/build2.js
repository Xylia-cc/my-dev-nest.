// 构建单文件版 + 准备发布目录（输出到全新目录，避免覆盖写被拦截）
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assembly_calculator');
const STAMP = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const PUB = path.join(ROOT, 'publish-' + STAMP);
fs.mkdirSync(PUB, { recursive: true });

// 1) index.html（把 CDN 换成本地库）
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html.replace(
  /<script src="https:\/\/cdn\.sheetjs\.com[^"]*"><\/script>/,
  '<script src="xlsx.full.min.js"></script>'
);
fs.writeFileSync(path.join(PUB, 'index.html'), html, 'utf8');
fs.copyFileSync(path.join(SRC, 'engine.js'), path.join(PUB, 'engine.js'));
fs.copyFileSync(path.join(SRC, 'sample_data.js'), path.join(PUB, 'sample_data.js'));
fs.copyFileSync(path.join(ROOT, 'node_modules/xlsx/dist/xlsx.full.min.js'), path.join(PUB, 'xlsx.full.min.js'));

// 2) 单文件版：把 xlsx / engine / sample_data 全部内联
const deps = ['xlsx.full.min.js', 'engine.js', 'sample_data.js'];
let single = html;
let replaced = 0;
for (const name of deps) {
  const tag = '<script src="' + name + '"></script>';
  const content = fs.readFileSync(path.join(PUB, name), 'utf8');
  const rep = '<script data-inlined="' + name + '">\n' + content + '\n</script>';
  while (single.indexOf(tag) >= 0) {
    single = single.replace(tag, rep);
    replaced++;
  }
}

const outPath = path.join(PUB, '分仓组装量计算器-离线版.html');
fs.writeFileSync(outPath, single, 'utf8');

const leftScript = single.match(/<script[^>]*src=[^>]*>/g);
const leftLink = single.match(/<link[^>]*href=[^>]*>/g);
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);

console.log('=== 构建完成 ===');
console.log('发布目录: ' + PUB);
console.log('单文件版: ' + path.basename(outPath) + ' (' + kb + ' KB)');
console.log('内联替换数: ' + replaced);
console.log('剩余 script src: ' + (leftScript ? JSON.stringify(leftScript) : '无 ✅'));
console.log('剩余 link href: ' + (leftLink ? JSON.stringify(leftLink) : '无 ✅'));
console.log('CDN 残留: ' + (single.includes('cdn.sheetjs.com') ? '❌ 有' : '✅ 无'));
console.log('剩余库存列: ' + (single.includes('剩余库存') ? '✅' : '❌'));
console.log('关系3 支持: ' + (/relation: 3/.test(single) ? '✅' : '❌'));
console.log('批次3 边界修复: ' + (/candCaps/.test(single) ? '✅' : '❌'));
console.log('---PUB_DIR---');
console.log(PUB);
