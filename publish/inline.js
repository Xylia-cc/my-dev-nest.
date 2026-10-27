const fs = require('fs');
const path = require('path');

const PUB = process.argv[2] || '.';
const deps = ['xlsx.full.min.js', 'engine.js', 'sample_data.js'];

let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
let n = 0;
for (const name of deps) {
  const tag = '<script src="' + name + '"></script>';
  const c = fs.readFileSync(path.join(PUB, name), 'utf8');
  const rep = '<script data-inlined="' + name + '">\n' + c + '\n</script>';
  while (html.indexOf(tag) >= 0) { html = html.replace(tag, rep); n++; }
}
console.log('内联完成, 替换 ' + n + ' 处, 长度=' + html.length);

const out = path.join(PUB, 'offline.html');
fs.writeFileSync(out, html, 'utf8');
console.log('写出: ' + out + ' (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');

const leftScript = html.match(/<script[^>]*src=[^>]*>/g);
const leftLink = html.match(/<link[^>]*href=[^>]*>/g);
console.log('剩余 script src: ' + (leftScript ? JSON.stringify(leftScript) : '无 OK'));
console.log('剩余 link href: ' + (leftLink ? JSON.stringify(leftLink) : '无 OK'));
console.log('CDN 残留: ' + (html.includes('cdn.sheetjs.com') ? '有 BAD' : '无 OK'));
console.log('剩余库存列: ' + (html.includes('剩余库存') ? 'OK' : '缺'));
console.log('关系3: ' + (/relation: 3/.test(html) ? 'OK' : '缺'));
console.log('批次3边界: ' + (/candCaps/.test(html) ? 'OK' : '缺'));
