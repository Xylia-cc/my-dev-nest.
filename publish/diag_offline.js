// 离线版诊断：捕获 btnCalc 点击后的真实错误
const fs = require('fs');
const path = require('path');

const PUB = process.argv[2];
const XLSX_PATH = process.argv[3];
const b64 = fs.readFileSync(XLSX_PATH).toString('base64');

let html = fs.readFileSync(path.join(PUB, '分仓组装量计算器-离线版.html'), 'utf8');

const script = `
<script>
window.__L__ = [];
function L(s){ window.__L__.push(s); }
window.addEventListener('error', function(e){ L('JS_ERROR: ' + e.message + ' @' + e.filename + ':' + e.lineno); });
// 劫持 alert，捕获错误信息
var _alert = window.alert;
window.alert = function(msg){ L('ALERT: ' + msg); };

function b2b(b){ var bin=atob(b), l=bin.length, a=new Uint8Array(l); for(var i=0;i<l;i++) a[i]=bin.charCodeAt(i); return a; }
function dump(){
  var o = document.createElement('pre'); o.id='TESTOUT';
  o.textContent = window.__L__.join('\\n'); document.body.appendChild(o);
}
window.addEventListener('load', function(){
  setTimeout(function(){
    L('typeof XLSX = ' + (typeof XLSX));
    L('typeof AssemblyEngine = ' + (typeof AssemblyEngine));
    L('btnCalc = ' + !!document.getElementById('btnCalc'));
    L('excelFile = ' + !!document.getElementById('excelFile'));
    try {
      var inp = document.getElementById('excelFile');
      var f = new File([b2b(__B64__)], 't.xlsx', {type:'application/octet-stream'});
      var dt = new DataTransfer(); dt.items.add(f);
      inp.files = dt.files;
      L('files.length = ' + inp.files.length);
      inp.dispatchEvent(new Event('change', {bubbles:true}));
      L('excelName = ' + document.getElementById('excelName').textContent);
      document.getElementById('btnCalc').click();
      L('clicked btnCalc');
    } catch(e){ L('CLICK_ERR: ' + e.message); }
    setTimeout(function(){
      var rp = document.getElementById('resultPanel');
      L('resultPanel = ' + (getComputedStyle(rp).display==='none'?'HIDDEN':'SHOWN'));
      L('rows = ' + document.querySelectorAll('#resultTable tbody tr').length);
      L('totbar = [' + document.getElementById('totbar').textContent + ']');
      dump();
    }, 6000);
  }, 2000);
});
</script>
`;

const idx = html.lastIndexOf('</body>');
html = html.slice(0, idx) + script.replace('__B64__', JSON.stringify(b64)) + '\n' + html.slice(idx);
fs.writeFileSync(path.join(PUB, 'diag2.html'), html, 'utf8');
console.log('已生成 diag2.html');
