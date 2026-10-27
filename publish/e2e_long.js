// 端到端测试：页面内 XHR 拉迷你 xlsx → 注入 file input → 点计算 → 校验结果
const fs = require('fs');
const path = require('path');

const PUB = process.argv[2];
const SRC_NAME = process.argv[3];
const OUT_NAME = process.argv[4];
const XLSX_REL = process.argv[5] || 'mini.xlsx';

let html = fs.readFileSync(path.join(PUB, SRC_NAME), 'utf8');

const bodyScript = `
<script>
window.__L__=[];
function L(s){ window.__L__.push(s); }
window.addEventListener('error',function(e){ L('ERR: '+e.message); });
window.addEventListener('load',function(){
  setTimeout(function(){
    var xhr=new XMLHttpRequest();
    xhr.open('GET','${XLSX_REL}',true);
    xhr.responseType='arraybuffer';
    xhr.onload=function(){
      try{
        var f=new File([xhr.response],'mini.xlsx',{type:'application/octet-stream'});
        var inp=document.getElementById('excelFile');
        var dt=new DataTransfer(); dt.items.add(f); inp.files=dt.files;
        inp.dispatchEvent(new Event('change',{bubbles:true}));
        L('文件名='+document.getElementById('excelName').textContent);
        document.getElementById('btnCalc').click();
        setTimeout(function(){
          var rp=document.getElementById('resultPanel');
          L('结果区='+(getComputedStyle(rp).display==='none'?'HIDDEN':'SHOWN'));
          L('统计条='+document.getElementById('totbar').textContent);
          L('行数: 结果='+document.querySelectorAll('#resultTable tbody tr').length+
            ' 明细='+document.querySelectorAll('#consDetailTable tbody tr').length+
            ' slot='+document.querySelectorAll('#slotTable tbody tr').length);
          var rels={};
          Array.prototype.forEach.call(document.querySelectorAll('#consDetailTable tbody tr'),function(tr){
            var t=tr.querySelectorAll('td'); var k=t[7]?t[7].textContent.trim():'?';
            rels[k]=(rels[k]||0)+1; });
          L('关系分布='+JSON.stringify(rels));
          var rows=[];
          Array.prototype.forEach.call(document.querySelectorAll('#consDetailTable tbody tr'),function(tr){
            var t=tr.querySelectorAll('td');
            rows.push(Array.prototype.map.call(t,function(x){return x.textContent.trim();}).join(' | '));
          });
          L('明细内容:');
          rows.forEach(function(r){ L('   '+r); });
          var o=document.createElement('pre'); o.id='TESTOUT';
          o.textContent=window.__L__.join('\\n'); document.body.appendChild(o);
        },15000);
      }catch(e){
        L('ERR: '+e.message);
        var o=document.createElement('pre'); o.id='TESTOUT';
        o.textContent=window.__L__.join('\\n'); document.body.appendChild(o);
      }
    };
    xhr.onerror=function(){
      var o=document.createElement('pre'); o.id='TESTOUT';
      o.textContent=window.__L__.join('\\n')+'\\nXHR_ERR'; document.body.appendChild(o);
    };
    xhr.send();
  },2500);
});
</script>
`;

const bi = html.lastIndexOf('</body>');
html = html.slice(0, bi) + bodyScript + '\n' + html.slice(bi);
fs.writeFileSync(path.join(PUB, OUT_NAME), html, 'utf8');
console.log('已生成 ' + OUT_NAME);
