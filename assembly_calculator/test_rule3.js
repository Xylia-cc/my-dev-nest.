// 规则3 专项验证：共享子件"继续分配直至耗尽" + "不齐套释放"
const { compute } = require('./engine.js');

function run(name, bom, demand, inv, expect) {
  const res = compute(bom, demand, inv, { capByDemand: true });
  const got = {};
  res.results.forEach(r => got[r.warehouse + '||' + r.parent] = r.assembled);
  let ok = true;
  Object.keys(expect).forEach(k => { if (got[k] !== expect[k]) ok = false; });
  console.log(`[${ok ? 'OK' : 'FAIL'}] ${name}`);
  res.results.forEach(r => console.log(`     ${r.warehouse} ${r.parent} = ${r.assembled} (期望 ${expect[r.warehouse + '||' + r.parent]})`));
  return ok;
}

// 场景1：继续分配直至耗尽 —— 高优先级 P1 把共享 S 吃光，P2 只得 0
const bomA = [
  ['父件', '子件', '配比', '仓库', '替换组', '备注'],
  ['P1', 'S', 2, '仓A', '', ''], ['P1', 'T', 1, '仓A', '', ''],
  ['P2', 'S', 1, '仓A', '', ''], ['P2', 'U', 1, '仓A', '', '']
];
const demA = [['父件', '仓库', '需求', '销量'], ['P1', '仓A', 5, 100], ['P2', '仓A', 10, 50]];
const invA = [['子件', '仓库', '库存'], ['S', '仓A', 10], ['T', '仓A', 100], ['U', '仓A', 10]];

// 场景2：不齐套释放 —— P1 因非共享料 T=0 连1套都组不了，共享 S 全部释放给 P2
const invB = [['子件', '仓库', '库存'], ['S', '仓A', 10], ['T', '仓A', 0], ['U', '仓A', 10]];

let allOk = true;
allOk &= run('场景1 共享料优先级分配', bomA, demA, invA, { '仓A||P1': 5, '仓A||P2': 0 });
allOk &= run('场景2 不齐套释放', bomA, demA, invB, { '仓A||P1': 0, '仓A||P2': 10 });

console.log(allOk ? '\n✅ 规则3 两类行为均符合预期' : '\n❌ 规则3 验证失败');
process.exit(allOk ? 0 : 1);
