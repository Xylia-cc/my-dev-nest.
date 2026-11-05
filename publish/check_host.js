// 检查远程页面渲染结果
const fs = require('fs');
const d = fs.readFileSync(process.env.TEMP + '/host1.html', 'utf8');
console.log('=== litter.catbox.moe 浏览器验证 ===');
console.log('  dump 长度:', d.length);
console.log('  标题:', (d.match(/<title>([^<]*)<\/title>/) || ['?', '?'])[1]);
console.log('  含上传控件:', d.includes('excelFile') ? 'OK' : '缺');
console.log('  含结果区:', d.includes('resultPanel') ? 'OK' : '缺');
const hidden = /id="resultPanel"[^>]*display:\s*none/.test(d);
console.log('  结果区默认隐藏:', hidden ? 'OK（打开无结果）' : '需确认');
console.log('  含 XLSX 库:', d.includes('XLSX') ? 'OK' : '缺');
console.log('  含引擎:', d.includes('AssemblyEngine') ? 'OK' : '缺');
