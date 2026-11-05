// 验证候选托管链接能否直接渲染 HTML（Content-Type 必须是 text/html）
const { execFileSync } = require('child_process');

function probe(url) {
  try {
    const out = execFileSync('curl', [
      '-sS', '-L', '-o', 'NUL',
      '-w', 'HTTP=%{http_code} type=%{content_type} size=%{size_download} final=%{url_effective}',
      '--max-time', '45', url
    ], { encoding: 'utf8', timeout: 60000, windowsHide: true });
    return out.trim();
  } catch (e) {
    return '[ERR] ' + (e.stdout || '').trim() + ' | ' + (e.message || '').substring(0, 80);
  }
}

const urls = process.argv.slice(2);
urls.forEach(function (u) {
  console.log(u);
  console.log('  ' + probe(u));
  console.log('');
});
