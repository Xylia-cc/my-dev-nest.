/*
 * 分仓组装量计算引擎
 * 规则：
 *  1) 共享子件按「子件销量 = 父件日均 × 配比」降序分配（同仓内竞争共享料时生效）
 *  2) 可替换子件：同一(父件,替换组)下的子件互为替代；
 *     【子件列】那个料的配比取【配比列(C列)】；【替换组列】那个料(主件)的配比取【备注列的「换配比:N」】。
 *     先扣替代件库存、用尽后再扣主件(旧子件)库存
 *  3) 共享子件：子件按(子件,仓库)为库存池，按父件优先级顺序递减分配、继续给下一个父件用直至耗尽；
 *     某父件若连1套都凑不齐(不齐套)，其本应占用的共享库存自动释放给下一个父件
 *  4) 齐套才成套装：一个父件下所有子件*配比都满足才算1套，尽量多组；按需求封顶
 *
 * 关键约定：
 *  - BOM关系表【不区分仓库】，是父件级的展开定义（所有仓库共用同一套BOM）；
 *    实际分配时按 仓库 分别处理：某仓库的父件需求只能使用该仓库的子件库存。
 *  - 需求表、库存表 均按 仓库 维度。
 * 输入三表（表头支持中英文别名）：
 *  BOM关系: 父件, 子件, [配比], [替换组], [备注], [关系类别]
 *  需求:    父件, 仓库, 需求, [销量], [关系类别]
 *  库存:    子件, 仓库, 库存  （也支持 仓库, 子件, 库存 — 自动识别）
 * 缺省仓库名 = '默认仓'
 *
 * ★ 关系类别（BOM行级分组，2026-09-19 重构；2026-09-21 规则⑤作废）：
 *  - BOM 每行声明自己的「关系类别」：供应商子件 / 单一子件（缺省=单一子件）。
 *  - 同一父件下，供应商子件行和单一子件行属于**不同的组装组**，各自独立 slot、独立齐套。
 *  - 两组共享库存池：供应商子件组**先消耗**库存，剩余库存给单一子件组（隔离：供应商扣掉的料不再分给单一组）。
 *  - ★ 规则⑤ 作废（2026-09-21）：不再「供应商子件=有库存就组(不封顶)」，也不再无需求时自动发现仓库。
 *    所有关系类别统一**按需求计算**：实例仅由需求行驱动；供应商组、单一组**均按需求封顶**。
 *    封顶口径：供应商组封顶 = 父件-仓库总需求量 D；单一组封顶 = D − 供应商组已组装量（两组共用同一需求池）。
 *  - 仍受规则①+③(共享料按销量优先级消耗)与规则④(齐套)约束。
 */
(function (global) {
  'use strict';

  // 从【备注】里解析"替代件"的配比：替代件不读C列，其配比写在备注列
  // 支持 "2" / "配比:2" / "换配比:2" / "ratio:2" 等，取首个数字
  function parseRemarkRatio(remark) {
    if (remark == null) return null;
    var s = String(remark).trim();
    if (!s) return null;
    var m = s.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  function colIndex(headers, candidates) {
    var lower = (headers || []).map(function (h) {
      return String(h == null ? '' : h).trim().toLowerCase();
    });
    for (var c = 0; c < candidates.length; c++) {
      var idx = lower.indexOf(String(candidates[c]).toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  }

  // 把任意行数组（含表头）转成对象数组，字段做归一化映射
  function normalize(rows, mapping) {
    if (!rows || rows.length < 2) return [];
    var headers = rows[0];
    var resolved = {};
    Object.keys(mapping).forEach(function (key) {
      resolved[key] = colIndex(headers, mapping[key]);
    });
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.every(function (c) { return c == null || c === ''; })) continue;
      var o = {};
      Object.keys(resolved).forEach(function (key) {
        var idx = resolved[key];
        o[key] = idx >= 0 ? r[idx] : undefined;
      });
      out.push(o);
    }
    return out;
  }

  function num(v, d) {
    if (v == null || v === '') return d;
    var n = parseFloat(v);
    return isNaN(n) ? d : n;
  }

  // 关系类别归一化：供应商子件 / 单一子件（缺省单一子件=按需求封顶）
  function normalizeCat(v) {
    if (v == null) return null;
    var s = String(v).trim().toLowerCase();
    if (!s) return null;
    if (s.indexOf('供应商') >= 0 || s === 'supplier' || s === 'vendor' || s.indexOf('supply') >= 0) return 'supplier';
    return 'single'; // 含「单一」/ single / 其他/空白 一律按单一子件（需求封顶）
  }

  // 关系类别归一化值 -> 中文展示标签
  function catLabel(c) {
    if (c === 'supplier') return '供应商子件';
    if (c === 'single') return '单一子件';
    if (c == null) return '单一子件';
    return String(c);
  }

  function compute(rawBom, rawDemand, rawInv, opts) {
    opts = opts || {};
    var capByDemand = opts.capByDemand !== false; // 默认按需求封顶
    var warnings = []; // ★ 必须在 BOM 列序检测(bomSwap)之前定义，否则触发列交换时会崩溃

    // BOM 关系不取仓库字段（父件级展开）
    var bom = normalize(rawBom, {
      父件: ['父件', 'parent', '成品', 'mother'],
      子件: ['子件', 'child', '元件', '组件'],
      配比: ['配比', 'ratio', '单耗', '用量'],
      替换组: ['替换组', 'group', '替换', 'altgroup', '替代组'],
      备注: ['备注', 'remark', '说明', 'note'],
      关系类别: ['关系类别', 'category', '关系', '类别', '类型', 'type']
    });

    // ★ 自动检测 BOM 列序：支持「父件|子件|配比」和「父件|配比|子件」
    //    原理：子件编码(SKU)量级远大于配比。若"子件"列的典型值反而小于"配比"列，说明两列放反了。
    //    ★ 取前 50 行采样 + 中位数比较：不受个别异常值干扰，且不依赖固定阈值（旧逻辑用 <=10 / >100 易误判）
    var bomSwap = false;
    if (bom.length > 0) {
      var sampleN = Math.min(bom.length, 50);
      var cVals = [], rVals = [];
      for (var i = 0; i < sampleN; i++) {
        cVals.push(num(bom[i].子件, 0));
        rVals.push(num(bom[i].配比, 0));
      }
      function medianOf(a) {
        var s = a.slice().sort(function (x, y) { return x - y; });
        return s[Math.floor(s.length / 2)];
      }
      var cMed = medianOf(cVals), rMed = medianOf(rVals);
      if (cMed > 0 && rMed > 0 && cMed < rMed) {
        bomSwap = true;
        warnings.push('检测到 BOM 关系表列序为「父件|配比|子件」，已自动适配。');
      }
    }
    if (bomSwap) {
      bom.forEach(function (r) {
        var tmp = r.子件; r.子件 = r.配比; r.配比 = tmp;
      });
    }
    var demand = normalize(rawDemand, {
      父件: ['父件', 'parent', '成品'],
      仓库: ['仓库', 'wh', 'warehouse', '仓'],
      需求: ['需求', 'demand', 'qty', '数量', '计划量'],
      销量: ['销量', 'sales', '销', '日均销量', '销量(优先级)'],
      关系类别: ['关系类别', 'category', '关系', '类别', '类型', 'type']
    });
    var inv = normalize(rawInv, {
      子件: ['子件', 'child', '元件', '组件'],
      仓库: ['仓库', 'wh', 'warehouse', '仓'],
      库存: ['库存', 'inv', 'qty', '数量', 'stock', '结存']
    });

    var DEF = '默认仓';
    function whOf(v) { return (v == null || v === '') ? DEF : String(v).trim(); }

    // 若 BOM 表头含仓库列，提示已忽略
    (function () {
      if (!rawBom || rawBom.length < 1) return;
      var h = (rawBom[0] || []).map(function (x) { return String(x == null ? '' : x).trim().toLowerCase(); });
      if (h.indexOf('仓库') >= 0 || h.indexOf('wh') >= 0 || h.indexOf('warehouse') >= 0 || h.indexOf('仓') >= 0) {
        warnings.push('BOM关系表含「仓库」列，已忽略：BOM 按父件级展开、不区分仓库（各仓共用同一套 BOM）。');
      }
    })();

    // ═══════════════════════════════════════════════════════════════
    // 1) BOM 结构：按 (父件, 关系类别) 分组构建
    //    同一父件下，供应商子件行和单一子件行属于不同的组装组，各自独立 slot。
    //    配比来源（关键）：
    //      · 行内【子件列】的料  → 配比取自【配比列 / C列】（num(r.配比)）
    //      · 行内【替换组列】的料(主件) → 配比取自【备注列的「换配比:N」】
    //    ★ 关系类别决定规则：
    //      - BOM 行显式声明了「关系类别」→ 按声明值分组
    //      - BOM 行未声明 → 若同父件其他行有显式声明 → 本行默认单一子件
    //      - BOM 行未声明 → 若同父件所有行都未声明 → 使用需求行的关系类别兜底
    // ═══════════════════════════════════════════════════════════════

    // 预扫描：哪些父件有至少一行 BOM 显式声明了关系类别
    var parentHasExplicitCat = new Set();
    bom.forEach(function (r) {
      if (normalizeCat(r.关系类别)) {
        var p = String(r.父件 == null ? '' : r.父件).trim();
        if (p) parentHasExplicitCat.add(p);
      }
    });

    // 预扫描：需求行的关系类别（仅对 BOM 全部未声明类别的父件生效）
    var demandCatByParent = new Map();
    demand.forEach(function (r) {
      var p = String(r.父件 == null ? '' : r.父件).trim();
      if (!p) return;
      var dc = normalizeCat(r.关系类别);
      if (dc && !parentHasExplicitCat.has(p)) {
        // 'supplier' 优先（若任一需求行标供应商，整父件视为供应商）
        if (!demandCatByParent.has(p) || dc === 'supplier') {
          demandCatByParent.set(p, dc);
        }
      }
    });

    var bomByParent = new Map(); // parent → { parent, groups: Map<cat, {category, slots}> }

    bom.forEach(function (r) {
      var p = String(r.父件 == null ? '' : r.父件).trim();
      if (!p) return;
      var childKey = String(r.子件 == null ? '' : r.子件).trim();
      if (!childKey) return;
      if (!bomByParent.has(p)) bomByParent.set(p, { parent: p, groups: new Map() });
      var pobj = bomByParent.get(p);

      var bc = normalizeCat(r.关系类别);
      if (!bc) {
        // BOM 行未显式声明关系类别
        if (parentHasExplicitCat.has(p)) {
          bc = 'single';  // 同父件其他行有显式声明 → 本行默认单一子件
        } else {
          bc = demandCatByParent.get(p) || 'single'; // 需求行兜底，否则默认单一子件
        }
      }
      if (!pobj.groups.has(bc)) pobj.groups.set(bc, { category: bc, slots: new Map() });
      var group = pobj.groups.get(bc);

      var cRatio = num(r.配比, 1);
      var remarkRatio = parseRemarkRatio(r.备注);
      var slotKey = (r.替换组 != null && r.替换组 !== '') ? 'G:' + String(r.替换组).trim()
                                                          : 'C:' + childKey;
      var isGroup = /^G:/.test(slotKey);
      if (!group.slots.has(slotKey)) group.slots.set(slotKey, { children: [], primaryRatio: null });
      var slot = group.slots.get(slotKey);

      // 同一 slot 内同一子件在**同一类别组**内若重复出现，配比累加
      var existing = slot.children.find(function (x) { return x.child === childKey; });
      if (existing) {
        existing.ratio += cRatio;
        existing.cRatio += cRatio;
        existing.repl = existing.ratio;
      } else {
        slot.children.push({
          child: childKey,
          ratio: cRatio,          // 子件列成员：配比取 C列
          cRatio: cRatio,
          isAlt: isGroup,         // 替换组内的成员默认视为替代件（主件在下方按组值纠正）
          isPrimary: !isGroup,
          repl: cRatio,
          remark: r.备注,
          category: bc            // 本行所属关系类别
        });
      }
      // 替换组主件的配比来自备注「换配比:N」（取组内首个可用值）
      if (isGroup && remarkRatio != null && slot.primaryRatio == null) slot.primaryRatio = remarkRatio;
    });

    // 1.4) 替换组主件定位（per BOM group）
    bomByParent.forEach(function (pobj) {
      pobj.groups.forEach(function (group) {
        group.slots.forEach(function (slot, slotKey) {
          if (!/^G:/.test(slotKey)) return;
          var grp = slotKey.slice(2);
          var listed = slot.children.filter(function (c) { return c.child === grp; });
          if (listed.length) {
            listed.forEach(function (c) { c.isPrimary = true; c.isAlt = false; });
            return;
          }
          var pr;
          if (slot.primaryRatio != null) {
            pr = slot.primaryRatio;
          } else if (slot.children.length > 0) {
            pr = slot.children[0].cRatio; // 备注空白时，默认取同组替代件C列配比
          } else {
            pr = 1;
          }
          slot.children.push({
            child: grp, ratio: pr, cRatio: pr,
            isAlt: false, isPrimary: true, repl: pr, remark: '', implicit: true,
            category: group.category
          });
          warnings.push('替换组『' + grp + '』未在主件列表显式列出，已按隐式主件加入（配比取自备注换配比=' + (slot.primaryRatio != null ? pr : '未指定，默认取同组替代件C列配比=' + pr) + '，库存取自库存表）。');
        });
      });
    });

    // 每个 slot 规整
    bomByParent.forEach(function (pobj) {
      pobj.groups.forEach(function (group) {
        group.slots.forEach(function (slot) {
          var nonAlt = slot.children.find(function (c) { return !c.isAlt; });
          slot.ratio = nonAlt ? nonAlt.ratio : (slot.children[0] ? slot.children[0].ratio : 1);
        });
      });
    });

    // 1.5) 共享子件识别：同一子件出现在多个父件展开中
    var childParents = new Map();
    bomByParent.forEach(function (pobj) {
      pobj.groups.forEach(function (group) {
        group.slots.forEach(function (slot) {
          slot.children.forEach(function (c) {
            if (!childParents.has(c.child)) childParents.set(c.child, new Set());
            childParents.get(c.child).add(pobj.parent);
          });
        });
      });
    });
    function isShared(child) { return childParents.has(child) && childParents.get(child).size > 1; }

    // 2) 库存池：key = 仓库||子件（按仓库隔离，同键累加）
    //    ★ 自动识别列序：支持「子件|仓库|库存」和「仓库|子件|库存」两种格式
    var invSwap = false; // true = 仓库在第一列，子件在第二列
    for (var i = 0; i < inv.length; i++) {
      var r = inv[i];
      var c0 = r.子件 != null ? String(r.子件).trim() : '';
      var c1 = r.仓库 != null ? String(r.仓库).trim() : '';
      if (!c0 && !c1) continue;
      // 检测：如果"子件"列像仓库名（含字母/横线）且"仓库"列像数字编号 → 列序颠倒
      var c0looksLikeWh = /[a-zA-Z\-]/.test(c0);
      var c1looksLikeChild = /^\d+$/.test(c1);
      if (c0looksLikeWh && c1looksLikeChild) { invSwap = true; }
      break;
    }
    if (invSwap) {
      warnings.push('检测到库存表列序为「仓库|子件|库存」，已自动适配。');
    }

    var pool = new Map();
    inv.forEach(function (r) {
      var w, c;
      if (invSwap) {
        w = whOf(r.子件); c = String(r.仓库 == null ? '' : r.仓库).trim();
      } else {
        w = whOf(r.仓库); c = String(r.子件 == null ? '' : r.子件).trim();
      }
      if (!c) return;
      var pk = w + '||' + c;
      var qty = num(r.库存, 0);
      if (pool.has(pk)) {
        pool.get(pk).qty += qty; // ★ 累加（同仓同子件多条库存合并）
      } else {
        pool.set(pk, { child: c, warehouse: w, qty: qty });
      }
    });

    // 3) 收集所有仓库
    var allWarehouses = new Set();
    pool.forEach(function (v) { allWarehouses.add(v.warehouse); });
    demand.forEach(function (r) { allWarehouses.add(whOf(r.仓库)); });

    // 4) 收集需求信息
    var demandInfo = new Map(); // parent → { salesByWh: Map<wh, sales>, demandByWh: Map<wh, totalDemand>, demandByWhCat: Map<wh+'||'+cat, demand> }
    demand.forEach(function (r) {
      var p = String(r.父件 == null ? '' : r.父件).trim();
      var w = whOf(r.仓库);
      var cat = normalizeCat(r.关系类别) || 'single';
      if (!p) return;
      if (!bomByParent.has(p)) {
        warnings.push('需求中的父件『' + p + '』在 BOM 关系里不存在，跳过');
        return;
      }
      if (!demandInfo.has(p)) demandInfo.set(p, { salesByWh: new Map(), demandByWh: new Map(), demandByWhCat: new Map() });
      var info = demandInfo.get(p);
      var s = num(r.销量, 0);
      if (s > 0) info.salesByWh.set(w, s); // 销量按仓库存储（不再取全仓最大值）
      var d = num(r.需求, 0);
      if (d > 0) {
        info.demandByWh.set(w, (info.demandByWh.get(w) || 0) + d); // 总需求累加
        info.demandByWhCat.set(w + '||' + cat, (info.demandByWhCat.get(w + '||' + cat) || 0) + d);
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // 5) 实例发现：为每个 (仓库, 父件, 关系类别) 创建计算实例
    //    规则⑤ 作废：实例仅由需求行驱动（不依赖库存做无需求自动发现）。
    //    ★ 同一(父件,仓库)若需求表有多行(不同类别) → 按类别分别驱动，各自独立封顶。
    //    ★ 同一(父件,仓库)若需求表只有一行 → 作为总需求分配给所有 BOM 组（保持旧逻辑）。
    // ═══════════════════════════════════════════════════════════════
    var instances = [];

    bomByParent.forEach(function (pobj, parent) {
      var info = demandInfo.get(parent) || { salesByWh: new Map(), demandByWh: new Map(), demandByWhCat: new Map() };
      var hasSingleGroup = pobj.groups.has('single');

      // 仅从需求行驱动（无需求 → 不组装）
      info.demandByWh.forEach(function (totalDemand, wh) {
        // 判断该(父件,仓库)是否有多个类别的需求行
        var catsInDemand = [];
        info.demandByWhCat.forEach(function (d, key) {
          if (key.startsWith(wh + '||')) catsInDemand.push(key.split('||')[1]);
        });
        var hasMultiCat = catsInDemand.length > 1;

        pobj.groups.forEach(function (group, cat) {
          if (group.slots.size === 0) return;

          var demandQty;
          if (hasMultiCat) {
            // 多行需求：按类别分别匹配，无需求则跳过
            demandQty = info.demandByWhCat.get(wh + '||' + cat) || 0;
            if (demandQty <= 0) return;
          } else {
            // 单行需求：作为总需求分配给所有 BOM 组
            demandQty = totalDemand;
          }

          // 显示用需求：多行时各自显示；单行时若同时存在单一+供应商组 → 供应商组显示 0
          var displayDemand = (hasSingleGroup && cat === 'supplier' && !hasMultiCat) ? 0 : demandQty;
          var whSales = info.salesByWh.has(wh) ? info.salesByWh.get(wh) : 0; // ★ 按仓库取销量
          instances.push({
            parent: parent,
            warehouse: wh,
            category: cat,
            sales: whSales,           // 按仓库各自的销量
            demandQty: displayDemand,
            totalDemand: demandQty,   // 封顶用
            group: group,
            independentCap: hasMultiCat // 多行需求时各组独立封顶
          });
        });
      });
    });

    // ═══════════════════════════════════════════════════════════════
    // 6) 按仓库分组，分阶段消耗
    //    ★ 规则① 改造（2026-09-21）：共享子件按「子件销量占比」比例分配库存。
    //      子件销量 = 父件日均 × 配比；销量占比 = 子件销量 / 同仓该子件总销量；
    //      分配库存 = 总库存 × 销量占比（向下取整到 ratio 倍数），余量按占比高优先补给。
    //    ★ 实现：两阶段法
    //      Phase 1: 计算每个实例的理论组装量（只读 pool，不扣减）
    //      Phase 2: 对每个共享子件，在批次内所有实例中按比例分配库存（扣减 pool）
    //      Phase 3: 根据共享子件实际分配量，计算每个实例的实际组装量
    //      Phase 4: 扣减非共享子件库存 + 输出消耗明细与结果
    //    ★ 关系类别批次：供应商组先处理，单一组后处理（保持隔离）
    // ═══════════════════════════════════════════════════════════════
    var byWh = new Map();
    instances.forEach(function (inst) {
      if (!byWh.has(inst.warehouse)) byWh.set(inst.warehouse, []);
      byWh.get(inst.warehouse).push(inst);
    });

    var results = [];
    var consumed = [];

    byWh.forEach(function (ilist, wh) {
      // 按关系类别分批次
      var supplierInsts = [];
      var singleInsts = [];
      ilist.forEach(function (inst) {
        if (inst.category === 'supplier') supplierInsts.push(inst);
        else singleInsts.push(inst);
      });

      // 记录供应商组已组装量
      var supplierAssembled = new Map();

      // 处理一个关系类别批次
      function processBatch(insts, isSupplierBatch) {
        if (insts.length === 0) return;

        // ── Phase 1: 计算理论组装量（只读 pool，不扣减） ──
        var theories = insts.map(function (inst) {
          var slotCaps = [];
          var limiting = null;
          inst.group.slots.forEach(function (slot, slotKey) {
            var eff = 0;
            var childDetail = [];
            var isGroup = slot.children.length > 1 || /^G:/.test(slotKey);
            slot.children.forEach(function (c) {
              var pk2 = wh + '||' + c.child;
              var qty = pool.has(pk2) ? pool.get(pk2).qty : 0;
              // ★ 替换组：各子件按「自身库存÷自身配比」分别折算套数后相加（规则②）
              //   不能先把库存相加再除——不同料的碎片无法互相凑成一套
              eff += isGroup ? Math.floor(qty / c.ratio) : (qty / c.ratio);
              childDetail.push({ child: c.child, inv: qty, conv: 1, isPrimary: c.isPrimary, repl: c.repl });
            });
            var cap = Math.floor(eff + 1e-9);
            if (cap < 0) cap = 0;
            slotCaps.push({ slotKey: slotKey, cap: cap, ratio: slot.ratio, children: childDetail });
            if (limiting == null || cap < limiting.cap) limiting = slotCaps[slotCaps.length - 1];
          });

          var totalDemand = inst.totalDemand;
          var effectiveDemand = totalDemand;
          if (!isSupplierBatch && supplierAssembled.has(inst.parent) && !inst.independentCap) {
            effectiveDemand = Math.max(0, totalDemand - supplierAssembled.get(inst.parent));
          }
          var k_theory = limiting ? limiting.cap : 0;
          if (capByDemand) k_theory = Math.min(k_theory, effectiveDemand);
          if (k_theory < 0) k_theory = 0;

          return {
            inst: inst,
            k_theory: k_theory,
            k_actual: 0,
            slotCaps: slotCaps,
            limiting: limiting || { cap: 0 },
            allocated: new Map() // child → qty（共享子件实际分配量）
          };
        });

        // ── Phase 2: 共享子件按「子件销量占比」比例分配库存 ──
        //    同一共享子件在同仓下：
        //      子件销量 = 父件日均 × 配比
        //      销量占比 = 子件销量 / 同仓该子件总销量
        //      分配库存 = 总库存 × 销量占比（向下取整到 ratio 倍数）
        //      余量按 childSales 降序依次补给（占比高的优先）
        //    ★ 仅 k_theory > 0 的实例参与分配（不齐套则释放共享料）
        var shareNeeds = [];
        theories.forEach(function (t, idx) {
          if (t.k_theory <= 0) return; // 不齐套 → 不参与共享子件分配
          t.inst.group.slots.forEach(function (slot) {
            slot.children.forEach(function (c) {
              if (isShared(c.child)) {
                shareNeeds.push({
                  tIdx: idx,
                  child: c.child,
                  ratio: c.ratio,
                  childSales: t.inst.sales * c.ratio
                });
              }
            });
          });
        });

        var shareByChild = new Map();
        shareNeeds.forEach(function (sn) {
          if (!shareByChild.has(sn.child)) shareByChild.set(sn.child, []);
          shareByChild.get(sn.child).push(sn);
        });

        shareByChild.forEach(function (needs, child) {
          var pk2 = wh + '||' + child;
          var p = pool.get(pk2);
          var totalInv = p ? p.qty : 0;
          if (totalInv <= 0) return;

          // 按 childSales 降序排序（销量占比高的优先）
          needs.sort(function (a, b) { return b.childSales - a.childSales; });

          // 依次分配：高销量的实例优先拿够所需库存
          needs.forEach(function (n) {
            var t = theories[n.tIdx];
            var effectiveDemand = t.inst.totalDemand;
            if (!isSupplierBatch && supplierAssembled.has(t.inst.parent)) {
              effectiveDemand = Math.max(0, t.inst.totalDemand - supplierAssembled.get(t.inst.parent));
            }
            // 该实例对此共享子件的实际所需库存
            // ★ 只拿 min(需求, k_theory) 套所需的量，避免多拿造成浪费
            var needQty = Math.min(effectiveDemand, t.k_theory) * n.ratio;
            // 取 min(所需, 剩余库存)，向下取整到 ratio 倍数
            var take = Math.min(needQty, totalInv);
            take = Math.floor(take / n.ratio) * n.ratio;
            if (take > 0) {
              if (p) p.qty -= take;
              totalInv -= take;
              t.allocated.set(n.child, (t.allocated.get(n.child) || 0) + take);
            }
          });
        });

        // ── Phase 3: 计算实际组装量 ──
        //    共享子件若 allocated 不足（含未分配=0），实际组装量受限于该子件
        //    ★ 替换组内多子件共享时，合并 allocated 计算（替代件+主件=整体slot容量）
        theories.forEach(function (t) {
          var k_actual = t.k_theory;
          t.inst.group.slots.forEach(function (slot) {
            var hasShared = slot.children.some(function (c) { return isShared(c.child); });
            if (!hasShared) return;
            if (slot.children.length > 1) {
              // 替换组：各子件分别折算套数后相加（不能先把库存相加再除）
              // ★ 共享子件取 allocated；非共享子件取 pool 库存（尚未扣减）
              var maxSets = 0;
              slot.children.forEach(function (c) {
                var avail;
                if (isShared(c.child)) {
                  avail = t.allocated.get(c.child) || 0;
                } else {
                  var pAlt = pool.get(wh + '||' + c.child);
                  avail = pAlt ? pAlt.qty : 0;
                }
                maxSets += c.ratio > 0 ? Math.floor(avail / c.ratio) : 0;
              });
              if (maxSets < k_actual) k_actual = maxSets;
            } else {
              var c = slot.children[0];
              var allocated = t.allocated.get(c.child) || 0;
              var maxSets = c.ratio > 0 ? Math.floor(allocated / c.ratio) : 0;
              if (maxSets < k_actual) k_actual = maxSets;
            }
          });
          t.k_actual = k_actual;
        });

        // ── Phase 3.5: k_actual 被瓶颈限制后，释放多余共享库存给下一个能利用的父件 ──
        //    逻辑：若某实例因非共享子件瓶颈导致 k_actual < 分到的共享子件套数，
        //          则该共享子件多余部分（allocated - k_actual*ratio）回收，
        //          按 childSales 降序分配给 k_actual > 0 且还能继续组装的实例。
        (function () {
          var releasedByChild = new Map(); // child → 释放的库存量

          // 1) 回收：k_actual 被瓶颈限制的实例，释放多余共享库存
          theories.forEach(function (t) {
            t.inst.group.slots.forEach(function (slot) {
              slot.children.forEach(function (c) {
                if (!isShared(c.child)) return;
                var allocated = t.allocated.get(c.child) || 0;
                var need = t.k_actual * c.ratio; // 实际需要
                if (allocated > need) {
                  var excess = allocated - need;
                  t.allocated.set(c.child, need);
                  releasedByChild.set(c.child, (releasedByChild.get(c.child) || 0) + excess);
                  var pk2 = wh + '||' + c.child;
                  var p = pool.get(pk2);
                  if (p) p.qty += excess;
                }
              });
            });
          });

          // 2) 重新分配给 k_actual > 0 且还能继续组装的实例
          releasedByChild.forEach(function (releasedQty, child) {
            if (releasedQty <= 0) return;

            var needy = [];
            theories.forEach(function (t, idx) {
              var inst = t.inst;
              var totalDemand = inst.totalDemand;
              var effectiveDemand = totalDemand;
              if (!isSupplierBatch && supplierAssembled.has(inst.parent)) {
                effectiveDemand = Math.max(0, totalDemand - supplierAssembled.get(inst.parent));
              }
              if (t.k_theory <= 0) return; // Phase1 就不齐套（独占子件瓶颈），不接收
              if (t.k_actual >= effectiveDemand) return; // 已满足

              var needRatio = 0;
              t.inst.group.slots.forEach(function (slot) {
                slot.children.forEach(function (c) {
                  if (c.child === child) needRatio = c.ratio;
                });
              });
              if (needRatio <= 0) return;

              needy.push({
                tIdx: idx,
                childSales: t.inst.sales * needRatio,
                ratio: needRatio,
                needSets: effectiveDemand - t.k_actual // 还能再组装多少套
              });
            });

            if (needy.length === 0) return;
            needy.sort(function (a, b) { return b.childSales - a.childSales; });

            var pk2 = wh + '||' + child;
            var p = pool.get(pk2);
            var remaining = releasedQty;
            needy.forEach(function (n) {
              if (remaining <= 0) return;
              var t = theories[n.tIdx];
              var want = n.needSets * n.ratio;
              var take = Math.min(want, remaining);
              take = Math.floor(take / n.ratio) * n.ratio;
              if (take > 0) {
                t.allocated.set(child, (t.allocated.get(child) || 0) + take);
                remaining -= take;
                if (p) p.qty -= take;
              }
            });
          });

          // 3) 重新计算 k_actual（替换组合并计算）
          theories.forEach(function (t) {
            var k_actual = t.k_theory;
            t.inst.group.slots.forEach(function (slot) {
              var hasShared = slot.children.some(function (c) { return isShared(c.child); });
              if (!hasShared) return;
              if (slot.children.length > 1) {
                // 共享子件取 allocated；非共享子件取 pool 库存（各子件分别折算再相加）
                var maxSets = 0;
                slot.children.forEach(function (c) {
                  var avail;
                  if (isShared(c.child)) {
                    avail = t.allocated.get(c.child) || 0;
                  } else {
                    var pAlt = pool.get(wh + '||' + c.child);
                    avail = pAlt ? pAlt.qty : 0;
                  }
                  maxSets += c.ratio > 0 ? Math.floor(avail / c.ratio) : 0;
                });
                if (maxSets < k_actual) k_actual = maxSets;
              } else {
                var c = slot.children[0];
                var allocated = t.allocated.get(c.child) || 0;
                var maxSets = c.ratio > 0 ? Math.floor(allocated / c.ratio) : 0;
                if (maxSets < k_actual) k_actual = maxSets;
              }
            });
            t.k_actual = k_actual;
          });
        })();

        // ── Phase 4: 扣减非共享子件库存 + 输出消耗明细 + 结果 ──
        theories.forEach(function (t) {
          var k = t.k_actual;
          var inst = t.inst;
          var isSupplier = (inst.category === 'supplier');
          var categoryLabel = catLabel(inst.category);
          var demandQty = inst.demandQty;
          var totalDemand = inst.totalDemand;

          if (k > 0 && isSupplier) {
            supplierAssembled.set(inst.parent, (supplierAssembled.get(inst.parent) || 0) + k);
          }

          // ★ 三批次划分：每个批次都是一套完整 BOM 方案，保证「同一关系标签下不混用替代件/主件」
          //   关系1 = 纯替代件批次：所有替换组都用替代件 → 套数 = 各替代件容量的【最小值】rel1Sets
          //   关系3 = 混用批次：部分组替代件仍有剩余继续用、部分组已耗尽转主件
          //   关系2 = 纯主件批次：所有替换组替代件耗尽，全用主件
          var rel1Sets = -1;      // 各替换组替代件容量最小值（含 0：某组替代件为 0 时关系1 即为 0）
          var altMaxSets = 0;     // 批次3 的右边界（见下方说明）
          var hasGroupSlot = false;
          var caps = [];
          inst.group.slots.forEach(function (slot, slotKey) {
            if (!/^G:/.test(slotKey)) return;
            hasGroupSlot = true;
            // ★ 本替换组的替代件总容量 = 各替代件可凑套数【之和】（多替代件场景必须按组聚合）
            var groupCap = 0;
            slot.children.forEach(function (c) {
              if (c.isPrimary) return;
              var pk2 = wh + '||' + c.child;
              var avail;
              if (isShared(c.child)) {
                avail = t.allocated.get(c.child) || 0;
              } else {
                var p = pool.get(pk2);
                avail = p ? p.qty : 0;
              }
              groupCap += c.ratio > 0 ? Math.floor(avail / c.ratio) : 0;
            });
            caps.push(groupCap);
          });
          if (caps.length) {
            rel1Sets = Math.min.apply(null, caps);
            // ★ 批次3 右边界 = 「容量 > rel1Sets」的各组中【最小】的容量。
            //   这样批次3 内每个替换组要么整批用替代件、要么整批用主件 —— 不会出现「同一组内替代件+主件混用」。
            //   （若取最大容量，容量居中的组会在批次3 中替代件不够、被迫部分转主件，形成组内混用）
            var candCaps = caps.filter(function (x) { return x > rel1Sets; });
            altMaxSets = candCaps.length ? Math.min.apply(null, candCaps) : rel1Sets;
          }
          if (!hasGroupSlot) { rel1Sets = k; altMaxSets = k; }
          if (rel1Sets < 0) rel1Sets = 0;
          if (rel1Sets > k) rel1Sets = k;
          if (altMaxSets > k) altMaxSets = k;
          if (altMaxSets < rel1Sets) altMaxSets = rel1Sets;
          var sets1 = rel1Sets;                 // 关系1：纯替代件
          var sets3 = altMaxSets - rel1Sets;    // 关系3：混用
          var sets2 = k - altMaxSets;           // 关系2：纯主件
          if (sets2 < 0) sets2 = 0;
          var rel2Sets = sets2;

          // 扣减库存 + 输出消耗明细
          inst.group.slots.forEach(function (slot, slotKey) {
            if (/^G:/.test(slotKey)) {
              // ── 替换组：按替代件库存分配关系1/关系2 ──
              var alts = [], pri = null;
              slot.children.forEach(function(c) {
                if (c.isPrimary) pri = c;
                else alts.push(c);
              });
              if (alts.length === 0) return;

              var priRatio = pri ? pri.ratio : (alts[0] ? alts[0].ratio : 1);

              // 收集每个替代件的可用库存
              var altInfos = alts.map(function(c) {
                var avail = 0;
                if (isShared(c.child)) {
                  avail = t.allocated.get(c.child) || 0;
                } else {
                  var pAlt = pool.get(wh + '||' + c.child);
                  avail = pAlt ? pAlt.qty : 0;
                }
                return { child: c.child, ratio: c.ratio, avail: avail, shared: isShared(c.child) };
              });

              // 三批次套数（sets1 / sets3 / sets2）由上方统一计算，此处沿用

              // 辅助：从替代件中扣减指定套数，返回各替代件实际消耗
              function consumeAlts(needSets) {
                var remaining = needSets;
                var used = [];
                altInfos.forEach(function(info) {
                  if (remaining <= 0) return;
                  var needQty = remaining * info.ratio;
                  var take = Math.min(info.avail, needQty);
                  // ★ 只取能凑成完整套数的量：不足一套的碎片不使用、不展示、不扣库存
                  take = Math.floor(take / info.ratio) * info.ratio;
                  if (take > 0) {
                    var coverSets = Math.floor(take / info.ratio);
                    used.push({ child: info.child, ratio: info.ratio, used: take, setsCovered: coverSets, shared: info.shared });
                    info.avail -= take;
                    remaining -= coverSets;
                  }
                });
                return used;
              }

              // 本组替代件总容量（各替代件可凑套数之和）
              var altCapSets = 0;
              altInfos.forEach(function(info) { altCapSets += Math.floor(info.avail / info.ratio); });

              // ── 批次1（关系1）：纯替代件，套数 = rel1Sets
              //    （rel1Sets 取的是各替换组容量的最小值，因此该批次所有组替代件都够用，不需要主件）
              var altUsed1 = consumeAlts(sets1);

              // ── 批次3（关系3）：混用批次。本组替代件在批次1 消耗后的剩余继续用，不够转主件
              var altRemain3 = Math.max(0, Math.min(altCapSets - rel1Sets, sets3));
              var altUsed3 = consumeAlts(altRemain3);
              var altSets3 = altUsed3.reduce(function(s, u) { return s + u.setsCovered; }, 0);
              var priUsed3 = Math.max(0, sets3 - altSets3) * priRatio;

              // ── 批次2（关系2）：先用本组【自己的】替代件，替代件不够的部分再由主件补足
              //   ★ 2026-10-27 修正：原实现硬编码 priUsed2 = sets2 * priRatio（纯主件），
              //     隐含假设「批次2 时所有组替代件都已耗尽」。但 altMaxSets 只取「容量>rel1 的组中最小值」，
              //     容量远大于该最小值的组（如 G:1717751 容量1944）在批次2 里替代件仍有大量剩余，
              //     却被强制走主件；而主件库存为 0 时 consumePrimary 裁剪为 0 → 整组在明细中消失。
              //   现按用户口径：每组先用自己替代件，不够再主件补足（与批次3 一致）。
              var altUsed2 = consumeAlts(sets2);
              var altSets2 = altUsed2.reduce(function(s, u) { return s + u.setsCovered; }, 0);
              var priUsed2 = Math.max(0, sets2 - altSets2) * priRatio;

              // 主件扣减：共享主件从 allocated 扣（Phase 2 已扣过 pool）；非共享从 pool 扣
              // ★ 按实际可用量裁剪：不足的套数不扣、不展示，避免库存被扣成负数
              function consumePrimary(qty) {
                if (qty <= 0 || !pri) return 0;
                var availPri = isShared(pri.child)
                  ? (t.allocated.get(pri.child) || 0)
                  : ((pool.get(wh + '||' + pri.child) || { qty: 0 }).qty);
                var take = Math.floor(Math.min(availPri, qty) / priRatio) * priRatio;
                if (take <= 0) return 0;
                if (isShared(pri.child)) {
                  t.allocated.set(pri.child, availPri - take);
                } else {
                  var pPri2 = pool.get(wh + '||' + pri.child);
                  if (pPri2) pPri2.qty -= take;
                }
                return take;
              }

              // 批次1 替代件（关系1）
              altUsed1.forEach(function(u) {
                if (u.used > 0) {
                  consumed.push({
                    warehouse: wh, parent: inst.parent, sets: k,
                    setsCovered: u.setsCovered,
                    slotKey: slotKey, child: u.child,
                    used: u.used, ratio: u.ratio,
                    isPrimary: false, conv: 1,
                    relation: 1, category: categoryLabel, isSupplier: isSupplier
                  });
                }
              });

              // 批次3 替代件（关系3）
              altUsed3.forEach(function(u) {
                if (u.used > 0) {
                  consumed.push({
                    warehouse: wh, parent: inst.parent, sets: k,
                    setsCovered: u.setsCovered,
                    slotKey: slotKey, child: u.child,
                    used: u.used, ratio: u.ratio,
                    isPrimary: false, conv: 1,
                    relation: 3, category: categoryLabel, isSupplier: isSupplier
                  });
                }
              });

              // 批次2 替代件（关系2）—— 先用本组自己的替代件
              altUsed2.forEach(function(u) {
                if (u.used > 0) {
                  consumed.push({
                    warehouse: wh, parent: inst.parent, sets: k,
                    setsCovered: u.setsCovered,
                    slotKey: slotKey, child: u.child,
                    used: u.used, ratio: u.ratio,
                    isPrimary: false, conv: 1,
                    relation: 2, category: categoryLabel, isSupplier: isSupplier
                  });
                }
              });

              // 批次3 主件补足（关系3）——按实际可用量裁剪后输出
              if (priUsed3 > 0 && pri) {
                var _p3 = consumePrimary(priUsed3);
                if (_p3 > 0) {
                  consumed.push({
                    warehouse: wh, parent: inst.parent, sets: k,
                    setsCovered: Math.floor(_p3 / priRatio),
                    slotKey: slotKey, child: pri.child,
                    used: _p3, ratio: priRatio,
                    isPrimary: true, conv: 1,
                    relation: 3, category: categoryLabel, isSupplier: isSupplier
                  });
                }
              }

              // 批次2 主件（关系2）——按实际可用量裁剪后输出
              if (priUsed2 > 0 && pri) {
                var _p2 = consumePrimary(priUsed2);
                if (_p2 > 0) {
                  consumed.push({
                    warehouse: wh, parent: inst.parent, sets: k,
                    setsCovered: Math.floor(_p2 / priRatio),
                    slotKey: slotKey, child: pri.child,
                    used: _p2, ratio: priRatio,
                    isPrimary: true, conv: 1,
                    relation: 2, category: categoryLabel, isSupplier: isSupplier
                  });
                }
              }

              // 扣减替代件pool / allocated（★ 含批次2 的替代件）
              altUsed1.concat(altUsed3).concat(altUsed2).forEach(function(u) {
                if (!u.shared) {
                  var pAlt = pool.get(wh + '||' + u.child);
                  if (pAlt) pAlt.qty -= u.used;
                } else {
                  var allocated = t.allocated.get(u.child) || 0;
                  t.allocated.set(u.child, allocated - u.used);
                }
              });

              return;
            }

            // ── 普通 slot 处理 ──
            var isGroupSlot = slot.children.length > 1 || /^G:/.test(slotKey);
            var ordered = slot.children.slice().sort(function (a, b) {
              return (a.isAlt ? 0 : 1) - (b.isAlt ? 0 : 1);
            });
            var remainingSets = k;
            ordered.forEach(function (c) {
              var pk2 = wh + '||' + c.child;
              var p = pool.get(pk2);
              var coverSets, take;

              if (isShared(c.child)) {
                // 共享子件：Phase 2 已扣减 pool，此处从 allocated 中取量输出明细
                var allocated = t.allocated.get(c.child) || 0;
                coverSets = c.ratio > 0 ? Math.min(remainingSets, Math.floor(allocated / c.ratio)) : 0;
                take = coverSets * c.ratio;
                if (take > 0) {
                  t.allocated.set(c.child, allocated - take);
                  remainingSets -= coverSets;
                }
              } else {
                // 非共享子件：从 pool 扣减
                var avail = p ? p.qty : 0;
                var capSets = c.ratio > 0 ? Math.floor(avail / c.ratio) : 0;
                coverSets = Math.min(remainingSets, capSets);
                take = coverSets * c.ratio;
                if (take > 0) {
                  if (p) p.qty -= take;
                  remainingSets -= coverSets;
                }
              }

              if (take <= 0) return;

              // 三批次切分：关系1（纯替代件套数）→ 关系3（混用套数）→ 关系2（纯主件套数）
              var r1 = Math.min(coverSets, sets1);
              var rest = coverSets - r1;
              var r3 = Math.min(rest, sets3);
              var r2 = rest - r3;
              if (r1 > 0) {
                consumed.push({
                  warehouse: wh, parent: inst.parent, sets: k, setsCovered: r1,
                  slotKey: slotKey, child: c.child, used: r1 * c.ratio, ratio: c.ratio,
                  isPrimary: c.isPrimary, conv: 1, relation: 1,
                  category: categoryLabel, isSupplier: isSupplier
                });
              }
              if (r3 > 0) {
                consumed.push({
                  warehouse: wh, parent: inst.parent, sets: k, setsCovered: r3,
                  slotKey: slotKey, child: c.child, used: r3 * c.ratio, ratio: c.ratio,
                  isPrimary: c.isPrimary, conv: 1, relation: 3,
                  category: categoryLabel, isSupplier: isSupplier
                });
              }
              if (r2 > 0) {
                consumed.push({
                  warehouse: wh, parent: inst.parent, sets: k, setsCovered: r2,
                  slotKey: slotKey, child: c.child, used: r2 * c.ratio, ratio: c.ratio,
                  isPrimary: c.isPrimary, conv: 1, relation: 2,
                  category: categoryLabel, isSupplier: isSupplier
                });
              }
            });
          });

          // ★ 结算本实例共享子件 allocated，保证最终「剩余库存 + 消耗 = 初始库存」
          //   qty > 0：分配了但未用完 → 归还库存池
          //   qty < 0：实际消耗超过分配量 → 从库存池补扣差额
          t.allocated.forEach(function (qty, child) {
            if (qty !== 0) {
              var pRet = pool.get(wh + '||' + child);
              if (pRet) pRet.qty += qty;
            }
            t.allocated.set(child, 0);
          });

          // bottleneck text
          var effectiveDemand = totalDemand;
          if (!isSupplier && supplierAssembled.has(inst.parent) && !inst.independentCap) {
            effectiveDemand = Math.max(0, totalDemand - supplierAssembled.get(inst.parent));
          }

          var bottleneckText = '';
          if (isSupplier) {
            bottleneckText = k > 0
              ? '供应商子件·组装' + k + '套（按需求封顶，需求' + totalDemand + '）'
              : '供应商子件·库存不足';
          } else if (demandQty <= 0) {
            bottleneckText = '无需求';
          } else if (k < demandQty) {
            var lim = t.limiting;
            var limChild = lim && lim.children && lim.children.length ? lim.children[0].child : (lim ? lim.slotKey : '');
            bottleneckText = '瓶颈=' + limChild + '(可组' + lim.cap + '套';
            if (effectiveDemand < demandQty) {
              bottleneckText += ', 供应商已组' + (supplierAssembled.get(inst.parent) || 0) + '套后有效需求=' + effectiveDemand;
            }
            bottleneckText += ' < 需求' + demandQty + ')';
            if (limChild && isShared(limChild)) {
              bottleneckText += '；该子件为共享料，可能被同仓更高销量父件先行消耗(规则①+③)';
            }
          } else {
            bottleneckText = '齐套满足';
          }

          results.push({
            warehouse: wh,
            parent: inst.parent,
            sales: inst.sales,
            demand: demandQty,
            assembled: k,
            shortfall: Math.max(0, demandQty - k),
            bottleneck: bottleneckText,
            category: categoryLabel,
            isSupplier: isSupplier,
            slots: t.slotCaps
          });
        });
      }

      // 供应商组先处理，然后单一组
      processBatch(supplierInsts, true);
      processBatch(singleInsts, false);
    });

    // 消耗汇总（按 仓库||子件 聚合）
    var consMap = new Map();
    consumed.forEach(function (c) {
      var key = c.warehouse + '||' + c.child;
      if (!consMap.has(key)) consMap.set(key, { warehouse: c.warehouse, child: c.child, used: 0 });
      consMap.get(key).used += c.used;
    });
    var consumption = Array.from(consMap.values()).map(function (c) {
      var p = pool.get(c.warehouse + '||' + c.child);
      c.remaining = p ? p.qty : 0;
      return c;
    });

    // 消耗明细排序：整表按「关系」降序（关系3 → 关系2 → 关系1），同关系内保持原有顺序（稳定排序）。
    (function () {
      var idx = new Map();
      consumed.forEach(function (d, i) { idx.set(d, i); });
      consumed.sort(function (a, b) {
        return (b.relation || 0) - (a.relation || 0) || idx.get(a) - idx.get(b);
      });
    })();

    return {
      results: results,
      consumption: consumption,
      consumptionDetail: consumed,
      warnings: warnings,
      totals: {
        demand: results.reduce(function (s, r) { return s + r.demand; }, 0),
        assembled: results.reduce(function (s, r) { return s + r.assembled; }, 0)
      }
    };
  }

  var API = { compute: compute, parseRemarkRatio: parseRemarkRatio, normalize: normalize };
  global.AssemblyEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
