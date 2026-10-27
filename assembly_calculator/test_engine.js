// Node 验证脚本：用示例数据跑引擎，断言结果符合手算预期
const { compute } = require('./engine.js');
const { SAMPLE } = require('./sample_data.js');

const res = compute(SAMPLE.bom, SAMPLE.demand, SAMPLE.inventory);
console.log('=== 结果 ===');
res.results.forEach(r => {
  console.log(`${r.warehouse} | ${r.parent} | 销量=${r.sales} | 需求=${r.demand} | 组装量=${r.assembled} | 缺口=${r.shortfall} | ${r.bottleneck}`);
});
console.log('总需:', res.totals.demand, '总组:', res.totals.assembled);
console.log('警告:', res.warnings);

// 期望
const expect = {
  '仓A||P1': 15, '仓A||P2': 0, '仓A||P3': 3, '仓A||P5': 5,
  '仓B||P1': 10, '仓B||P4': 5   // 仓B 的 C3=10 限 P1 上限（分仓库存隔离）
};
let ok = true;
res.results.forEach(r => {
  const key = r.warehouse + '||' + r.parent;
  const exp = expect[key];
  const pass = exp === r.assembled;
  if (!pass) ok = false;
  console.log(`  [${pass ? 'OK' : 'FAIL'}] ${key}: got ${r.assembled}, expect ${exp}`);
});
console.log(ok ? '\n✅ 全部符合预期' : '\n❌ 存在不符');
process.exit(ok ? 0 : 1);
