// 测试 catbox 永久托管 + 其他方案，找可长期使用的
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FILE = process.argv[2] || 'site/分仓组装量计算器-离线版.html';
const data = fs.readFileSync(FILE);
const tmp = path.join(process.env.TEMP, 'up2.html');
fs.writeFileSync(tmp, data);

function curl(args) {
  try {
    return execFileSync('curl', args, { encoding: 'utf8', timeout: 120000, windowsHide: true });
  } catch (e) {
    return '[ERR] ' + (e.stdout || '').trim() + ' | ' + (e.message || '').substring(0, 100);
  }
}

console.log('=== 1. catbox 永久托管 ===');
// catbox 需要 User-Agent 头
let out = curl(['-sS', '-A', 'Mozilla/5.0', '-F', 'reqtype=fileupload', '-F', 'fileToUpload=@' + tmp, 'https://catbox.moe/user/api.php']);
console.log('  ' + String(out).trim());
if (out && !String(out).startsWith('[ERR]') && /^https/.test(String(out).trim())) {
  const url = String(out).trim();
  console.log('  验证: ' + curl(['-sS', '-L', '-o', 'NUL', '-w', 'HTTP=%{http_code} type=%{content_type} size=%{size_download}', '--max-time', '40', url]).trim());
}

console.log('\n=== 2. jsDelivr（GitHub 仓库直链，免注册）===');
// jsDelivr 支持 GitHub 仓库：https://cdn.jsdelivr.net/gh/<user>/<repo>@<branch>/<file>
console.log('  需要 GitHub 仓库，稍后随 Pages 一起做');

console.log('\n=== 3. Cloudflare Pages / Vercel / Netlify（需账号）===');
console.log('  需账号授权');

console.log('\n=== 4. 支持「同一链接自动更新」的免注册方案 ===');
const updatable = [
  ['bashupload(可重复覆盖)', ['-sS', '-T', '-P', '-', 'https://bashupload.com/assembly-calculator.html']],
  ['temp.sh(可覆盖)', ['-sS', '-F', 'file=@' + tmp, 'https://temp.sh/upload']]
];
updatable.forEach(function (t) {
  let o;
  try {
    o = execFileSync('curl', t[1], { encoding: 'utf8', timeout: 90000, windowsHide: true, input: data });
  } catch (e) {
    o = '[ERR] ' + (e.stdout || '').trim();
  }
  console.log('  ' + t[0].padEnd(26) + ' → ' + String(o).trim().substring(0, 120).replace(/\n/g, ' | '));
});
