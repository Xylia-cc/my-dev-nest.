const fs = require('fs');
const path = require('path');

const PUB = process.argv[2];
const OUT = process.argv[3];

// 读取页面，注入自动化测试脚本
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

const testScript = `
<script>
window.__TEST_LOG__ = [];
function L(s){ window.__TEST_LOG__.push(s); }
window.addEventListener('error', function(e){ L('JS_ERROR: ' + e.message); });
window.addEventListener('load', function(){
  setTimeout(function(){
    try {
      L('LOADED');
      L('XLSX=' + (typeof XLSX !== 'undefined'));
      L('ENGINE=' + (typeof AssemblyEngine !== 'undefined'));
      L('SAMPLE=' + (typeof SAMPLE_DATA !== 'undefined'));

      // 检查示例数据是否自动计算
      var resRows = document.querySelectorAll('#resultTable tbody tr').length;
      var cdRows  = document.querySelectorAll('#consDetailTable tbody tr').length;
      var consRows = document.querySelectorAll('#consTable tbody tr').length;
      var slotRows = document.querySelectorAll('#slotTable tbody tr').length;
      L('ROWS result=' + resRows + ' consDetail=' + cdRows + ' cons=' + consRows + ' slot=' + slotRows);

      // 检查表头包含关键列
      var heads = Array.prototype.map.call(
        document.querySelectorAll('#slotTable thead th'), function(t){ return t.textContent.trim(); });
      L('SLOT_HEADERS=' + heads.join('|'));

      var cdHeads = Array.prototype.map.call(
        document.querySelectorAll('#consDetailTable thead th'), function(t){ return t.textContent.trim(); });
      L('CD_HEADERS=' + cdHeads.join('|'));

      // 关系分布
      var rels = {};
      Array.prototype.forEach.call(document.querySelectorAll('#consDetailTable tbody tr'), function(tr){
        var tds = tr.querySelectorAll('td');
        var rel = tds[7] ? tds[7].textContent.trim() : '?';
        rels[rel] = (rels[rel]||0)+1;
      });
      L('REL_DIST=' + JSON.stringify(rels));

      // 统计信息区
      var stats = document.querySelector('.stats, #stats, .summary');
      L('STATS=' + (stats ? stats.textContent.replace(/\\s+/g,' ').trim().substring(0,200) : 'none'));

      // 检查是否有错误提示
      var errEl = document.querySelector('.err, .error, #err, #errBox');
      L('ERR_BOX=' + (errEl ? errEl.textContent.replace(/\\s+/g,' ').trim().substring(0,200) : 'none'));

      // XLSX 导出函数可用性
      L('HAS_XLSX_EXPORT=' + (typeof buildXlsxRows === 'function' || typeof exportXlsx === 'function' || document.getElementById('btnXlsx') ? 'yes' : 'no'));

      var out = document.createElement('pre');
      out.id = 'TESTOUT';
      out.textContent = window.__TEST_LOG__.join('\\n');
      document.body.appendChild(out);
    } catch(err) {
      var o = document.createElement('pre');
      o.id = 'TESTOUT';
      o.textContent = 'FATAL: ' + err.message + '\\n' + window.__TEST_LOG__.join('\\n');
      document.body.appendChild(o);
    }
  }, 3000);
});
</script>
`;

html = html.replace('</body>', testScript + '\n</body>');
fs.writeFileSync(path.join(PUB, 'autotest.html'), html, 'utf8');
console.log('已生成 autotest.html');
