// 轻量验证：只确认「打开页面无结果」+「XLSX/引擎已就绪」
// （不注入大文件，避免页面过大导致 Chrome 崩溃）
const fs = require('fs');
const path = require('path');

const PUB = process.argv[2];
const SRC_NAME = process.argv[3];
const OUT_NAME = process.argv[4];

let html = fs.readFileSync(path.join(PUB, SRC_NAME), 'utf8');

const headProbe = `<script>
window.__E__=[];
window.addEventListener('error',function(e){window.__E__.push('ERR: '+e.message+' @line '+e.lineno);});
</script>`;
const hi = html.indexOf('</head>');
html = html.slice(0, hi) + headProbe + html.slice(hi);

const bodyScript = `
<script>
window.addEventListener('load',function(){setTimeout(function(){
  var rp=document.getElementById('resultPanel');
  window.__E__.push('typeof XLSX = '+(typeof XLSX));
  window.__E__.push('typeof AssemblyEngine = '+(typeof AssemblyEngine));
  window.__E__.push('XLSX 可用 = '+(typeof XLSX!=='undefined' && !!XLSX.utils && !!XLSX.read));
  window.__E__.push('结果区 = '+(getComputedStyle(rp).display==='none'?'HIDDEN (符合预期)':'SHOWN (异常)'));
  window.__E__.push('结果表行数 = '+document.querySelectorAll('#resultTable tbody tr').length);
  window.__E__.push('统计条 = ['+document.getElementById('totbar').textContent+']');
  window.__E__.push('文件名 = '+document.getElementById('excelName').textContent);
  // 引擎功能自测：用内置样例算一次，确认引擎可用
  try{
    var r=AssemblyEngine.compute(
      [['父件','子件','配比'],['P1','C1',2]],
      [['父件','仓库','需求','销量'],['P1','仓A',10,5]],
      [['子件','仓库','库存'],['C1','仓A',20]],
      {capByDemand:true});
    window.__E__.push('引擎自测: assembled='+r.totals.assembled+' (应为 10)');
  }catch(e){ window.__E__.push('引擎自测失败: '+e.message); }
  var o=document.createElement('pre');o.id='TESTOUT';o.textContent=window.__E__.join('\\n');document.body.appendChild(o);
},2500);});
</script>`;
const bi = html.lastIndexOf('</body>');
html = html.slice(0, bi) + bodyScript + '\n' + html.slice(bi);

fs.writeFileSync(path.join(PUB, OUT_NAME), html, 'utf8');
console.log('已生成 ' + OUT_NAME);
