// 生成"三表合一"示例 xlsx，并验证多 sheet 解析 -> compute 全链路
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { SAMPLE } = require('./sample_data.js');
const { compute } = require('./engine.js');

const OUT = path.join(__dirname, '示例数据-三表合一.xlsx');

// 1) 生成三 sheet 的 Excel（sheet 名含关键字，便于解析匹配）
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(SAMPLE.bom), 'BOM关系');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(SAMPLE.demand), '需求');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(SAMPLE.inventory), '库存');
XLSX.writeFile(wb, OUT);
console.log('生成示例 xlsx ->', OUT);

// 2) 复刻前端 readExcelFile 的多 sheet 解析逻辑
function sheetMatcher(wb, keys) {
  const names = wb.SheetNames;
  for (let i = 0; i < names.length; i++) {
    const n = names[i].toLowerCase();
    for (let k = 0; k < keys.length; k++) {
      if (n.indexOf(keys[k].toLowerCase()) >= 0) return wb.Sheets[names[i]];
    }
  }
  return null;
}
function sheetToRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}
const wb2 = XLSX.read(fs.readFileSync(OUT), { type: 'buffer' });
const bomS = sheetMatcher(wb2, ['bom', 'bom关系', '物料']) || wb2.Sheets[wb2.SheetNames[0]];
const demS = sheetMatcher(wb2, ['需求', 'demand']) || wb2.Sheets[wb2.SheetNames[1]];
const invS = sheetMatcher(wb2, ['库存', 'inv', 'stock']) || wb2.Sheets[wb2.SheetNames[2]];
const bom = sheetToRows(bomS), demand = sheetToRows(demS), inv = sheetToRows(invS);

// 3) 计算并断言
const res = compute(bom, demand, inv, { capByDemand: true });
console.log('\n解析到的三表行数: BOM=%d, 需求=%d, 库存=%d', bom.length, demand.length, inv.length);
console.log('计算结果:');
res.results.forEach(r => {
  console.log('  %s / %s => 组装%d (需求%d, 缺口%d) | %s', r.warehouse, r.parent, r.assembled, r.demand, r.shortfall, r.bottleneck);
});

const expect = { '仓A||P1': 15, '仓A||P2': 0, '仓A||P3': 3, '仓B||P1': 10, '仓B||P4': 5, '仓A||P5': 100 };
let ok = true;
res.results.forEach(r => {
  const key = r.warehouse + '||' + r.parent;
  if (expect[key] !== undefined && expect[key] !== r.assembled) {
    console.log('  ❌ 不符: %s 期望%d 实得%d', key, expect[key], r.assembled);
    ok = false;
  }
});
console.log('\n多 sheet 解析+计算校验:', ok ? '✅ 通过' : '❌ 失败');
process.exit(ok ? 0 : 1);
