// 测试支持「固定路径 + 覆盖更新」的免注册托管
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FILE = process.argv[2] || 'site/分仓组装量计算器-离线版.html';
const data = fs.readFileSync(FILE);
const tmp = path.join(process.env.TEMP, 'up3.html');
fs.writeFileSync(tmp, data);

function curl(args, input) {
  try {
    const o = { encoding: 'utf8', timeout: 120000, windowsHide: true };
    if (input) o.input = input;
    return String(execFileSync('curl', args, o)).trim();
  } catch (e) {
    return '[ERR] ' + (e.stdout || '').trim() + ' | ' + (e.message || '').substring(0, 80);
  }
}

const NAME = 'assembly-calculator.html';

console.log('=== 候选托管 ===');

// 1. bashupload.com —— 路径固定，可覆盖
console.log('--- bashupload.com (固定路径) ---');
let out = curl(['-sS', '--upload-file', tmp, 'https://bashupload.com/' + NAME]);
console.log('  ' + out);
if (/^https/.test(out)) {
  console.log('  验证: ' + curl(['-sS', '-L', '-o', 'NUL', '-w', 'HTTP=%{http_code} type=%{content_type} size=%{size_download}', '--max-time', '40', out]));
}

// 2. temp.sh —— 随机路径（每次不同），但可记录
console.log('\n--- temp.sh ---');
out = curl(['-sS', '-F', 'file=@' + tmp, 'https://temp.sh/upload']);
console.log('  ' + out);

// 3. litterbox —— 临时但可指定文件名？测试
console.log('\n--- litterbox (带自定义文件名) ---');
out = curl(['-sS', '-F', 'reqtype=fileupload', '-F', 'time=1h', '-F', 'fileToUpload=@' + tmp, 'https://litterbox.catbox.moe/resources/internals/api.php']);
console.log('  ' + out);
if (/^https/.test(out)) {
  console.log('  验证: ' + curl(['-sS', '-L', '-o', 'NUL', '-w', 'HTTP=%{http_code} type=%{content_type} size=%{size_download}', '--max-time', '40', out]));
}
