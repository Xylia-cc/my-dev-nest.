// 验证离线单文件版：① 打开无结果 ② 选文件+计算后有结果
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
window.addEventListener('error', function(e){ L('JS_ERROR: ' + e.message); });
function b2b(b){ var bin=atob(b), l=bin.length, a=new Uint8Array(l); for(var i=0;i<l;i++) a[i]=bin.charCodeAt(i); return a; }
window.addEventListener('load', function(){
  setTimeout(function(){
    var rp = document.getElementById('resultPanel');
    L('离线版-刚打开: resultPanel=' + (getComputedStyle(rp).display==='none'?'HIDDEN':'SHOWN') +
      ' rows=' + document.querySelectorAll('#resultTable tbody tr').length +
      ' totbar=["' + (document.getElementById('totbar')||{}).textContent + '"]' +
      ' 文件名=' + (document.getElementById('excelName')||{}).textContent);
    var inp = document.getElementById('excelFile');
    var f = new File([b2b(__B64__)], 't.xlsx', {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    var dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files;
    inp.dispatchEvent(new Event('change', {bubbles:true}));
    document.getElementById('btnCalc').click();
    setTimeout(function(){
      L('离线版-计算后: resultPanel=' + (getComputedStyle(rp).display==='none'?'HIDDEN':'SHOWN') +
        ' rows=' + document.querySelectorAll('#resultTable tbody tr').length +
        ' totbar=[' + (document.getElementById('totbar')||{}).textContent + ']');
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
  }, 2500);
});
</script>
`;

const idx = html.lastIndexOf('</body>');
html = html.slice(0, idx) + script.replace('__B64__', JSON.stringify(b64)) + '\n' + html.slice(idx);
fs.writeFileSync(path.join(PUB, 'offline_verify.html'), html, 'utf8');
console.log('已生成 offline_verify.html');
