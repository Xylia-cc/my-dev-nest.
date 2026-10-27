// 枚举分享链接的访问参数名
const https = require('https');
const host = process.argv[2];

const params = ['t', 'tk', 'token', 'appToken', 'app_token', 'access_token',
  'key', 'k', 's', 'sig', 'sign', 'share', 'shareToken', 'st', 'code', 'auth',
  'passwd', 'p', 'id', 'app', 'sid', 'ws', 'space', 'sid_token'];

let done = 0;
const list = params.concat(['__none__']);

list.forEach(function (p) {
  const path = (p === '__none__') ? '/' : ('/?' + p + '=x');
  const req = https.get('https://' + host + path, { timeout: 10000 }, function (res) {
    let n = 0;
    res.on('data', function (d) { n += d.length; });
    res.on('end', function () {
      if (res.statusCode !== 403) {
        console.log('★ ' + p + ' → HTTP ' + res.statusCode + ' bytes=' + n);
      }
      if (++done === list.length) { console.log('--- 测完（只列非403）---'); process.exit(0); }
    });
  });
  req.on('error', function () { if (++done === list.length) { console.log('--- 测完 ---'); process.exit(0); } });
  req.on('timeout', function () { req.destroy(); if (++done === list.length) process.exit(0); });
});
