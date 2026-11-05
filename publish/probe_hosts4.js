// 测试能提供「固定URL + 可覆盖更新」的托管方案
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function curl(args, input) {
  try {
    const o = { encoding: 'utf8', timeout: 120000, windowsHide: true };
    if (input) o.input = input;
    return String(execFileSync('curl', args, o)).trim();
  } catch (e) {
    return '[ERR] ' + (e.stdout || '').trim() + ' | ' + (e.message || '').substring(0, 90);
  }
}

console.log('=== 站点连通性 ===');
[
  ['surge.sh', 'https://surge.sh'],
  ['surge api', 'https://surge.surge.sh/'],
  ['netlify', 'https://api.netlify.com/'],
  ['vercel', 'https://api.vercel.com/'],
  ['cloudflare', 'https://api.cloudflare.com/'],
  ['jsdelivr', 'https://cdn.jsdelivr.net/'],
  ['gist', 'https://gist.github.com/'],
  ['gitlab', 'https://gitlab.com/'],
  ['codeberg', 'https://codeberg.org/'],
  ['gitee', 'https://gitee.com/']
].forEach(function (c) {
  const r = curl(['-sS', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '18', c[1]]);
  console.log('  ' + c[0].padEnd(14) + ' HTTP=' + r);
});

console.log('\n=== 免注册静态托管可达性 ===');
[
  ['static.app', 'https://static.app/'],
  ['neocities', 'https://neocities.org/'],
  ['tiiny.host', 'https://tiiny.host/'],
  ['surge.sh', 'https://surge.sh/'],
  ['host.io', 'https://host.io/'],
  ['fleek', 'https://fleek.co/']
].forEach(function (c) {
  const r = curl(['-sS', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '18', c[1]]);
  console.log('  ' + c[0].padEnd(14) + ' HTTP=' + r);
});
