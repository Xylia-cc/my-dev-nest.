const fs = require('fs');
const d = fs.readFileSync(process.argv[2], 'utf8');
const libStart = d.indexOf('data-inlined="xlsx.full.min.js"');
const libEnd = d.indexOf('data-inlined="engine.js"');
const chunk = d.slice(libStart, libEnd);

function count(s, sub) {
  let c = 0, p = -1;
  while ((p = d.indexOf(sub, p + 1)) >= 0) c++;
  return c;
}
console.log('文件长度:', d.length);
console.log('库块起点:', libStart, ' 终点:', libEnd);
console.log('库块内 "</body" 出现:', count(chunk, '</body'), '次');
console.log('库块内 "<\\/body" 出现:', count(chunk, '<\\/body'), '次');
console.log('库块内 "<!--" 出现:', count(chunk, '<!--'), '次');
console.log('库块内 "<\\!--" 出现:', count(chunk, '<\\!--'), '次');
console.log('全文件真实 </body> 位置:', d.lastIndexOf('</body>'));
console.log('全文件第一个 <body> 位置:', d.indexOf('<body'));
console.log('--- 库块尾部 300 字符 ---');
console.log(JSON.stringify(chunk.slice(-300)));
