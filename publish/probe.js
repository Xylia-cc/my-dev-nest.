// 在 head 前后同时注入，最终把错误写到 body 里的 <pre id="TESTOUT">
const fs = require('fs');
const path = require('path');

const PUB = process.argv[2];
const SRC_NAME = process.argv[3];   // 源文件（index.html 或 离线版）
const OUT_NAME = process.argv[4];
const XLSX_PATH = process.argv[5];

const b64 = XLSX_PATH ? fs.readFileSync(XLSX_PATH).toString('base64') : '';
let html = fs.readFileSync(path.join(PUB, SRC_NAME), 'utf8');

// head 前：早期错误捕获
const headProbe = `<script>
window.__E__=[];
window.addEventListener('error',function(e){window.__E__.push('ERR: '+e.message+' @line '+e.lineno);});
window.addEventListener('unhandledrejection',function(e){window.__E__.push('REJECT: '+(e.reason&&e.reason.message?e.reason.message:e.reason));});
</script>`;
const hi = html.indexOf('</head>');
html = html.slice(0, hi) + headProbe + html.slice(hi);

// body 末：执行 + 报告
const bodyScript = `
<script>
function b2b(b){var bin=atob(b),l=bin.length,a=new Uint8Array(l);for(var i=0;i<l;i++)a[i]=bin.charCodeAt(i);return a;}
window.addEventListener('load',function(){setTimeout(function(){
  var rp=document.getElementById('resultPanel');
  window.__E__.push('OPEN panel='+(getComputedStyle(rp).display==='none'?'HIDDEN':'SHOWN')+' rows='+document.querySelectorAll('#resultTable tbody tr').length);
  ${XLSX_PATH ? `
  try{
    var inp=document.getElementById('excelFile');
    var f=new File([b2b(__B64__)],'t.xlsx',{type:'application/octet-stream'});
    var dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;
    inp.dispatchEvent(new Event('change',{bubbles:true}));
    window.__E__.push('files='+inp.files.length+' name='+document.getElementById('excelName').textContent);
    document.getElementById('btnCalc').click();
    window.__E__.push('clicked');
  }catch(e){window.__E__.push('CLICK_ERR: '+e.message+' | '+String(e.stack).substring(0,200));}
  ` : ''}
  setTimeout(function(){
    window.__E__.push('AFTER panel='+(getComputedStyle(rp).display==='none'?'HIDDEN':'SHOWN')+' rows='+document.querySelectorAll('#resultTable tbody tr').length+' totbar=['+document.getElementById('totbar').textContent+']');
    var o=document.createElement('pre');o.id='TESTOUT';o.textContent=window.__E__.join('\\n');document.body.appendChild(o);
  },6000);
},2000);});
</script>`;
const bi = html.lastIndexOf('</body>');
html = html.slice(0, bi) + bodyScript.replace('__B64__', JSON.stringify(b64)) + '\n' + html.slice(bi);

fs.writeFileSync(path.join(PUB, OUT_NAME), html, 'utf8');
console.log('已生成 ' + OUT_NAME);
