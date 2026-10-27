// 生成离线版文件导入测试页：把 xlsx 以 base64 内嵌，注入到真实 <input type=file>，
// 触发 change 事件，走页面自身的上传解析路径
const fs = require('fs');
const path = require('path');

const PUB = process.argv[2];          // 发布目录
const XLSX_PATH = process.argv[3];    // 真实模板
const OUT_NAME = process.argv[4] || 'offline_filetest.html';

const b64 = fs.readFileSync(XLSX_PATH).toString('base64');
let html = fs.readFileSync(path.join(PUB, '分仓组装量计算器-离线版.html'), 'utf8');

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

window.addEventListener('load', function(){
  setTimeout(function(){
    try {
      L('SAMPLE_ROWS result=' + document.querySelectorAll('#resultTable tbody tr').length +
        ' slot=' + document.querySelectorAll('#slotTable tbody tr').length);

      var input = document.getElementById('excelFile');
      L('INPUT_FOUND=' + !!input);

      var bytes = b64ToBytes(B64DATA);
      var file = new File([bytes], 'template.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      L('FILE_SIZE=' + file.size);

      // 构造 DataTransfer 并派发 change —— 走页面真实上传逻辑
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      L('NAME_SHOWN=' + (document.getElementById('excelName') || {}).textContent);

      // ★ 页面的 change 事件只记录文件名，真正计算由「解析并计算」按钮触发
      document.getElementById('btnCalc').click();

      setTimeout(function(){
        L('AFTER_UPLOAD result=' + document.querySelectorAll('#resultTable tbody tr').length +
          ' cd=' + document.querySelectorAll('#consDetailTable tbody tr').length +
          ' slot=' + document.querySelectorAll('#slotTable tbody tr').length);
        var tot = document.getElementById('totbar');
        L('TOTBAR=' + (tot ? tot.textContent.replace(/\\s+/g,' ').trim() : 'none'));
        var wb2 = document.getElementById('warnBox');
        L('WARN=' + (wb2 ? wb2.textContent.replace(/\\s+/g,' ').trim().substring(0,200) : 'none'));
        // 关系分布
        var rels = {};
        Array.prototype.forEach.call(document.querySelectorAll('#consDetailTable tbody tr'), function(tr){
          var tds = tr.querySelectorAll('td');
          var rel = tds[7] ? tds[7].textContent.trim() : '?';
          rels[rel] = (rels[rel]||0)+1;
        });
        L('REL_DIST=' + JSON.stringify(rels));
        var o = document.createElement('pre'); o.id='TESTOUT';
        o.textContent = window.__L__.join('\\n'); document.body.appendChild(o);
      }, 4000);
    } catch(err){
      var o2 = document.createElement('pre'); o2.id='TESTOUT';
      o2.textContent = 'FATAL: ' + err.message + '\\n' + window.__L__.join('\\n');
      document.body.appendChild(o2);
    }
  }, 2000);
});
</script>
`;

// ★ 必须用【最后一个】</body>：单文件版内联了 xlsx 库，其源码里也含 </body> 字面量，
//   用 replace(第一个) 会把脚本插到 <head> 里的库源码中间，导致脚本不执行。
const idx = html.lastIndexOf('</body>');
if (idx < 0) throw new Error('未找到 </body>');
html = html.slice(0, idx) + script.replace('B64DATA', JSON.stringify(b64)) + '\n' + html.slice(idx);
fs.writeFileSync(path.join(PUB, OUT_NAME), html, 'utf8');
console.log('已生成 ' + OUT_NAME + ' (内联 xlsx ' + (b64.length / 1024 / 1024).toFixed(1) + ' MB base64)');
