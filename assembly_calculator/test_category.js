// 测试：关系类别（BOM 行级分组）的两类行为
//  规则⑤ 已于 2026-09-21 作废：
//   - 供应商子件 不再「有库存就组(不封顶)」，一律按需求封顶（与单一子件一致）
//   - 不再「无需求时自动发现仓库」，实例仅由需求行驱动
//  关系类别的作用现在仅限【库存隔离/分组齐套】：
//   - 供应商子件组先消耗库存，单一子件组后消耗（两组共享库存池、互不抢占）
//   - 两组均按需求封顶，封顶口径共用同一父件-仓库需求量 D
const { compute } = require('./engine.js');

const bom = [
  ['父件', '子件', '配比', '替换组', '备注', '关系类别'],
  ['PA', 'CA', 1, '', '', ''],
  ['PB', 'CB', 1, '', '', '供应商子件'], // BOM 兜底：供应商子件
  ['PC', 'CC', 1, '', '', ''],
  ['PD', 'CD', 1, '', '', '']
];
const demand = [
  ['父件', '仓库', '需求', '销量', '关系类别'],
  ['PA', 'W', 5, 10, '供应商子件'], // 需求行显式供应商子件
  ['PB', 'W', 5, 10, ''],           // 需求空白 -> 取 BOM 兜底(供应商子件)
  ['PC', 'W', 5, 10, '单一子件'],   // 单一子件 -> 按需求封顶
  ['PD', 'W', 5, 10, '']            // 缺省 -> 单一子件
];
const inv = [
  ['子件', '仓库', '库存'],
  ['CA', 'W', 100],
  ['CB', 'W', 100],
  ['CC', 'W', 100],
  ['CD', 'W', 100]
];

function get(res, parent) { return res.results.find(r => r.parent === parent); }

let ok = true;
function check(name, got, want) {
  const pass = got === want;
  if (!pass) ok = false;
  console.log((pass ? '  ✅' : '  ❌') + ' ' + name + ' => 组装 ' + got + (pass ? '' : (' (期望 ' + want + ')')));
}

console.log('=== 关系类别：分组齐套 + 统一按需求封顶（规则⑤已作废）===');
const res = compute(bom, demand, inv, { capByDemand: true });

const pa = get(res, 'PA');
check('PA 供应商子件(需求行显式): 需求5 库存100 -> 5(按需求封顶)', pa.assembled, 5);
check('PA 类别标签', pa.category, '供应商子件');

const pb = get(res, 'PB');
check('PB BOM兜底供应商子件: 需求5 库存100 -> 5(按需求封顶)', pb.assembled, 5);
check('PB 类别标签(取自BOM)', pb.category, '供应商子件');

const pc = get(res, 'PC');
check('PC 单一子件: 需求5 库存100 -> 5(按需求封顶)', pc.assembled, 5);

const pd = get(res, 'PD');
check('PD 缺省(空白): -> 5(等同单一子件)', pd.assembled, 5);
check('PD 类别标签', pd.category, '单一子件');

// 全局 capByDemand:false 应覆盖一切为不封顶（底层兜底开关）
const res2 = compute(bom, demand, inv, { capByDemand: false });
check('全局capByDemand:false -> PC 也放开封顶(100)', get(res2, 'PC').assembled, 100);

// 单一子件 + 库存<需求 -> 仍受库存限制
const bomB = [['父件', '子件', '配比', '替换组', '备注', '关系类别'], ['PE', 'CE', 1, '', '', '']];
const demB = [['父件', '仓库', '需求', '销量', '关系类别'], ['PE', 'W', 10, 1, '单一子件']];
const invB = [['子件', '仓库', '库存'], ['CE', 'W', 3]];
const resB = compute(bomB, demB, invB, { capByDemand: true });
check('PE 单一子件 库存3<需求10 -> 3(齐套+库存限制)', get(resB, 'PE').assembled, 3);

// ★ 关键回归：供应商组 + 单一组 同父件、共享库存、统一按需求封顶
//   PX: 供应商组(CS 配比1, 库存100) + 单一组(CS 配比1, 库存100 共享) ；需求30
//   供应商组先消耗：cap=min(100/1)=100，封顶 D=30 -> 30 套（不再无限组装）
//   单一组后消耗：剩余 CS=70，cap=70，封顶 D-30=0 -> 0 套
const bomC = [
  ['父件', '子件', '配比', '替换组', '备注', '关系类别'],
  ['PX', 'CS', 1, '', '', '供应商子件'],
  ['PX', 'CS', 1, '', '', '单一子件']
];
const demC = [['父件', '仓库', '需求', '销量', '关系类别'], ['PX', 'W', 30, 1, '']];
const invC = [['子件', '仓库', '库存'], ['CS', 'W', 100]];
const resC = compute(bomC, demC, invC, { capByDemand: true });
const pxS = resC.results.find(r => r.parent === 'PX' && r.isSupplier);
const pxD = resC.results.find(r => r.parent === 'PX' && !r.isSupplier);
check('PX 供应商组 需求30 库存100 -> 30(按需求封顶, 非100)', pxS ? pxS.assembled : -1, 30);
check('PX 单一组 需求30 供应商已组30 -> 0(封顶=D-30=0)', pxD ? pxD.assembled : -1, 0);
check('PX 合计组装 = 需求30', (pxS.assembled + pxD.assembled), 30);

console.log('\n关系类别测试:', ok ? '✅ 全部通过' : '❌ 存在失败');
process.exit(ok ? 0 : 1);
