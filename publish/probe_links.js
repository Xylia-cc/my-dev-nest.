// 直接调用 PaaS /workspaces/{spaceKey}/links，看服务端返回的真实分享链接
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = 'F:/0411/WorkBuddy/resources/app.asar.unpacked/resources/builtin-skills/cloudstudio-deploy/scripts';
const DEPLOY_JS = path.join(SCRIPT_DIR, 'deploy.js');

// 从 deploy.js 里抽出 ENV_PRESETS
const src = fs.readFileSync(DEPLOY_JS, 'utf8');
const m = src.match(/const ENV_PRESETS\s*=\s*([\s\S]*?);\s*\n/);
if (!m) { console.error('未找到 ENV_PRESETS'); process.exit(1); }
const presets = eval('(' + m[1] + ')');
console.log('ENV_PRESETS:', JSON.stringify(presets, null, 2));

const spaceKey = process.argv[2];
const port = Number(process.argv[3] || 3000);
const apiKey = process.env.CS_API_KEY || '';

const preset = presets[process.env.CS_ENV] || presets.external;
const PAAS_API = process.env.CS_PAAS_API || preset.paasApi;

console.log('\nspaceKey =', spaceKey);
console.log('PAAS_API =', PAAS_API);
console.log('API_KEY 长度 =', apiKey.length);

async function main() {
  // 1) 拿 /links
  try {
    const res = await fetch(PAAS_API + '/workspaces/' + spaceKey + '/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ port, expire: 157680000 })
    });
    const data = await res.json();
    console.log('\n=== /links 原始返回 ===');
    console.log(JSON.stringify(data, null, 2));
    if (data.code === 0 && data.data && data.data.host) {
      const link = data.data.scheme + '://' + data.data.host;
      console.log('\n★ 服务端返回的完整分享链接:\n  ' + link);
      // 2) 验证可访问性
      try {
        const r2 = await fetch(link, { redirect: 'manual' });
        console.log('  访问状态: HTTP ' + r2.status);
      } catch (e) {
        console.log('  访问失败: ' + e.message);
      }
    }
  } catch (e) {
    console.log('\n/links 调用失败:', e.message);
  }

  // 3) 列出工作空间，看有哪些可用
  try {
    const r3 = await fetch(PAAS_API + '/workspaces', {
      headers: { Authorization: 'Bearer ' + apiKey }
    });
    const d3 = await r3.json();
    console.log('\n=== /workspaces 列表 ===');
    const list = (d3 && d3.data && (d3.data.items || d3.data.list || d3.data)) || [];
    (Array.isArray(list) ? list : []).forEach(function (w) {
      console.log('  ' + JSON.stringify({
        spaceKey: w.spaceKey || w.key,
        status: w.status,
        expireAt: w.expireAt || w.expire_at,
        links: w.links
      }));
    });
  } catch (e) {
    console.log('/workspaces 调用失败:', e.message);
  }
}
main();
