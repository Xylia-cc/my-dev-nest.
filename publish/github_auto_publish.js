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

    // ---- 1. 确保仓库存在且为公开 ----
    console.log('[1/4] 检查仓库 ' + REPO + ' ...');
    let repoInfo = null;
    try {
      repoInfo = await api('GET', '/repos/' + me.login + '/' + REPO);
      console.log('    仓库已存在');
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
      repoInfo = await api('GET', '/repos/' + me.login + '/' + REPO);
    }

    // ★ 私有仓库无法公开访问 Pages（免费版直接不支持，Pro 版访问需登录自己账号）
    if (repoInfo && repoInfo.private) {
      console.log('    ⚠️  仓库当前是【私有】，正在改为公开（Pages 分享必须公开）...');
      try {
        await api('PATCH', '/repos/' + me.login + '/' + REPO, { private: false });
        console.log('    ✅ 已改为公开');
      } catch (e) {
        console.log('    ❌ 自动改公开失败：' + e.message);
        console.log('       请手动改：仓库 → Settings → General → 取消勾选 Private');
      }
    } else if (repoInfo) {
      console.log('    可见性：公开 ✅（Pages 可直接访问）');
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
    console.log('[4/4] 开启 GitHub Pages（Actions 模式）...');
    let pageUrl = null;
    try {
      // ★ 直接用 build_type=workflow —— 与 .github/workflows/publish.yml 配套。
      //   若用 source:{branch} 会变成 legacy 模式，线上会返回 404 页。
      await api('POST', '/repos/' + me.login + '/' + REPO + '/pages', {
        build_type: 'workflow'
      });
      console.log('    ✅ Pages 已开启（build_type=workflow）');
    } catch (e) {
      const msg = String(e.message);
      if (msg.indexOf('already exists') >= 0 || msg.indexOf('already enabled') >= 0) {
        console.log('    ✅ Pages 已开启（之前已启用）');
      } else if (msg.indexOf('must be enabled') >= 0 || msg.indexOf('not enabled') >= 0) {
        console.log('    ⚠️  Pages 功能未在该仓库启用，请手动开启：');
        console.log('        仓库 → Settings → Pages → Source 选 GitHub Actions');
      } else {
        console.log('    ⚠️  未能自动开启 Pages：' + msg);
        console.log('        请手动开启：仓库 → Settings → Pages → Source 选 GitHub Actions');
      }
    }

    // ★ 关键：确保 build_type = workflow（Actions 模式）
    //   本项目用 .github/workflows/publish.yml + upload-pages-artifact 部署，
    //   必须是 workflow 模式。若误用 branch 模式（legacy），
    //   Pages 会从 main 分支根目录发布 —— 而仓库根目录没有 index.html，
    //   线上会返回 GitHub 的 404 页面（HTTP 200 但内容是 404 页）。
    try {
      const pg0 = await api('GET', '/repos/' + me.login + '/' + REPO + '/pages');
      if (pg0 && pg0.build_type && pg0.build_type !== 'workflow') {
        console.log('    ⚠️  检测到 build_type=' + pg0.build_type + '（legacy 模式），切换为 workflow...');
        let ok = false;
        try {
          await api('PATCH', '/repos/' + me.login + '/' + REPO + '/pages', { build_type: 'workflow' });
          ok = true;
        } catch (e2) {
          // PATCH 不支持时：先删后建
          await api('DELETE', '/repos/' + me.login + '/' + REPO + '/pages');
          await api('POST', '/repos/' + me.login + '/' + REPO + '/pages', { build_type: 'workflow' });
          ok = true;
        }
        if (ok) {
          console.log('    ✅ 已切换为 workflow 模式（Actions 部署）');
          // 触发一次部署
          try {
            const rl = await api('GET', '/repos/' + me.login + '/' + REPO + '/actions/workflows/publish.yml/runs');
            const r0 = (rl && rl.workflow_runs && rl.workflow_runs[0]);
            if (r0) await api('POST', '/repos/' + me.login + '/' + REPO + '/actions/runs/' + r0.id + '/rerun', {});
          } catch (e3) { /* 忽略 */ }
        }
      } else if (pg0) {
        console.log('    部署模式：workflow ✅（Actions 自动部署）');
      }
    } catch (e) { /* Pages 未就绪时忽略 */ }

    // 从 API 查真实地址（仓库名含特殊字符时，自己拼的 URL 可能不对）
    try {
      const pg = await api('GET', '/repos/' + me.login + '/' + REPO + '/pages');
      if (pg && pg.html_url) pageUrl = pg.html_url;
    } catch (e) { /* 未开启时查不到，用拼接兜底 */ }
    if (!pageUrl) pageUrl = 'https://' + me.login + '.github.io/' + REPO + '/';

    console.log('');
    console.log('============================================');
    console.log(' ✅ 发布完成');
    console.log('');
    console.log(' 访问地址: ' + pageUrl);
    console.log(' 部署进度: https://github.com/' + me.login + '/' + REPO + '/actions');
    console.log('');
    console.log(' ★ 首次可能需要 1-3 分钟才生效（Actions 在构建）');
    console.log(' ★ 以后每次发版只需：');
    console.log('   bash publish/github_push.sh');
    console.log('============================================');
  } catch (e) {
    console.error('❌ 失败:', e.message);
    process.exit(1);
  }
})();
