// 诊断：为什么 site 产物导入模板后没有出结果
const fs = require('fs');
const path = require('path');

const PUB = process.argv[2];
const SRC_NAME = process.argv[3];
const OUT_NAME = process.argv[4];
const XLSX_REL = process.argv[5] || 'full.xlsx';

let html = fs.readFileSync(path.join(PUB, SRC_NAME), 'utf8');

const headProbe = `<script>
window.__E__=[];
window.addEventListener('error',function(e){window.__E__.push('ERR: '+e.message+' @line '+e.lineno+' col='+e.colno);});
window.addEventListener('unhandledrejection',function(e){window.__E__.push('REJECT: '+(e.reason&&e.reason.message?e.reason.message:e.reason));});
</script>`;
const hi = html.indexOf('</head>');
html = html.slice(0, hi) + headProbe + html.slice(hi);

const bodyScript = `
<script>
function dump(){
  var o=document.createElement('pre'); o.id='TESTOUT';
  o.textContent=window.__E__.join('\\n'); document.body.appendChild(o);
}
window.addEventListener('load',function(){
  setTimeout(function(){
    window.__E__.push('typeof XLSX='+(typeof XLSX));
    window.__E__.push('XLSX.read='+(typeof XLSX!=='undefined'&&!!XLSX.read));
    window.__E__.push('typeof AssemblyEngine='+(typeof AssemblyEngine));
    window.__E__.push('btnCalc='+!!document.getElementById('btnCalc'));
    var xhr=new XMLHttpRequest();
    xhr.open('GET','${XLSX_REL}',true);
    xhr.responseType='arraybuffer';
    xhr.onload=function(){
      window.__E__.push('XHR status='+xhr.status+' bytes='+(xhr.response?xhr.response.byteLength:0));
      try{
        var f=new File([xhr.response],'m.xlsx',{type:'application/octet-stream'});
        var inp=document.getElementById('excelFile');
        var dt=new DataTransfer(); dt.items.add(f); inp.files=dt.files;
        inp.dispatchEvent(new Event('change',{bubbles:true}));
        window.__E__.push('文件已选='+document.getElementById('excelName').textContent);
        document.getElementById('btnCalc').click();
        window.__E__.push('已点击计算');
        setTimeout(function(){
          var rp=document.getElementById('resultPanel');
          window.__E__.push('结果区='+(getComputedStyle(rp).display==='none'?'HIDDEN':'SHOWN'));
          window.__E__.push('统计条='+document.getElementById('totbar').textContent);
          window.__E__.push('结果行='+document.querySelectorAll('#resultTable tbody tr').length);
          dump();
        },20000);
      }catch(e){ window.__E__.push('EXC: '+e.message); dump(); }
    };
    xhr.onerror=function(){ window.__E__.push('XHR_ERR'); dump(); };
    xhr.send();
  },2000);
});
</script>`;

const bi = html.lastIndexOf('</body>');
html = html.slice(0, bi) + bodyScript + '\n' + html.slice(bi);
fs.writeFileSync(path.join(PUB, OUT_NAME), html, 'utf8');
console.log('已生成 ' + OUT_NAME);
