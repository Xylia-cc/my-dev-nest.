// 多模板回归：对比修复前后（用 git stash 切换引擎太麻烦，直接参数化对比两份引擎文件）
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OLD = 'assembly_calculator/engine.js';       // 当前（已修复）
const NEW = 'assembly_calculator/engine.js';

const TEMPLATES = [
  'E:/1新建文件夹/桌面/分仓-组装/组装量计算模板261106.xlsx',
  'E:/1新建文件夹/桌面/分仓-组装/组装量计算模板261105.xlsx',
  'E:/1新建文件夹/桌面/分仓-组装/组装量计算模板261105-新品.xlsx',
  'E:/1新建文件夹/桌面/分仓-组装/组装量计算模板-c.xlsx'
].filter(function (p) { return fs.existsSync(p); });

// 完整性与总量校验
function check(enginePath, file) {
  const eng = require(path.resolve(enginePath));
  delete require.cache[require.resolve(path.resolve(enginePath))];
  const wb = XLSX.readFile(file);
  const res = eng.compute(
    XLSX.utils.sheet_to_json(wb.Sheets['BOM关系'], { header: 1 }),
    XLSX.utils.sheet_to_json(wb.Sheets['需求'], { header: 1 }),
    XLSX.utils.sheet_to_json(wb.Sheets['库存'], { header: 1 }),
    { capByDemand: true }
  );
  const cd = res.consumptionDetail || [];
  let neg = 0, dirty = 0, mixed = 0, over = 0;
  const inv = XLSX.utils.sheet_to_json(wb.Sheets['库存'], { header: 1 });
  const im = new Map();
  inv.slice(1).forEach(function (r) {
    const k = String(r[1] || '').toLowerCase() + '||' + String(r[0] || '');
    im.set(k, (im.get(k) || 0) + Number(r[2] || 0));
  });
  const um = new Map();
  cd.forEach(function (c) {
    if ((c.setsCovered || 0) === 0 && (c.used || 0) > 0) dirty++;
    const k = c.warehouse.toLowerCase() + '||' + c.child;
    um.set(k, (um.get(k) || 0) + (c.used || 0));
  });
  um.forEach(function (u, k) { if (u > (im.get(k) || 0) + 0.001) over++; });
  (res.consumption || []).forEach(function (c) { if (c.remaining < 0) neg++; });
  const kk = {};
  cd.forEach(function (c) {
    const t = c.warehouse + '|' + c.parent + '|' + c.slotKey + '|' + c.relation;
    kk[t] = (kk[t] || 0) + (c.isPrimary ? 2 : 1);
  });
  Object.keys(kk).forEach(function (t) { if (kk[t] === 3) mixed++; });

  return {
    total: res.totals.assembled,
    rows: res.results.length,
    detail: cd.length,
    neg: neg, dirty: dirty, mixed: mixed, over: over
  };
}

TEMPLATES.forEach(function (f) {
  const name = path.basename(f);
  const r = check(NEW, f);
  const bad = r.neg + r.dirty + r.mixed + r.over;
  console.log('[' + name + ']');
  console.log('  总组装=' + r.total + '  结果行=' + r.rows + '  明细行=' + r.detail);
  console.log('  负剩余=' + r.neg + ' 脏行=' + r.dirty + ' 组内混用=' + r.mixed + ' 超扣=' + r.over +
    '  → ' + (bad === 0 ? '完整性 OK ✓' : '有异常 ✗'));
});
