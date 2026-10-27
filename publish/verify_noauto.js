// 验证：① 打开页面无任何结果区；② 选文件+点计算后才有结果
const fs = require('fs');
const path = require('path');

const PUB = process.argv[2];
const XLSX_PATH = process.argv[3];

const b64 = fs.readFileSync(XLSX_PATH).toString('base64');
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

const script = `
<script>
window.__L__ = [];
function L(s){ window.__L__.push(s); }
window.addEventListener('error', function(e){ L('JS_ERROR: ' + e.message); });

function b64ToBytes(b64){
  var bin = atob(b64), len = bin.length, arr = new Uint8Array(len);
  for (var i=0;i<len;i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function vis(el){
  if(!el) return 'no-el';
  return getComputedStyle(el).display === 'none' ? 'HIDDEN' : 'SHOWN';
}
function snap(tag){
  var rp = document.getElementById('resultPanel');
  L(tag + ' resultPanel=' + vis(rp) +
    ' totbar="' + (document.getElementById('totbar')||{}).textContent +
    '" resultRows=' + document.querySelectorAll('#resultTable tbody tr').length +
    ' slotRows=' + document.querySelectorAll('#slotTable tbody tr').length);
}

window.addEventListener('load', function(){
  setTimeout(function(){
    try {
      // 阶段①：刚打开，应无结果
      L('--- 阶段1: 刚打开页面 ---');
      snap('OPEN');
      L('  excelName=' + (document.getElementById('excelName')||{}).textContent);
      L('  btnCalc存在=' + !!document.getElementById('btnCalc'));
      L('  示例数据是否被自动加载: ' + (document.querySelectorAll('#resultTable tbody tr').length > 0 ? '是(BUG)' : '否 ✅'));

      // 阶段②：选文件 → 点计算
      L('--- 阶段2: 选文件 + 点解析并计算 ---');
      var input = document.getElementById('excelFile');
      var file = new File([b64ToBytes(B64DATA)], 'template.xlsx', {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      var dt = new DataTransfer(); dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
      L('  文件名已显示: ' + (document.getElementById('excelName')||{}).textContent);

      document.getElementById('btnCalc').click();

      setTimeout(function(){
        snap('AFTER_CALC');
        L('  警告条: ' + ((document.getElementById('warnBox')||{}).textContent||'').replace(/\\s+/g,' ').trim().substring(0,120));
        var rels = {};
        Array.prototype.forEach.call(document.querySelectorAll('#consDetailTable tbody tr'), function(tr){
          var tds = tr.querySelectorAll('td');
          var rel = tds[7] ? tds[7].textContent.trim() : '?';
          rels[rel] = (rels[rel]||0)+1;
        });
        L('  关系分布: ' + JSON.stringify(rels));
        var o = document.createElement('pre'); o.id='TESTOUT';
        o.textContent = window.__L__.join('\\n'); document.body.appendChild(o);
      }, 5000);
    } catch(err){
      var o2 = document.createElement('pre'); o2.id='TESTOUT';
      o2.textContent = 'FATAL: ' + err.message + '\\n' + window.__L__.join('\\n');
      document.body.appendChild(o2);
    }
  }, 2500);
});
</script>
`;

const idx = html.lastIndexOf('</body>');
html = html.slice(0, idx) + script.replace('B64DATA', JSON.stringify(b64)) + '\n' + html.slice(idx);
fs.writeFileSync(path.join(PUB, 'verify_noauto.html'), html, 'utf8');
console.log('已生成 verify_noauto.html');
