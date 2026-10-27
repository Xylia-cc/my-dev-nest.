/**
 * 读取「test模板.xlsx」三表 → 引擎计算 → 输出结果报告 test模板_计算结果.xlsx
 * 可重复运行：node gen_test_report.js
 *   - 父件消耗明细：不含 slot 列，列序 仓库|父件|子件|类型|配比|覆盖套数|实际消耗|关系|类别
 *   - 整表按「关系」降序（关系2 在前、关系1 在后，同关系内保持原顺序）
 *   - 「类别」= 该父件的「关系类别」（供应商子件/单一子件），由需求行主控、BOM 行兜底
 */
const path = require('path');
const XLSX = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/xlsx');
const { compute } = require('./engine.js');

const TPL = 'E:/1新建文件夹/桌面/test模板.xlsx';
const OUT = path.join(__dirname, 'test模板_计算结果.xlsx');

const wbTpl = XLSX.readFile(TPL);
const aoa = (name) => XLSX.utils.sheet_to_json(wbTpl.Sheets[name], { header: 1, raw: true, defval: '' });
const res = compute(aoa('BOM关系'), aoa('需求'), aoa('库存'), { capByDemand: true });

const wb = XLSX.utils.book_new();

// 1) 组装量
const s1 = [['仓库', '父件', '关系类别', '销量', '需求', '组装量', '缺口']];
res.results.forEach(r => s1.push([r.warehouse, r.parent, r.category || '单一子件', r.sales, r.demand, r.assembled, r.shortfall]));
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1), '组装量');

// 2) 父件消耗明细（无 slot 列；关系、类别排在最后）
const s2 = [['仓库', '父件', '子件', '类型', '配比', '覆盖套数', '实际消耗', '关系', '类别']];
(res.consumptionDetail || []).forEach(c => s2.push([
  c.warehouse, c.parent, c.child, (c.isPrimary ? '主件' : '替代件'),
  c.ratio, c.setsCovered, c.used, '关系' + (c.relation || 1), c.category || '单一子件'
]));
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), '父件消耗明细');

// 3) 库存消耗
const s3 = [['仓库', '子件', '消耗量', '剩余库存']];
res.consumption.forEach(c => s3.push([c.warehouse, c.child, c.used, c.remaining]));
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s3), '库存消耗');

// 4) slot 容量
const s4 = [['仓库', '父件', 'slot', '子件列表', '容量(套)']];
res.results.forEach(r => r.slots.forEach(s => {
  s4.push([r.warehouse, r.parent, s.slotKey, s.children.map(ch => ch.child).join(' + '), s.cap]);
}));
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s4), 'slot容量');

XLSX.writeFile(wb, OUT);

console.log('已生成:', OUT);
console.log('组装量行数:', s1.length - 1, '| 消耗明细行数:', s2.length - 1);
console.log('\n=== 01C/1733466 消耗明细（前 4 行 + 后 4 行）===');
const d = res.consumptionDetail.filter(x => String(x.warehouse) === '01C' && String(x.parent) === '1733466');
d.slice(0, 4).concat(d.slice(-4)).forEach(x => {
  console.log('  ' + x.child + ' | ' + (x.isPrimary ? '主件' : '替代件') + ' | 配比=' + x.ratio + ' | 覆盖' + x.setsCovered + '套 | 消耗=' + x.used + ' | 关系' + x.relation);
});
