// GitHub Device Flow 登录 —— 用户只需在浏览器点一次「授权」
// 官方文档：https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/device-flow
// 无需 Client Secret，无需 PAT，全程在用户浏览器完成

const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CLIENT_ID = process.argv[2];
const SCOPE = 'repo workflow';

if (!CLIENT_ID) {
  console.error('用法: node github_device_login.js <client_id>');
  process.exit(1);
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'WorkBuddy-Assembly-Calculator'
      }
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(new Error('响应解析失败: ' + d.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('正在请求设备授权码...');
  const dev = await post('https://github.com/login/device/code', {
    client_id: CLIENT_ID,
    scope: SCOPE
  });
  if (!dev.device_code) {
    console.error('失败:', JSON.stringify(dev));
    process.exit(1);
  }

  console.log('');
  console.log('============================================');
  console.log(' 请在浏览器打开以下链接完成授权：');
  console.log('');
  console.log('   ' + dev.verification_uri);
  console.log('');
  console.log('   授权码: ' + dev.user_code);
  console.log('');
  console.log(' (授权后回到这里，脚本会自动继续)');
  console.log('============================================');
  console.log('');

  const interval = (dev.interval || 5) * 1000;
  const deadline = Date.now() + (dev.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const tok = await post('https://github.com/login/oauth/access_token', {
        client_id: CLIENT_ID,
        device_code: dev.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      });
      if (tok.access_token) {
        const out = path.join(process.env.HOME || process.env.USERPROFILE, '.workbuddy', 'github_token.txt');
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, tok.access_token, 'utf8');
        console.log('✅ 授权成功！Token 已保存到 ' + out);
        console.log('   账号: ' + (tok.scope || '') );
        process.exit(0);
      }
      if (tok.error === 'authorization_pending') continue;
      if (tok.error === 'slow_down') { await new Promise((r) => setTimeout(r, interval)); continue; }
      console.error('授权失败:', JSON.stringify(tok));
      process.exit(1);
    } catch (e) {
      console.error('请求出错:', e.message);
    }
  }
  console.error('授权超时');
  process.exit(1);
}
main();
