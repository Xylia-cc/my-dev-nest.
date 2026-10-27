// 规则②专项测试（修正后口径）：
//   · 行内【子件列】的料      → 配比取【配比列(C列)】
//   · 行内【替换组列】的料(主件) → 配比取【备注「换配比:N」】；未显式列出时隐式加入(无备注则默认1)
//   · 替换组内先扣替代件、用尽后再扣主件
const { compute } = require('./engine.js');

function check(name, bom, demand, inv, expect) {
  const res = compute(bom, demand, inv, { capByDemand: true });
  let ok = true;
  if (expect.assembled) {
    res.results.forEach(r => {
      const key = r.warehouse + '||' + r.parent;
      if (expect.assembled[key] !== undefined && expect.assembled[key] !== r.assembled) {
        console.log('  ❌ ' + name + ': ' + key + ' 组装期望' + expect.assembled[key] + ' 实得' + r.assembled);
        ok = false;
      }
    });
  }
  (expect.detail || []).forEach(e => {
    const matches = res.consumptionDetail.filter(x => String(x.parent) === e.parent && String(x.child) === e.child);
    if (matches.length === 0) { console.log('  ❌ ' + name + ': 缺少明细 ' + e.parent + '/' + e.child); ok = false; return; }
    const totalUsed = matches.reduce((s, m) => s + m.used, 0);
    const totalSets = matches.reduce((s, m) => s + m.setsCovered, 0);
    const ratio = matches[0].ratio;
    if (ratio !== e.ratio || totalUsed !== e.used || totalSets !== e.setsCovered) {
      console.log('  ❌ ' + name + ': 明细 ' + e.child +
        ' 期望 配比' + e.ratio + '/覆盖' + e.setsCovered + '/耗' + e.used +
        ' 实得 配比' + ratio + '/覆盖' + totalSets + '/耗' + totalUsed);
      ok = false;
    }
  });
  console.log((ok ? '✅' : '❌') + ' ' + name);
  return ok;
}

const H = ['父件', '子件', '配比', '替换组', '备注'];
let all = true;

// 场景1【核心·真实模板同构】：隐式主件 M，替代件 ALT 取 C列=2，主件 M 取备注换配比=1
//   eff = 10/2 + 40/1 = 5 + 40 = 45；先扣替代件 ALT(5套耗10)，再扣主件 M(40套耗40)
all = check('隐式主件·替代件取C列/主件取备注', 
  [H, ['P1', 'ALT', 2, 'M', '换配比:1']],
  [['父件', '仓库', '需求', '销量'], ['P1', '仓A', 100, 1]],
  [['子件', '仓库', '库存'], ['ALT', '仓A', 10], ['M', '仓A', 40]],
  { assembled: { '仓A||P1': 45 },
    detail: [
      { parent: 'P1', child: 'ALT', ratio: 2, setsCovered: 5, used: 10 },
      { parent: 'P1', child: 'M',   ratio: 1, setsCovered: 40, used: 40 }
    ] }
) && all;

// 场景2【主件显式列出】：主件 M 显式列出，配比取自身 C列=3（备注不再作用于已列出的主件）
//   eff = 10/2 + 40/3 = 5 + 13 = 18；ALT 先扣(5套耗10)，M 补 13套耗39
all = check('主件显式列出·取自身C列',
  [H, ['P1', 'M', 3, 'M', ''], ['P1', 'ALT', 2, 'M', '换配比:1']],
  [['父件', '仓库', '需求', '销量'], ['P1', '仓A', 100, 1]],
  [['子件', '仓库', '库存'], ['ALT', '仓A', 10], ['M', '仓A', 40]],
  { assembled: { '仓A||P1': 18 },
    detail: [
      { parent: 'P1', child: 'ALT', ratio: 2, setsCovered: 5, used: 10 },
      { parent: 'P1', child: 'M',   ratio: 3, setsCovered: 13, used: 39 }
    ] }
) && all;

// 场景3【两个替代件 + 隐式主件】：A1(C=1)、A2(C=2) 各取自身配比，主件 M 取备注换配比=1
//   eff = 4/1 + 6/2 + 20/1 = 4+3+20 = 27；A1扣4、A2扣3套耗6、M扣20套耗20
all = check('多替代件·各自C列配比',
  [H, ['P1', 'A1', 1, 'M', '换配比:1'], ['P1', 'A2', 2, 'M', '']],
  [['父件', '仓库', '需求', '销量'], ['P1', '仓A', 100, 1]],
  [['子件', '仓库', '库存'], ['A1', '仓A', 4], ['A2', '仓A', 6], ['M', '仓A', 20]],
  { assembled: { '仓A||P1': 27 },
    detail: [
      { parent: 'P1', child: 'A1', ratio: 1, setsCovered: 4, used: 4 },
      { parent: 'P1', child: 'A2', ratio: 2, setsCovered: 3, used: 6 },
      { parent: 'P1', child: 'M',  ratio: 1, setsCovered: 20, used: 20 }
    ] }
) && all;

// 场景4【备注给主件配比2】：ALT 取 C列=2，主件 M 取备注换配比=2
//   eff = 10/2 + 40/2 = 5 + 20 = 25；ALT扣5套耗10、M扣20套耗40
all = check('主件配比取备注换配比:2',
  [H, ['P1', 'ALT', 2, 'M', '换配比:2']],
  [['父件', '仓库', '需求', '销量'], ['P1', '仓A', 100, 1]],
  [['子件', '仓库', '库存'], ['ALT', '仓A', 10], ['M', '仓A', 40]],
  { assembled: { '仓A||P1': 25 },
    detail: [
      { parent: 'P1', child: 'ALT', ratio: 2, setsCovered: 5, used: 10 },
      { parent: 'P1', child: 'M',   ratio: 2, setsCovered: 20, used: 40 }
    ] }
) && all;

console.log('\n规则②测试汇总:', all ? '全部通过 ✅' : '存在失败 ❌');
process.exit(all ? 0 : 1);
