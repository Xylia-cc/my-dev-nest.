// 验证远程页面渲染（通用）
const fs = require('fs');
const file = process.argv[2] || (process.env.TEMP + '/lan.html');
const d = fs.readFileSync(file, 'utf8');
console.log('=== ' + (process.argv[3] || '页面') + ' ===');
console.log('  dump 长度:', d.length);
console.log('  标题:', (d.match(/<title>([^<]*)<\/title>/) || ['?', '?'])[1]);
console.log('  上传控件:', d.includes('excelFile') ? 'OK' : '缺');
console.log('  结果区默认隐藏:', /id="resultPanel"[^>]*display:\s*none/.test(d) ? 'OK（打开无结果）' : '需确认');
console.log('  XLSX 库:', d.includes('XLSX') ? 'OK' : '缺');
console.log('  引擎:', d.includes('AssemblyEngine') ? 'OK' : '缺');
console.log('  剩余库存列:', d.includes('剩余库存') ? 'OK' : '缺');
