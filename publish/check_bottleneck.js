// 核查：17 处「异常」是否真有问题 —— 检查瓶颈料是否真的不够
const XLSX = require('xlsx');
const { compute } = require('../site/engine.js');

const wb = XLSX.readFile('E:/1新建文件夹/桌面/分仓-组装/组装量计算模板261106.xlsx');
const inv = XLSX.utils.sheet_to_json(wb.Sheets['库存'], { header: 1 });
const dem = XLSX.utils.sheet_to_json(wb.Sheets['需求'], { header: 1 });
const res = compute(
  XLSX.utils.sheet_to_json(wb.Sheets['BOM关系'], { header: 1 }),
  dem, inv, { capByDemand: true }
);

const cd = res.consumptionDetail || [];
const invOf = function (c, w) {
  let q = 0;
  inv.slice(1).forEach(function (r) {
    if (String(r[0] || '') === c && String(r[1] || '').toLowerCase() === w.toLowerCase()) q += Number(r[2] || 0);
  });
  return q;
};

console.log('=== 逐条核查 17 处「瓶颈文案矛盾」===');
console.log('（判定标准：该父件所有 slot 的料的可用量是否都够凑满需求）');
console.log('');

const rows = [];
res.results.forEach(function (a) {
  if (a.assembled >= a.demand) return;
  const mm = (a.bottleneck || '').match(/可组(\d+)套\s*<\s*需求(\d+)/);
  if (!mm || !(Number(mm[1]) <= Number(mm[2]) && Number(mm[1]) > a.assembled)) return;

  // 该父件在这个仓的所有 slot（从明细反推）
  const mine = cd.filter(function (c) { return c.parent === a.parent && c.warehouse === a.warehouse; });
  const slots = {};
  mine.forEach(function (c) {
    slots[c.slotKey] = slots[c.slotKey] || { child: c.child, ratio: c.ratio, used: c.used, covered: c.setsCovered };
  });
  // 各 slot 的库存总量 → 理论上限
  const caps = [];
  Object.keys(slots).forEach(function (sk) {
    const s = slots[sk];
    const orig = invOf(s.child, a.warehouse);
    const others = cd.filter(function (c) {
      return c.child === s.child && c.warehouse === a.warehouse && c.parent !== a.parent;
    }).reduce(function (x, c) { return x + (c.used || 0); }, 0);
    const avail = orig - others;                 // 扣掉别人已占的
    caps.push({ slot: sk, child: s.child, ratio: s.ratio, orig: orig, others: others, avail: avail, cap: Math.floor(avail / s.ratio) });
  });
  const minCap = caps.length ? Math.min.apply(null, caps.map(function (c) { return c.cap; })) : 0;
  const reallyBlocked = minCap < a.demand;
  rows.push({ wh: a.warehouse, p: a.parent, demand: a.demand, asm: a.assembled, minCap: minCap, reallyBlocked: reallyBlocked, caps: caps });
});

rows.forEach(function (r) {
  const tag = r.reallyBlocked ? '真瓶颈(库存确实不够)' : '★文案误导(库存其实够)';
  console.log('  ' + r.wh + ' ' + r.p + ' 需求' + r.demand + ' 组装' + r.asm +
    ' | 该父件理论上限=' + r.minCap + ' → ' + tag);
  r.caps.forEach(function (c) {
    console.log('      ' + c.slot + ' 库存' + c.orig + ' 别人占' + c.others + ' 可用' + c.avail + ' → ' + c.cap + '套');
  });
});
console.log('');
console.log('真瓶颈: ' + rows.filter(function (r) { return r.reallyBlocked; }).length +
  ' 个   文案误导: ' + rows.filter(function (r) { return !r.reallyBlocked; }).length + ' 个');
