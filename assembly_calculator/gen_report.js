const XLSX = require("xlsx");
const { compute } = require("./engine.js");

const TPL = "F:/下载/组装量计算模板(1).xlsx";
const REF = "E:/1新建文件夹/桌面/11.xlsx";
const OUT = "D:/workbuddy/分仓组装计算/assembly_calculator/组装量计算结果_比对报告.xlsx";

const wb = XLSX.readFile(TPL);
const aoa = s => XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1 });
const bom = aoa("BOM关系"), dem = aoa("需求"), inv = aoa("库存");
const res = compute(bom, dem, inv, { capByDemand: true });

const refWB = XLSX.readFile(REF);
const refRows = XLSX.utils.sheet_to_json(refWB.Sheets["Sheet2"], { header: 1 }).slice(1, 11).filter(r => r[0] != null);
const ref = {};
refRows.forEach(r => ref[String(r[0]) + "|" + r[1]] = Number(r[2]));

// 组装结果（我的计算）
const resRows = [["仓库", "父件", "销量", "需求", "组装量", "缺口", "齐套率"]];
res.results.forEach(r => {
  resRows.push([r.warehouse, r.parent, r.sales, r.demand, r.assembled, Math.max(0, r.demand - r.assembled),
    r.demand > 0 ? Math.round(r.assembled / r.demand * 100) + "%" : "-"]);
});
// 参考结果
const refRowsOut = [["仓库", "父件", "组装量(参考)"]];
refRows.forEach(r => refRowsOut.push([r[0], r[1], Number(r[2])]));
// 比对
const cmpRows = [["仓库", "父件", "我的计算", "参考结果", "是否一致", "说明"]];
let ok = 0, tot = 0;
const all = new Set();
res.results.forEach(r => all.add(r.warehouse + "|" + r.parent));
Object.keys(ref).forEach(k => all.add(k));
Array.from(all).sort().forEach(k => {
  const [wh, p] = k.split("|");
  const mine = res.results.find(r => r.warehouse === wh && r.parent === p);
  const mv = mine ? mine.assembled : 0;
  const ev = (k in ref) ? ref[k] : 0;
  tot++;
  const match = mv === ev;
  if (match) ok++;
  let note = "";
  if (!match) {
    // 判断是否为共享料冲突
    note = "参考值在该仓该共享子件上不可行(共享库存不足以同时满足)";
  }
  cmpRows.push([wh, p, mv, ev, match ? "一致" : "差异", note]);
});
// 父件实际消耗明细
const detRows = [["仓库", "父件", "组装套数", "slot", "子件", "类型", "配比", "覆盖套数", "实际消耗"]];
res.consumptionDetail.forEach(c => {
  detRows.push([c.warehouse, c.parent, c.sets, c.slotKey, c.child, (c.isPrimary ? "主件" : "替代件"), c.ratio, c.setsCovered, c.used]);
});
// 库存消耗汇总
const consRows = [["仓库", "子件", "消耗", "剩余"]];
res.consumption.forEach(c => consRows.push([c.warehouse, c.child, c.used, c.remaining]));

const out = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(resRows), "组装结果(我的计算)");
XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(refRowsOut), "参考结果(11.xlsx)");
XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(cmpRows), "比对结果");
XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(detRows), "父件消耗明细");
XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(consRows), "库存消耗");
XLSX.writeFile(out, OUT);

console.log("比对汇总: 匹配 " + ok + "/" + tot);
console.log("报告已生成:", OUT);
console.log("warnings:", res.warnings);
