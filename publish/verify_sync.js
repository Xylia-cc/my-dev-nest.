// 等待 Actions 完成 + 验证线上页面已更新
const https = require('https');
const fs = require('fs');

const TOKEN = fs.readFileSync(process.env.HOME + '/.workbuddy/github_token.txt', 'utf8').trim();
const REPO = 'my-dev-nest.';
const PAGE = 'https://xylia-cc.github.io/my-dev-nest./';
const MARKER = 'sync-test-marker';

function api(p) {
  return new Promise((res) => {
    https.get('https://api.github.com' + p, {
      headers: { 'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'WorkBuddy', 'Accept': 'application/vnd.github+json' }
    }, (r) => {
      let d = ''; r.on('data', (c) => (d += c));
      r.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) { } res({ code: r.statusCode, j: j }); });
    }).on('error', (e) => res({ code: 'ERR', j: { message: e.code } }));
  });
}

function fetchPage() {
  return new Promise((res) => {
    https.get(PAGE, { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      let d = ''; r.on('data', (c) => (d += c));
      r.on('end', () => res({ code: r.statusCode, body: d }));
    }).on('error', (e) => res({ code: 'ERR', body: e.message }));
  });
}

(async function () {
  console.log('=== 等待 Actions ===');
  let lastRuns = '';
  for (let i = 0; i < 40; i++) {
    const a = await api('/repos/Xylia-cc/' + REPO + '/actions/runs');
    const runs = (a.j && a.j.workflow_runs) || [];
    const desc = runs.map((r) => r.name + ':' + r.status + '/' + (r.conclusion || '-')).join(' | ');
    if (desc !== lastRuns) { console.log('  [' + i + '] ' + desc); lastRuns = desc; }
    const allDone = runs.length > 0 && runs.every((r) => r.status === 'completed');
    if (allDone) {
      console.log('  全部完成:');
      runs.forEach((r) => console.log('    ★ ' + r.name + ' → ' + r.conclusion));
      break;
    }
    await new Promise((r) => setTimeout(r, 7000));
  }

  console.log('');
  console.log('=== 验证线上页面 ===');
  const p = await fetchPage();
  console.log('  HTTP ' + p.code + ' | ' + p.body.length + ' bytes');
  const hasMarker = p.body.indexOf(MARKER) >= 0;
  console.log('  测试标记 "' + MARKER + '": ' + (hasMarker ? '✅ 已同步（线上已含新内容）' : '❌ 未同步（线上仍是旧内容）'));
  console.log('  标题: ' + ((p.body.match(/<title>([^<]*)<\/title>/) || ['?', '?'])[1]));
  console.log('  上传控件: ' + (p.body.indexOf('excelFile') >= 0 ? 'OK' : '缺'));
  console.log('  引擎: ' + (p.body.indexOf('AssemblyEngine') >= 0 ? 'OK' : '缺'));
  process.exit(hasMarker ? 0 : 1);
})();
