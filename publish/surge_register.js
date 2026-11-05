// 测试 surge.sh 自动注册（临时邮箱）+ 固定域名发布
// surge 注册只需 email+password，无需邮箱验证
const https = require('https');
const fs = require('fs');
const path = require('path');

function req(url, opts) {
  return new Promise((resolve, reject) => {
    opts = opts || {};
    const u = new URL(url);
    const r = https.request({
      method: opts.method || 'GET',
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: opts.headers || {}
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d, headers: res.headers }));
    });
    r.on('error', reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

// 1) 申请临时邮箱
async function getTempMail() {
  const domains = await req('https://api.mail.tm/domains', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j = JSON.parse(domains.body);
  // mail.tm 用 hydra 格式：hydra:member 才是数组
  const arr = Array.isArray(j) ? j : (j['hydra:member'] || j.member || []);
  const list = arr.map((x) => x.domain).filter((d) => d && !d.includes('patch'));
  if (!list.length) throw new Error('无可用临时邮箱域名: ' + domains.body.substring(0, 150));
  const domain = list[0];
  const addr = 'wbcalc' + Date.now() + '@' + domain;
  const r = await req('https://api.mail.tm/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ address: addr, password: 'WbCalc!2026' })
  });
  if (r.status !== 201 && r.status !== 200) throw new Error('建邮箱失败: ' + r.body.substring(0, 200));
  return { addr, pass: 'WbCalc!2026' };
}

// 2) surge 注册
async function surgeRegister(email, password) {
  const r = await req('https://surge.surge.sh/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password })
  });
  let j = {};
  try { j = JSON.parse(r.body); } catch (e) { }
  if (!j.token) throw new Error('surge 注册失败: ' + r.body.substring(0, 200));
  return j.token;
}

(async function () {
  try {
    console.log('[1] 申请临时邮箱...');
    const mail = await getTempMail();
    console.log('    ' + mail.addr);

    console.log('[2] 注册 surge 账号...');
    const token = await surgeRegister(mail.addr, mail.pass);
    console.log('    ✅ token 获取成功 (' + token.length + ' 字符)');

    const out = path.join(process.env.HOME || process.env.USERPROFILE, '.workbuddy', 'surge_token.txt');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, token, 'utf8');
    console.log('    已保存到 ' + out);

    console.log('[3] 邮箱/密码（供你以后重新登录）:');
    console.log('    ' + mail.addr + '  /  ' + mail.pass);
    fs.writeFileSync(path.join(path.dirname(out), 'surge_account.txt'),
      mail.addr + ' ' + mail.pass, 'utf8');
  } catch (e) {
    console.error('失败:', e.message);
    process.exit(1);
  }
})();
