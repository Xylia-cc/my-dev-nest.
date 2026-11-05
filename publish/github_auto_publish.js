// ============================================================
// GitHub Pages 全自动发布
//
//   用法：node publish/github_auto_publish.js <repo名> [token]
//     · token 省略时从 ~/.workbuddy/github_token.txt 读取
//     · 也可用环境变量 GITHUB_TOKEN
//
//   流程：
//     1. 通过 API 创建公开仓库
//     2. 用 git push 上传代码
//     3. 通过 API 开启 Pages（source=GitHub Actions）
//     4. 输出永久地址
//
//   ★ token 权限需含：repo（建仓库）+ workflow（写 Actions）
// ============================================================
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function arg(i) { return process.argv[i]; }
const REPO = arg(2) || 'assembly-calculator';
const TOKEN = arg(3) || process.env.GITHUB_TOKEN ||
  (function () {
    const p = path.join(process.env.HOME || process.env.USERPROFILE, '.workbuddy', 'github_token.txt');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '';
  })();

if (!TOKEN) {
  console.error('缺少 GitHub token。请提供：');
  console.error('  node publish/github_auto_publish.js <repo名> <token>');
  console.error('或保存到 ~/.workbuddy/github_token.txt');
  process.exit(1);
}

function api(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      method: method,
      hostname: 'api.github.com',
      path: apiPath,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'WorkBuddy-Assembly-Calculator',
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0
      }
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(d); } catch (e) { }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(j || {});
        else reject(new Error('HTTP ' + res.statusCode + ': ' + (j && j.message ? j.message : d.substring(0, 200))));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function git(args, opts) {
  return execFileSync('git', args, Object.assign({
    cwd: ROOT, encoding: 'utf8', timeout: 300000, windowsHide: true
  }, opts || {}));
}

(async function () {
  try {
    // ---- 0. 校验 token ----
    console.log('[0/4] 校验 token...');
    const me = await api('GET', '/user');
    console.log('    登录账号: ' + me.login);

    // ---- 1. 建仓库 ----
    console.log('[1/4] 创建仓库 ' + REPO + ' ...');
    let repoExists = false;
    try {
      await api('GET', '/repos/' + me.login + '/' + REPO);
      repoExists = true;
      console.log('    仓库已存在，跳过创建');
    } catch (e) {
      await api('POST', '/user/repos', {
        name: REPO,
        description: '分仓组装量计算器 —— BOM 组装量/消耗明细计算工具',
        private: false,
        auto_init: false,
        has_issues: false,
        has_wiki: false
      });
      console.log('    ✅ 创建成功（公开仓库）');
    }

    // ---- 2. 构建 ----
    console.log('[2/4] 构建静态站点...');
    execFileSync(process.execPath, [path.join(ROOT, 'publish', 'build_gh.js')], {
      cwd: ROOT, encoding: 'utf8', timeout: 180000, windowsHide: true
    });
    console.log('    ✅ 构建完成');

    // ---- 3. 推送 ----
    console.log('[3/4] 推送到 GitHub...');
    const remote = 'https://github.com/' + me.login + '/' + REPO + '.git';
    try { git(['remote', 'set-url', 'origin', remote]); }
    catch (e) { git(['remote', 'add', 'origin', remote]); }

    git(['add', '-A']);
    try {
      git(['commit', '-m', 'deploy: ' + new Date().toISOString().slice(0, 16).replace('T', ' ')]);
    } catch (e) {
      console.log('    （无变更，跳过提交）');
    }

    // 推送时用一次性 header 携带凭据，不落盘
    const authHeader = 'Authorization: Basic ' + Buffer.from('x-access-token:' + TOKEN).toString('base64');
    git(['-c', 'http.extraheader=' + authHeader, 'push', '-u', 'origin', 'HEAD:main']);

    // ---- 4. 开启 Pages ----
    console.log('[4/4] 开启 GitHub Pages...');
    try {
      await api('POST', '/repos/' + me.login + '/' + REPO + '/pages', {
        source: { branch: 'main', path: '/' }
      });
      console.log('    ✅ Pages 已开启（branch=main）');
    } catch (e) {
      if (String(e.message).indexOf('already exists') >= 0) {
        console.log('    Pages 已开启');
      } else {
        console.log('    ⚠️  未能自动开启 Pages：' + e.message);
        console.log('    请手动开启：仓库 → Settings → Pages → Source 选 GitHub Actions');
      }
    }

    const pageUrl = 'https://' + me.login + '.github.io/' + REPO + '/';
    console.log('');
    console.log('============================================');
    console.log(' ✅ 发布完成');
    console.log('');
    console.log(' 访问地址: ' + pageUrl);
    console.log(' 部署进度: https://github.com/' + me.login + '/' + REPO + '/actions');
    console.log('');
    console.log(' ★ 首次可能需要 1-3 分钟才生效（Actions 在构建）');
    console.log(' ★ 以后每次发版只需：');
    console.log('   node publish/github_auto_publish.js ' + REPO);
    console.log('============================================');
  } catch (e) {
    console.error('❌ 失败:', e.message);
    process.exit(1);
  }
})();
