const XLSX = require("xlsx");
const TPL = "F:/下载/组装量计算模板(1).xlsx";
const REF = "E:/1新建文件夹/桌面/11.xlsx";

const wb = XLSX.readFile(TPL);
const get = s => XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1 }).slice(1).filter(r => r.some(c => c != null && c !== ""));
const bomRaw = get("BOM关系"), demRaw = get("需求"), invRaw = get("库存");
const num = (v, d) => { const n = parseFloat(v); return isNaN(n) ? (d == null ? 0 : d) : n; };

function parseBOM(fix) {
  const parents = {};
  bomRaw.forEach(r => {
    const p = String(r[0]).trim(); if (!p) return;
    const c = String(r[1]).trim(); const ratio = num(r[2], 1);
    const grp = r[3] != null && r[3] !== "" ? String(r[3]).trim() : "";
    const rem = r[4] != null ? String(r[4]).trim() : "";
    if (!parents[p]) parents[p] = { slots: {} };
    const key = grp ? ("G:" + grp) : ("C:" + c);
    if (!parents[p].slots[key]) parents[p].slots[key] = { children: [] };
    const m = rem.match(/换配比[:：]?\s*(\d+(?:\.\d+)?)/);
    const repl = m ? parseFloat(m[1]) : null;
    const isPrim = repl == null;
    parents[p].slots[key].children.push({ child: c, ratio: isPrim ? ratio : num(rem, ratio), repl, alt: !isPrim, cRatio: ratio });
  });
  if (fix) {
    Object.keys(parents).forEach(p => {
      Object.keys(parents[p].slots).forEach(key => {
        const slot = parents[p].slots[key];
        if (key.startsWith("G:")) {
          const grp = key.slice(2);
          const has = slot.children.some(ch => ch.child === grp);
          if (!has) {
            const alt = slot.children.find(ch => ch.alt);
            slot.children.push({ child: grp, ratio: alt ? alt.cRatio : 1, repl: null, alt: false, implicit: true, cRatio: alt ? alt.cRatio : 1 });
          }
        }
      });
    });
  }
  return parents;
}

function pool() { const m = {}; invRaw.forEach(r => { const c = String(r[0]).trim(), w = String(r[1]).trim(), k = w + "||" + c; m[k] = num(r[2], 0); }); return m; }

const refWB = XLSX.readFile(REF);
const refRows = XLSX.utils.sheet_to_json(refWB.Sheets["Sheet2"], { header: 1 }).slice(1, 11).filter(r => r[0] != null);
const ref = {}; refRows.forEach(r => ref[r[0] + "|" + r[1]] = num(r[2], 0));

function algo(parents, mode) {
  const P = pool(); const out = {};
  const byWh = {};
  demRaw.forEach(r => { const p = String(r[0]).trim(), w = String(r[1]).trim(); (byWh[w] = byWh[w] || []).push({ p, dem: num(r[2], 0), sales: num(r[3], 0) }); });
  Object.keys(byWh).forEach(wh => {
    const list = byWh[wh].slice().sort((a, b) => b.sales - a.sales);
    list.forEach(it => {
      const pobj = parents[it.p]; if (!pobj) { out[wh + "|" + it.p] = 0; return; }
      let k = Infinity;
      Object.values(pobj.slots).forEach(slot => {
        let eff = 0; slot.children.forEach(ch => { const k2 = wh + "||" + ch.child; const q = P[k2] || 0; eff += q / (ch.alt ? ch.repl : 1) / ch.ratio; });
        k = Math.min(k, Math.floor(eff));
      });
      k = Math.min(k, it.dem); if (k < 0) k = 0;
      if (mode === "deplete") {
        Object.values(pobj.slots).forEach(slot => {
          slot.children.slice().sort((a, b) => (a.alt ? 0 : 1) - (b.alt ? 0 : 1)).forEach(ch => {
            const k2 = wh + "||" + ch.child; if (!P[k2]) return;
            let take = ch.alt ? Math.min(P[k2], k * ch.repl) : Math.min(P[k2], k * ch.ratio);
            P[k2] -= take;
          });
        });
      }
      out[wh + "|" + it.p] = k;
    });
  });
  return out;
}

function cmp(label, res) {
  let ok = 0, tot = 0; const diffs = [];
  Object.keys(ref).forEach(k => { tot++; const m = res[k] == null ? 0 : res[k]; if (m === ref[k]) ok++; else diffs.push(k + " ref=" + ref[k] + " mine=" + m); });
  console.log(label + ": 匹配 " + ok + "/" + tot);
  diffs.forEach(d => console.log("   X " + d));
}

["indep", "deplete"].forEach(mode => {
  [false, true].forEach(fix => {
    const parents = parseBOM(fix);
    cmp("mode=" + mode + " fix=" + fix, algo(parents, mode));
  });
});
