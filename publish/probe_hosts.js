// 测试免注册的公开文件托管，看能否返回可直接在浏览器打开的 URL
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FILE = process.argv[2] || 'site/分仓组装量计算器-离线版.html';
const data = fs.readFileSync(FILE);
console.log('待上传: ' + FILE + ' (' + (data.length / 1024).toFixed(0) + ' KB)\n');

function curl(args) {
  try {
    return execFileSync('curl', args, { encoding: 'utf8', timeout: 90000, windowsHide: true });
  } catch (e) {
    return '[ERR] ' + (e.stdout || '') + ' | ' + (e.message || '').substring(0, 120);
  }
}

const tmp = path.join(process.env.TEMP, 'upload_probe.html');
fs.writeFileSync(tmp, data);

const targets = [
  {
    name: 'catbox.moe',
    cmd: ['-sS', '-F', 'reqtype=fileupload', '-F', 'fileToUpload=@' + tmp, 'https://catbox.moe/user/api.php']
  },
  {
    name: '0x0.st',
    cmd: ['-sS', '-F', 'file=@' + tmp, 'https://0x0.st']
  },
  {
    name: 'tmpfiles.org',
    cmd: ['-sS', '-F', 'file=@' + tmp, 'https://tmpfiles.org/api/v1/upload']
  },
  {
    name: 'uguu.se',
    cmd: ['-sS', '-F', 'files[]=@' + tmp, 'https://uguu.se/upload.php']
  },
  {
    name: 'bashupload.com',
    cmd: ['-sS', '-T', '-P', '-', 'https://bashupload.com/' + path.basename(FILE)]
  }
];

targets.forEach(function (t) {
  const out = String(curl(t.cmd)).trim();
  console.log('--- ' + t.name + ' ---');
  console.log('  ' + out.substring(0, 300).replace(/\n/g, ' | '));
  console.log('');
});
