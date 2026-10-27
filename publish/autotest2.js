const fs = require('fs');
const path = require('path');

// 生成 autotest2.html：页面 + 真实 Excel 端到端测试
// 用 fetch 拉取同源 xlsx 文件 → 解析 → 走页面的解析逻辑 → 校验结果
const PUB = process.argv[2];
const XLSX_REL = process.argv[3] || '/test.xlsx';

let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

const testScript = `
<script>
window.__L__ = [];
function L(s){ window.__L__.push(s); }
window.addEventListener('error', function(e){ L('JS_ERROR: ' + e.message); });

window.addEventListener('load', function(){
  setTimeout(function(){
    try {
      // 1) 校验示例数据自动计算
      L('SAMPLE_ROWS result=' + document.querySelectorAll('#resultTable tbody tr').length +
        ' cd=' + document.querySelectorAll('#consDetailTable tbody tr').length +
        ' slot=' + document.querySelectorAll('#slotTable tbody tr').length);

      // 2) 拉真实 xlsx，走页面内部解析函数
      fetch('${XLSX_REL}').then(function(r){ return r.arrayBuffer(); }).then(function(buf){
        try {
          var wb = XLSX.read(new Uint8Array(buf), {type:'array'});
          L('SHEETS=' + wb.SheetNames.join(','));
          var toRows = function(name){
            var sh = wb.Sheets[name]; if(!sh) return [];
            return XLSX.utils.sheet_to_json(sh, {header:1});
          };
          var bom = toRows('BOM关系'), dem = toRows('需求'), inv = toRows('库存');
          L('INPUT bom=' + bom.length + ' dem=' + dem.length + ' inv=' + inv.length);

          // 直接调引擎
          var res = AssemblyEngine.compute(bom, dem, inv, {capByDemand:true});
          L('ENGINE_TOTALS demand=' + res.totals.demand + ' assembled=' + res.totals.assembled);
          L('ENGINE_ROWS results=' + res.results.length + ' cd=' + res.consumptionDetail.length +
            ' cons=' + res.consumption.length);

          // 关系分布
          var rels = {};
          res.consumptionDetail.forEach(function(c){ rels[c.relation] = (rels[c.relation]||0)+1; });
          L('REL_DIST=' + JSON.stringify(rels));

          // 脏行 / 超扣检查
          var dirty = res.consumptionDetail.filter(function(c){ return (c.setsCovered||0)===0 && (c.used||0)>0; }).length;
          L('DIRTY_ROWS=' + dirty);
          var neg = (res.consumption||[]).filter(function(c){ return c.remaining < 0; }).length;
          L('NEG_REMAINING=' + neg);

          // 3) 走页面渲染路径（runCompute），验证 UI 能渲染真实数据
          if (typeof runCompute === 'function') {
            runCompute(bom, dem, inv);
            L('RENDER result=' + document.querySelectorAll('#resultTable tbody tr').length +
              ' cd=' + document.querySelectorAll('#consDetailTable tbody tr').length +
              ' slot=' + document.querySelectorAll('#slotTable tbody tr').length);
            var tot = document.getElementById('totbar');
            L('TOTBAR=' + (tot ? tot.textContent.replace(/\\s+/g,' ').trim() : 'none'));
          } else {
            L('runCompute 不可访问（IIFE 作用域）—— 跳过 UI 渲染校验');
          }

          var o = document.createElement('pre'); o.id='TESTOUT';
          o.textContent = window.__L__.join('\\n'); document.body.appendChild(o);
        } catch(e){
          var o2 = document.createElement('pre'); o2.id='TESTOUT';
          o2.textContent = window.__L__.join('\\n') + '\\nFATAL: ' + e.message + ' | ' + (e.stack||'').substring(0,200);
          document.body.appendChild(o2);
        }
      }).catch(function(e){
        var o3 = document.createElement('pre'); o3.id='TESTOUT';
        o3.textContent = window.__L__.join('\\n') + '\\nFETCH_ERR: ' + e.message;
        document.body.appendChild(o3);
      });
    } catch(err){
      var o4 = document.createElement('pre'); o4.id='TESTOUT';
      o4.textContent = 'FATAL: ' + err.message + '\\n' + window.__L__.join('\\n');
      document.body.appendChild(o4);
    }
  }, 2500);
});
</script>
`;

html = html.replace('</body>', testScript + '\n</body>');
fs.writeFileSync(path.join(PUB, 'autotest2.html'), html, 'utf8');
console.log('已生成 autotest2.html');
