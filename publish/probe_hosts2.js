// 第二轮：测试更多免注册托管 + 检查外网连通性
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FILE = process.argv[2] || 'site/分仓组装量计算器-离线版.html';
const data = fs.readFileSync(FILE);
const tmp = path.join(process.env.TEMP, 'upload_probe.html');
fs.writeFileSync(tmp, data);
console.log('待上传 ' + (data.length / 1024).toFixed(0) + ' KB\n');

function curl(args, input) {
  try {
    const opts = { encoding: 'utf8', timeout: 90000, windowsHide: true };
    if (input) opts.input = input;
    return execFileSync('curl', args, opts);
  } catch (e) {
    return '[ERR] ' + (e.stdout || '').trim() + ' | ' + (e.message || '').substring(0, 90);
  }
}

// 先测连通性
console.log('=== 外网连通性 ===');
[['baidu', 'https://www.baidu.com'], ['github', 'https://github.com'],
 ['cloudflare', 'https://www.cloudflare.com'], ['pixeldrain', 'https://pixeldrain.com/api']
].forEach(function (c) {
  const out = String(curl(['-sS', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '20', c[1]])).trim();
  console.log('  ' + c[0].padEnd(12) + ' HTTP=' + out);
});
console.log('');

console.log('=== 托管尝试 ===');
const targets = [
  ['pixeldrain', ['-sS', '-F', 'file=@' + tmp, 'https://pixeldrain.com/api/file']],
  ['litterbox', ['-sS', '-F', 'reqtype=fileupload', '-F', 'time=1h', '-F', 'fileToUpload=@' + tmp, 'https://litterbox.catbox.moe/resources/internals/api.php']],
  ['filebin', ['-sS', '-F', 'file=@' + tmp, 'https://filebin.net/upload.php']],
  ['transfer.sh', ['-sS', '--upload-file', tmp, 'https://transfer.sh/' + path.basename(FILE)]],
  ['temp.sh', ['-sS', '-F', 'file=@' + tmp, 'https://temp.sh/upload']]
];

targets.forEach(function (t) {
  const out = String(curl(t[1])).trim();
  console.log('--- ' + t[0] + ' ---');
  console.log('  ' + out.substring(0, 260).replace(/\n/g, ' | '));
  console.log('');
});
