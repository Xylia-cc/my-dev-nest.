// 验证 site 产物：file:// 内联小模板 → 选文件 → 点计算
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const PUB = process.argv[2];
const SRC_NAME = process.argv[3] || 'index.html';
const OUT_NAME = process.argv[4] || 'filetest.html';
const TEMPLATE = process.argv[5];

// 造小模板（取 1743969 的 BOM 行 + 必要库存）
const wb0 = XLSX.readFile(TEMPLATE);
const b = XLSX.utils.sheet_to_json(wb0.Sheets['BOM关系'], { header: 1 });
const rows = [['父件', '配比', '子件', '替换组', '备注', '关系类别']];
b.slice(1).forEach(function (r) {
  if (String(r[0] || '') === '1743969') rows.push([r[0], r[1], r[2], r[3], r[4], r[5]]);
});
const w2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(w2, XLSX.utils.aoa_to_sheet(rows), 'BOM关系');
XLSX.utils.book_append_sheet(w2, XLSX.utils.aoa_to_sheet([
  ['父件', '仓库', '需求', '销量', '关系类别'],
  ['1743969', 'a-us-cj', 115, 3.97, '']
]), '需求');
XLSX.utils.book_append_sheet(w2, XLSX.utils.aoa_to_sheet([
  ['子件', '仓库', '库存'],
  ['1744181', 'a-us-cj', 1944], ['1717751', 'a-us-cj', 0],
  ['1744177', 'a-us-cj', 5], ['1698987', 'a-us-cj', 2291],
  ['1744182', 'a-us-cj', 58], ['1730674', 'a-us-cj', 956],
  ['1744188', 'a-us-cj', 48], ['1720158', 'a-us-cj', 404],
  ['1744193', 'a-us-cj', 2], ['1695280', 'a-us-cj', 2947],
  ['1744194', 'a-us-cj', 2], ['1752598', 'a-us-cj', 461]
]), '库存');
const b64 = XLSX.write(w2, { type: 'buffer', bookType: 'xlsx' }).toString('base64');

let html = fs.readFileSync(path.join(PUB, SRC_NAME), 'utf8');

const script = `
<script>
window.__L__=[];
function L(x){ window.__L__.push(x); }
window.addEventListener('error',function(e){ L('ERR: '+e.message); });
window.addEventListener('load',function(){
  setTimeout(function(){
    function b2b(b){ var bin=atob(b), l=bin.length, a=new Uint8Array(l); for(var i=0;i<l;i++) a[i]=bin.charCodeAt(i); return a; }
    var f=new File([b2b(__B64__)],'m.xlsx',{type:'application/octet-stream'});
    var inp=document.getElementById('excelFile');
    var dt=new DataTransfer(); dt.items.add(f); inp.files=dt.files;
    inp.dispatchEvent(new Event('change',{bubbles:true}));
    L('文件已选');
    document.getElementById('btnCalc').click();
    setTimeout(function(){
      var rp=document.getElementById('resultPanel');
      L('结果区='+(getComputedStyle(rp).display==='none'?'HIDDEN':'SHOWN'));
      L('统计条='+document.getElementById('totbar').textContent);
      L('明细行='+document.querySelectorAll('#consDetailTable tbody tr').length);
      var rels={};
      Array.prototype.forEach.call(document.querySelectorAll('#consDetailTable tbody tr'),function(tr){
        var t=tr.querySelectorAll('td'); var k=t[7]?t[7].textContent.trim():'?';
        rels[k]=(rels[k]||0)+1; });
      L('关系分布='+JSON.stringify(rels));
      var o=document.createElement('pre'); o.id='TESTOUT';
      o.textContent=window.__L__.join('\\n'); document.body.appendChild(o);
    },5000);
  },2500);
});
</script>`;

const i = html.lastIndexOf('</body>');
html = html.slice(0, i) + script.replace('__B64__', JSON.stringify(b64)) + '\n' + html.slice(i);
fs.writeFileSync(path.join(PUB, OUT_NAME), html, 'utf8');
console.log('已生成 ' + OUT_NAME + '（内联 ' + (b64.length / 1024).toFixed(0) + ' KB）');
