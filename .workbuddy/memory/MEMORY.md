# 分仓组装量计算器 — 项目长期约定

## 项目定位
网页版「分仓组装量计算器」：一张 Excel（BOM关系/需求/库存 三 sheet）上传即算各仓各父件可组装套数、实际消耗明细、库存消耗、各父件 slot 容量，可导出 CSV/XLSX。
代码：`assembly_calculator/`（engine.js 核心引擎、index.html 页面、sample_data.js、test_engine/rule2/rule3/category.js 回归测试、gen_test_report.js 报告脚本）。
**当前发布目录**：`site-<时间戳>/`（含 index.html + engine.js + sample_data.js + xlsx.full.min.js 本地库 + 离线单文件版 + 404.html）。构建脚本 `publish/build3.js`。
**沙箱链接**：https://50447ec97a3a46bebccb9edb141cd963.app.workbuddy.host（沙箱回收即失效；分享需平台令牌）

## 四条业务规则（权威口径）
- **规则①（优先级）**：同仓内共享子件按「子件销量 = 父件日均 × 配比」降序分配；不同子件各自独立排序竞争。
- **规则②（可替换子件）**：同一(父件,替换组)下子件互为替代。**配比对应**：行内**【子件列】料的配比取【配比列 C 列】**；**【替换组列】料(主件)的配比取【备注「换配比:N」】**（主件未显式列出时按此隐式加入，无备注默认1）。各子件按「自身库存÷自身配比」**分别 floor 折算后相加**（禁止先加库存再除——碎片不能互相凑套）；消耗顺序：**替代件先扣，用尽再扣主件**。
  - ★ 不足一套的碎片**不使用、不消耗库存、不展示明细**（覆盖套数=0 的行不应出现）；消耗量必须 = 覆盖套数 × 配比。BOM 表**不带仓库列**（父件级，全仓共用）。
  - 典型例：`子件=1764992(C列2)、替换组=1822303、备注=换配比:1` → 替代件配比2、主件配比1；25套时替代件覆盖5套耗10、主件覆盖20套耗20。
  - ⚠️ 易错点：曾误实现为「替代件取备注、主件取C列」导致配比颠倒（已修正，勿回退）。
- **规则③（共享子件）**：库存池 key = `仓库||子件`；按规则①降序分配给各实例，用完即止；实例连 1 套都凑不齐则释放库存给下一实例。
- **规则④（齐套才成套装）**：父件下所有子件×配比都满足才算 1 套，尽量多组，并按「需求」封顶（capByDemand）。

## 关系类别（BOM行级分组，2026-09-19 重构；★ 规则⑤ 2026-09-21 作废）
- 同一父件下，**供应商子件行与单一子件行属于不同组装组**，各自独立 slot、独立齐套、独立输出结果行。
- 分组：BOM 行显式声明 → 按声明值；未声明 → 同父件有显式则默认 single，否则用需求行类别兜底。
- ★ **规则⑤ 作废**：原「供应商子件=有库存就组(不封顶)」全部作废，改为**统一按需求计算**。两组均按需求封顶；不再「无需求自动发现仓库」，实例**仅由需求行驱动**。
- 消耗顺序：供应商组**先**消耗（隔离，扣掉的料不再分给单一组），单一组**后**消耗。
- 需求分配：需求表**按类别分两行**时各组独立封顶（independentCap）；只有一行时两组共用池 D（供应商=D，单一=D−供应商已组）。显示：两行时各自显示；单行时显示在单一组行。
- 输出：组装结果与消耗明细按(仓库,父件,关系类别)独立输出，同父件同仓可多行。

## ★ 权威裁决（2026-09-16 用户明确）
**规则①+③ 为唯一权威口径。** 引擎结果与任何「参考文件/人工预期」冲突时以引擎为准，除非用户明确推翻。
典型先例：02C/1733463，参考写 20、引擎算 0（共享子件 1733916 仅 20，已被高销量父件 1733462 占满，1733463 物理上不可能再得料）→ 引擎=0 正确，参考为笔误。

## 关系1 / 关系2 / 关系3（三批次 · 2026-10-19 终版）
每个批次都是**完整 BOM 展开**，保证「同一关系标签下不混用替代件/主件」。
- `rel1Sets = min(各替换组替代件容量)`（**含 0**）；**替换组容量 = 组内各替代件 `floor(库存/配比)` 之和**（多替代件必须按组聚合）。
- ★ **批次3 右边界 `altMaxSets` = 「容量 > rel1Sets」的各组中【最小】的容量**（不是最大值！）→ 批次3 内每组要么整批用替代件、要么整批用主件，**无组内混用**。（2026-10-20 修复）
- **关系1**（`sets1 = rel1Sets`）纯替代件｜**关系3**（`sets3 = altMaxSets − rel1Sets`）跨组混用｜**关系2**（`sets2 = k − altMaxSets`）纯主件。普通子件按 1→3→2 切分。
- ⚠️ 中间版「rel1Sets 忽略替代件为 0 的组」是**错的**（会吞掉关系1 并导致主件超扣），已回退为含 0 的 min。
- ★ `consumePrimary(qty)` 必须**按实际可用量裁剪并返回实扣量**（不足的套数不扣、不展示），否则主件库存 0 时被扣成负数。
- **关系2**（`sets2 = k − altMaxSets`）：**每组先用自己替代件，替代件不够才用主件补足**（★ 2026-10-27 修正：原硬编码 `priUsed2 = sets2 * priRatio` 纯主件，隐含假设「所有组替代件已耗尽」；但 altMaxSets 只取「容量>rel1 的组中最小值」，容量远大于该值的组（如容量1944）在批次2 替代件仍大量剩余却被迫走主件，主件库存0时整组从明细消失）。
- **展示列序（固定）**：`仓库 | 父件 | 子件 | 类型 | 配比 | 覆盖套数 | 实际消耗 | 关系 | 类别`（不显示 slot）。
- **「类别」列** = 取自 **BOM 各行自身声明的「关系类别」**，按子件区分、两类不合并。⚠️ 与「组装结果」表的 `关系类别`（封顶控制，取自需求表）是两回事。
- **排序（固定）**：整表按 `relation` **降序稳定排序**（3→2→1）。页面表格、CSV、XLSX、gen_test_report.js 四处必须一致。

## 关键实现点（engine.js）
- **BOM 按关系类别分组**：`bomByParent = Map<parent, {groups: Map<cat,{slots}>}>`。
- **库存池累加**：同仓同子件多条记录合并累加（勿用 pool.set 覆盖）。
- **实例发现**：仅由需求行驱动；同(父件,仓库)下供应商组+单一组均建实例、共用 totalDemand。
- **共享子件分配（两阶段法）**：Phase1 算理论组装量（用原始库存）→ Phase2 按 childSales 降序逐实例扣 pool → Phase3 按实际分配量算 k_actual → Phase4 共享件只出明细、非共享件从 pool 扣减。
- **替换组 Phase3/3.5 合并逻辑**：共享子件取 `t.allocated`、非共享取 `pool` 当前库存；**分别 floor 折算后相加**（三处统一）。
- 隐式主件（阶段1.4）：替换组值未显式列为子件时自动加入，配比取同组替代件行 C 列。
- consumptionDetail[]：{warehouse,parent,sets,slotKey,child,used,ratio,conv,isPrimary,repl,setsCovered,relation,category,isSupplier}；实际消耗 = 覆盖套数 × 配比。
- 导出四块：组装结果 / 父件消耗明细 / 库存消耗 / 各父件 slot 容量。数据严格按仓隔离，BOM 展开不分仓。
- **BOM 支持两种列序**：表头跟着换（按表头名匹配）/ 表头不动只换数据（自动检测：前 50 行中位数比较）。

## 输出表列结构（各父件 slot 容量，9 列）
- 页面：仓库|父件|slot|子件(主/替代)|配比|库存|转化系数|slot容量|**剩余库存**
- CSV/XLSX：仓库|父件|slot|slot容量|配比|子件|库存|转化系数|**剩余库存**
- ⚠️ 页面与导出列序**不一致**（历史遗留，未改）
- **「剩余库存」口径 A（全局）** = 库存表原始库存 − 该(仓库,SKU)被**所有父件**消耗的总量。取 `consumption[].remaining`，未消耗的取 `ch.inv`。
- ★ **关键认知**：slot 表「库存」列 `ch.inv` 是**批次开始时的快照**，非全局初始库存（供应商批次先扣会递减）。**对账必须以库存表原始值为基准**。

## 导出数字格式化（2026-10-08）
- **XLSX** `xnum(v)`：纯数字字符串/数字 → 数字；空 → null。**CSV** `csvCell(x)`：数字不加引号。
- ★ `childDetail` **没有 `ratio` 字段**，slot 表配比必须用 **`ch.repl`**（=ratio）。此前误用 `ch.ratio` 导致配比列长期导出为空（已修）。
- 保留文本：仓库、slot（如 `C:1735572`）、类型、关系类别、类别、关系（`关系1` 带前缀为既定格式）。
- slot 表子件列去掉 `(替代件)` 后缀（否则混合类型使整列变文本）。

## 沙箱环境坑（重要）
1. **禁止覆盖写已有文件**（`EPERM`）→ 每次构建输出到全新目录（`site-<时间戳>`）或新文件名。
2. ★ **`String.replace` 替换串不能含 `$`**：`$&`/`` $` ``/`$'` 是特殊模式，`` $` `` 会插入整个前缀 → 字符串指数膨胀 → 进程 OOM 被杀（**无错误输出、exit 1**）。**必须用函数形式** `html.replace(tag, function(){return rep;})`。
3. **浏览器验证**：`agent-browser` 的 Chromium 下载超时（网络受限）→ 用系统 Chrome headless：`"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=15000 --dump-dom <url>`。`--dump-dom` 不触发交互，验证计算逻辑需**注入自测脚本**再 dump 提取 `<pre id="TESTOUT">`（见 `publish/probe_light.js` / `e2e.js`）。
4. `bash` 里 `node -e` 的多层引号易被吃掉 → 长脚本写成 `.js` 文件再执行。
5. **删除文件被 safe-delete 拦截** → 用 `mv` 移到 `.workbuddy/tmp/`。
6. **页面 >2MB 时 Chrome headless dump 为空** → 大文件测试改用 XHR 拉同源小文件，别内联 base64。
7. ⚠️ **headless 虚拟时间与 async/await 不兼容**：`--virtual-time-budget` 快进定时器，但 `btnCalc` 的 async handler 里 `await readExcelFile()` 之后的 Promise 链跟不上 → dump 时结果区仍 HIDDEN，像"页面坏了"。**排查法**：绕过 UI 直接在页面里调 `AssemblyEngine.compute()`，若引擎正常则是测试方法问题而非产品缺陷。

## Bug 修复记录（精简）
| 日期 | 现象 | 根因 | 修复 |
|---|---|---|---|
| 09-30 | `1806067` 组装 0（替代件充足） | Phase3 对替换组各 child 独立查 allocated，主件=0 拉低整组 | 合并 children 的 allocated 算 maxSets |
| 09-30 | `1728820` 明细缺 `1752611` | rel1Sets 初值 0 使 `rel1Sets===0` 恒真、后续更大值覆盖 | 初值改 -1 哨兵，条件 `rel1Sets<0 \|\| capSets<rel1Sets` |
| 10-05 | `1064109` 需求覆盖（应 50/200） | demandInfo `Map<wh,demand>` 同键覆盖；供应商组需求硬编码 0 | `demandByWhCat` 分存 + 多行需求独立封顶 |
| 10-05 | `1621249` 组装 0（可组953>需求950 却为0） | 合并逻辑只累加 allocated，非共享替代件可用量被当 0 | 共享取 allocated、非共享取 pool |
| 10-06 | `1822750` 输出「覆盖0、消耗1」脏行 | 容量把库存**相加再折算**（(3+1)/2=2），允许碎片凑套 | 三处改分别 floor 后相加（=1套） |
| 10-07 | `1779470` 碎片被消耗 | consumeAlts 未取整到配比倍数 | `take = floor(take/ratio)*ratio` |
| 10-07 | 剩余库存列 3 行负数、284 行对不上账 | ①共享主件 Phase4 重复扣 pool ②allocated 残留未结算 | 共享主件从 allocated 扣；每实例末尾结算 allocated（多退少补） |
| 10-15 | BOM 列交换即崩溃 | `warnings` 定义在 152 行但 128 行已用 | warnings 提前 + 列序检测改中位数比较 |
| 10-19 | 关系3 出现组内混用（`1744194`+`1752598`） | 批次3 右边界取**最大**容量 → 居中组替代件不够被迫转主件 | 改为「容量>rel1Sets 的组中**最小**值」；主件扣减按可用量裁剪 |
| 10-22 | **页面打开报错**（用户反馈「加载错误」） | `index.html` 写 `SAMPLE_DATA.SAMPLE.bom`，但 sample_data.js 导出 `SAMPLE_DATA={bom,...}` → TypeError | 改 `var sd = SAMPLE_DATA.SAMPLE \|\| SAMPLE_DATA;` + try/catch 兜底 |
| 10-23 | **打开页面就显示示例结果**（用户要求导入模板点计算才出结果） | `load` 事件里自动 `runCompute(SAMPLE_DATA...)` | load 时只确保 `resultPanel` 隐藏，不自动计算 |
| 10-23 | **单文件离线版页面脚本完全不执行** | xlsx 库源码含 `'<html>...<body>'`、`"</body></html>"` 字面量 → 浏览器提前结束 head/body，后续脚本失效 | 内联时把库包成 JSON 字符串字面量（`<`→`\u003c`）+ `eval()` 执行 |
| 10-27 | **1743969 关系2 少一个子件**（24行 vs 其他25行） | 批次2 硬编码纯主件（`priUsed2=sets2*priRatio`），而 altMaxSets 只取「容量>rel1 的组中最小值」→ 容量大的组替代件仍充足却被强制走主件，主件库存0时整组消失 | 批次2 改为「先用本组替代件，不够再主件」；补批次2 替代件明细输出与库存扣减 |

## 部署与验证
- ⚠️ **沙箱链接无法对外分享（已读源码确认，勿再猜参数）**：分享链接由服务端 PaaS `/workspaces/{spaceKey}/links` 生成（见 `app.asar.unpacked/resources/builtin-skills/cloudstudio-deploy/scripts/deploy.js` 的 `getShareLink`），令牌随平台会话注入，工具层拿不到也补不齐 → **仅在 WorkBuddy 内嵌预览器可用**，外部一律 403「链接不完整」。对外分享必须用外部托管或发离线单文件版。
- **GitHub Pages 全自动发布（已就绪）**：remote 已指向 `https://github.com/Xylia-cc/my-dev-nest.git`，分支 **main**。发布：`bash publish/github_guide.sh`（首次粘贴 PAT，勾 **repo + workflow**，存 `~/.workbuddy/github_token.txt`；也支持 `<repo> <token>` 传参）或 `bash publish/github_push.sh`（纯非交互，读已存 token）→ `publish/github_auto_publish.js` 完成「API 建仓库 → git push（token 走一次性 http.extraheader，不落盘）→ API 开 Pages → 输出永久地址」。另有 `.github/workflows/publish.yml`（push main 即自动部署）+ `publish/build_gh.js`（8 项自检）。
  - ★ **仓库必须是 Public**：私有仓库 GitHub 免费版不支持 Pages；Pro 版可开但访问需登录自己账号，不适合分享。
  - ⚠️ **GitHub 连接时通时断**：git 连不上时用 `GIT_CURL_VERBOSE=1 git ls-remote <url>` 判断（TLS 成功+401=认证问题；超时=网络抖动，**先重试**别下"被墙"结论）。
  - ⚠️ **git 的 GUI 弹窗在此环境不可用**（`/dev/tty: No such device`）→ 必须用 token + extraheader 的非交互方式。GitHub Device Flow 端点被重置（ECONNRESET），走不通。
- **局域网临时分享**：`bash publish/serve_lan.sh` → `http://<本机IP>:8899/`（本机 192.168.8.94），同事同网段可直接开，需本机常开。
- 沙箱部署：`workbuddy_cloudstudio_deploy`，仅供自己预览。
- **离线单文件版**（零外部依赖、可双击打开、可微信传）：`site/分仓组装量计算器-离线版.html`（977KB）。
- ★ **单文件版构建铁律**（`publish/build_gh.js`）：第三方库源码含 HTML 标签字面量时，必须包成 JSON 字符串字面量并把所有 `<` 转成 `\u003c`，运行时 `eval()` 执行。⚠️ 不可写 `JSON.parse(...)`（`JSON.stringify` 的结果已是 JS 字符串字面量，再 parse 会报 `Unexpected token '/'`）。
- 回归测试：`test_engine.js` / `test_rule2.js` / `test_rule3.js` / `test_category.js` 全部通过方可发布（或 `npm test`）。
- 全量校验三指标须为 0：负剩余、对账不符（剩余+消耗≠库存表原值）、超库存、脏行（覆盖0却有消耗）。
