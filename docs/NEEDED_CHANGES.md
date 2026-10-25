# 需求清单（NEEDED_CHANGES）—— 一次性说清「要改什么、怎么改、怎么验收」

> 生成时间：2026-10-27。作者：本会话执行 agent。
> 用途：**这份文件是接下来所有改动的唯一依据**。它合并了三部分内容：① 你这次提的 4 个需求 + 1 个 bug；
> ② `docs/REMAINING_WORK.md` §9.3 里还挂着的功能缺口（错题本 / 心情曲线）；③ 我这轮留下的流程与技术债。
> 配套文档：`docs/UI_GUIDE.md`（v5 视觉规范，视觉相关一律以它为准）、`docs/CURRENT_STATE.md`（代码事实）、
> `docs/REMAINING_WORK.md`（历史遗留与交接）、`e2e/AC-MATRIX.md`（验收对照表）。

---

## 0. 当前基线（写这份文件时实测）

| 项 | 值 |
| --- | --- |
| 分支 / 工作区 | 干净，HEAD `3240a97` |
| 路由 | 13 条（11 个真实页面 + 2 条重定向）；`#/plan` 就是「日程」页 |
| 单测 | **63 文件 / 532 用例全绿** |
| e2e | **75 passed / 0 failed**（约 3.6 分钟） |
| typecheck | `vue-tsc --noEmit` 0 错误 |
| 已用验收号 | AC-01 ~ **AC-70**（新的一律从 **AC-71** 起，开工前先在 `e2e/AC-MATRIX.md` 占号） |
| 视觉规范 | v5：灰绿纸 + 松绿场 + 朱砂信号 + 粗野主义（2px 墨框 / 硬投影 / 直角） |

> 关于 AC 号：本文档里的「建议 AC-7x」**按本章节的书写顺序**占（N1→71、N3→72、B1→73、N2→74、N4→75），与实际实施先后无关；真正落地时以 `e2e/AC-MATRIX.md` 的登记为准。

### 0.1 优先级总览

| 序号 | 事项 | 类型 | 规模 | 需要你拍板 |
| --- | --- | --- | --- | --- |
| **N1** | 首页喝水可加可减 | 需求 | 0.25 段 | 否 |
| **B1** | 弹窗「✕ / 遮罩 / Esc」关不掉（7 处，含科目页） | **Bug** | 0.25 段 | 否 |
| **N3** | 健身：项目库可增删 + 锻炼完选项目写备注 + 今日训练置顶 | 需求 | 1.25 段 | 是（Q2/Q3） |
| **N2** | 日程页只有一种固定视图 → 要能切/能调 | 需求 | 1.5 段 | **是（Q1，最关键）** |
| **N4** | 交互与沉浸感（按下 / 完成 / 过渡） | 需求 | 1 段 | 是（Q4） |
| **P1** | 错题本：文字录入（M9） | 功能缺口 | 1.25 段 | 是（Q5） |
| **P2** | 错题本：照片录入（M10） | 功能缺口 | 1.5 段 | 是（Q6） |
| **P3** | 心情 / 精力曲线（M7） | 功能缺口 | 1 段 | 是（Q7） |
| **P4** | 侧栏用户主动折叠（68px + 记忆） | 视觉收尾 | 0.25 段 | 否 |
| **P5** | e2e / AC 号欠账（日程页、首页新面板） | 测试 | 0.5 段 | 否 |
| **P6** | 技术债（6 项，见 §7） | 工程 | 1 段 | 否 |

建议先做 **B1 → N1 → N3 → N4 → N2**，再做 P1~P3，最后 P4~P6。理由：B1 是 bug 且根因已定位；N1/B1/N3 都是小刀快切、当天能验；N2 牵动版面结构，要先拍板。

---

## 1. N1 · 首页喝水可加可减

### 现状证据
- `src/components/HomeCards.vue:141`：喝水卡只有一个按钮 —— `<button data-test="water-plus" @click.stop="addWater">+1 杯</button>`。
- `src/stores/home.ts:345` 的 `addWater()` 内部固定 `useDietStore().addWater(this.today, 1)`，**没有减水动作**。
- 好消息：底层早就支持减法 —— `src/stores/diet.ts:270` `doAddWater(date, delta)` 明确只接受 `+1 / -1`，且减到 0 时返回 `null` 不写负数（饮食页 `WaterTracker.vue` 的 `water-minus` 就是走它）。

### 怎么改
1. `src/stores/home.ts`：加 `async removeWater()`，内部 `useDietStore().addWater(this.today, -1)`（与 `addWater` 对称，返回 `Water | null`），写完 `reload()`。
2. `src/components/HomeCards.vue` 喝水卡：把单个按钮换成一组 `−1 杯 / +1 杯`。
   - 与饮食页保持一致：减号在左、加号在右，都是 `ghost-btn` / `primary-btn`。
   - `home.water.totalMl === 0` 时减号 `disabled`（避免点了没反应）。
   - 两个按钮都要 `@click.stop`（卡片本身点击是跳 `/life/diet`）。
3. 不做：不引入「自定义杯量」输入，不改 2000ml 目标逻辑。

### 验收（建议 AC-71）
- 首页点「+1 杯」→ `water` 表 +1 行 250ml，卡片数字与饮食页同步（既有 AC-17 已覆盖加法，别退化）。
- 首页点「−1 杯」→ `water` 表新增一条 **负数杯量记录**（沿用 `doAddWater` 的既有实现），首页与饮食页同时减少 250ml。
- 0ml 时减号按钮 `disabled`，点它不写库。
- 单测：`home.spec.ts` 加 `removeWater` 用例；`home-cards.spec.ts` 加「点减号调用一次 removeWater / 0ml 时按钮 disabled」。

---

## 2. B1 · Bug：弹窗的「✕ / 点遮罩 / Esc」关不掉（只影响 7 个弹窗）

### 根因（已定位，不是玄学）
`BaseModal.vue` 的关闭按钮只做了一件事：`emit("close")`。**弹窗能不能关，取决于父组件有没有监听 `@close`。**
你遇到的「科目页添加科目弹窗 ✕ 点了没反应、只能点取消」就是因为 `StudySubjectsView.vue:179` 那个 `<BaseModal>` **没有绑 `@close`**；而「取消」按钮是自己写 `@click="formOpen = false"`，所以只有它能用。

同一类漏绑一共 **7 处**（全部中招，只是你只碰到了科目页）：

| 文件:行 | 弹窗 | 症状 |
| --- | --- | --- |
| `src/views/StudySubjectsView.vue:179` | 新增/编辑科目 | ✕、遮罩、Esc 全失效 |
| `src/views/StudySubjectsView.vue:214` | 手动补记学习记录 | 同上 |
| `src/views/StudySubjectsView.vue:259` | 历史学习记录 | 同上 |
| `src/views/StudyBooksView.vue:167` | 新增/编辑书籍 | 同上 |
| `src/views/StudyBookDetailView.vue:235` | 标记为读完？ | 同上 |
| `src/views/StudyBookDetailView.vue:256` | 新增/编辑摘录 | 同上 |
| `src/views/StudyBookDetailView.vue:300` | 手动补记阅读记录 | 同上 |

已经绑好的（可作参照写法）：`PlanFormModal.vue:183`、`PlayRecordList.vue:117`、`ClearDataModal.vue:28`、`DateJumpPopover.vue:50`、`SettingsView.vue:374`、`ReviewView.vue:289`。

### 怎么改
1. 上面 7 处逐个补 `@close="xxxOpen = false"`（科目/书籍表单用 `formOpen = false`；读完确认用 `confirmDoneOpen = false`；摘录 `excerptOpen = false`；手动补记对应各自 `manualOpen`；历史记录 `historyOpen = false`）。
2. `BaseModal.vue` 的 ✕ 按钮补 `type="button"`（现在没写，一旦将来有弹窗把内容包在 `<form>` 里就会变成 submit），顺手给它一个 `data-test="modal-close"`，方便断言。
3. **加一条守卫测试**，防止以后再漏：新建 `src/components/base-modal-close.spec.ts` 之类，把一个**不带 `@close` 的假父组件**挂上去，断言「点 ✕ 后 `emit("close")` 有触发」；再在 `src/views/*.spec.ts` 里各补一条「点 ✕ 后弹窗消失」（科目/书籍各一条即可代表）。

### 验收（建议 AC-73）
- 科目页：点「添加科目」→ 点 ✕ → 弹窗关闭；点遮罩空白处 → 关闭；按 Esc → 关闭；三种都不写库。
- 书籍页同理；摘录、手动补记、读完确认、历史记录弹窗同理。
- 既有「取消 / 保存」行为不变（AC-26~AC-30、AC-31 附近断言不得改动）。
- e2e：在 `e2e/study.spec.ts` 或 `global.spec.ts` 加一条「弹窗三种关闭方式」的用例。

---

## 3. N3 · 健身专区：项目库可编写 + 锻炼完选项目写备注 + 今日训练置顶

### 现状证据（有好消息：一半已经做了）
| 你要的 | 现状 | 证据 |
| --- | --- | --- |
| 先写好需要的锻炼项目 | ⚠️ **只能被动自动收录**：在当天训练里加过动作、或存过模板，才会进 `exercises` 表 | `src/stores/workout.ts:277` `upsertLibraryExercise()`；`src/db/schema.ts:220` `Exercise` 只有 `name` 一个业务字段 |
| 项目可增加 / 删除 | ❌ 项目库区块是**只读**的，只能点一下「加入今天」 | `src/components/ExerciseLibrary.vue` 全文只有 `emit("select")`，没有新建/删除 |
| 锻炼完选项目 | ✅ 有（从项目库点选 → 进当天训练） | `LifeWorkoutView.vue` 里 `<ExerciseLibrary @select="addExercise" />` |
| 加备注（多少组 / 跑了多久） | ✅ **已经有**，但可能太隐蔽 | `WorkoutDay.vue`：每组「重量 / 次数 / 打勾」(`data-test="set-*"`)、动作备注 `data-test="exercise-note-input"`、整体用时 `data-test="duration-input"` |
| 今日训练放首位 | ❌ 现在顺序是 **每周计划 → 今日训练 → 历史训练记录** | `LifeWorkoutView.vue:145 / 153 / 172` |

### 怎么改

**3.1 项目库变成可编辑（这是本次核心）**
- `src/stores/workout.ts` 新增三个动作（沿用现有 `runWithSaveStatus` + 软删除风格）：
  - `createLibraryExercise(name)`：去空格、查重（同名视为同一条，直接复用），写 `exercises` 表。
  - `deleteLibraryExercise(id)`：软删除（`deleted_at`）；**当天训练记录里已有的动作不动**（记录里存的是名字快照，与项目库解耦）。
  - `renameLibraryExercise(id, name)`：改名要处理重名（合并或报错，见 Q3）。
- `src/components/ExerciseLibrary.vue` 增加：
  - 顶部一个输入框 + 「添加」按钮（回车也能加），`data-test="library-add-input"` / `library-add-btn`。
  - 每个项目右侧一个「✕」删除（`data-test="library-remove"`），删之前不弹确认（可撤销：复用 `toast.undoable`，5 秒内可恢复）。
  - 项目改成 `{ id, name }` 结构（现在只传 `names: string[]`，需要改成传完整对象，父组件相应调整）。
- 空态文案改掉：现在写「添加动作后会自动收录到这里」，改成「这里是你自己的动作清单，先写下来，练的时候点一下」+ 输入框。

**3.2 锻炼完 → 选项目 + 写备注（把已有的东西显性化）**
- 今日训练区块里，每个动作行**默认展开**三样东西，并用中文标签写清楚：`重量(kg)` / `次数` / `完成` 打勾；动作下面一行 `备注`（例如「4 组 12 次」「跑步 30 分钟」）；顶部 `用时(分钟)`。
- 打勾完成一组时给一个**完成态反馈**（见 N4：整行变灰 + 删除线 + 右侧出现对勾）。
- 提供「一键标记整组完成」，避免逐组点（可选，见 Q2）。

**3.3 今日训练置顶**
- `LifeWorkoutView.vue` 模板顺序改成：**① 今日训练（含项目库） → ② 每周计划 → ③ 历史训练记录**。
- 今日训练卡片标题带上日期与状态（`10月24日 训练 · 未开始 / 进行中 / 已完成`）。
- 「开始临时训练」「结束训练」两个主按钮跟在今日训练卡里（现在已经在卡里，位置不变）。

### 需要你拍板
- **Q2**：动作记录要不要「一键整组完成」？组的默认数量（3 组？）要不要可配置？
- **Q3**：项目库改名撞同名时，是**合并成一条**还是**报错拦住**？删除项目时，历史训练记录里的同名动作**保留**（我的建议）还是也跟着删？

### 验收（建议 AC-72）
- 项目库：新建「深蹲」→ `exercises` 表 1 行；再新建同名 → 不产生第 2 行；删除 → 软删除（`deleted_at` 非空），列表消失，5 秒内可撤销恢复。
- 今日训练：点项目库里的「深蹲」→ 当天记录 `exercises` 多一条，且默认带 3 组（若 Q2 定为 3 组）。
- 备注：填「4 组 12 次」→ 落库到该动作 `note`，刷新后还在；用时填 30 → `duration_min = 30`。
- 顺序：打开健身页，第一个区块是今日训练（`data-test="day-card"` 在 `week-plan` 之前）。
- 备份导出/导入往返后，`exercises` 与 `workout_records[*].exercises[*].note` 都不丢（这两张表已在备份范围内）。

---

## 4. N2 · 日程页：现在只有「一种固定视图」

### 现状证据
- `src/views/PlanView.vue:180` 起的版式是写死的三层：`<ScheduleWeek />`（顶部 7 天概览）→ 左「时间轴」→ 右「待办清单」，再加进度条 / 今日训练 / 昨日 MIT。
- `ScheduleWeek.vue` 的窗口是**硬编码**的「昨天 → 后五天，共 7 天」（文件头注释就写着「默认窗口」），用户不能改起点，也不能切换成单日大图。
- 结论：**只有一种版式、窗口固定、不能切换、不记忆**。你说的「只有一个视图而且固定」完全成立。

### 建议做成什么（三档，建议全做，也可以只做前两档）
1. **视图切换（核心）**：右上角一个分段控件 `7 天概览 / 单日时间轴 / 列表`，三种视图共用同一份数据（`plans` + `study_records`），切换不跳页、不改日期。
   - `7 天概览`：现在这块，保留（含三泳道 + 列脚摘要）。
   - `单日时间轴`：把现在左栏的 `PlanTimeline` 放大到整页宽（当天 06:00–24:00 竖轴，块更宽、能直接看到标题与起止时间）。
   - `列表`：按时间排序的行列表（时间 / 标题 / 分类 / 状态 / 操作），适合快速批量勾选。
2. **窗口可调 + 记忆**：7 天窗口给「← 上一周 / 回到今天 / 下一周 →」，并把「上次用的视图 + 窗口起点」存 `localStorage`（**不要**动 `settings` 表结构，避免升 DB 版本）。
3. **点某天 = 下钻**：在 7 天概览点某一列 → 自动切到「单日时间轴」并定位到那天（现在只是切换选中日期，视图不变）。

### 需要你拍板
- **Q1（最关键）**：日程页要**几种视图**？只要「7 天 + 单日」两档，还是也要「列表」三档？窗口要不要允许跨周滑动？（我建议：三档 + 允许滑动 + 记忆上次选择。）

### 验收（建议 AC-74）
- 切到「单日时间轴」→ 时间轴占满内容区宽度，选中日期的时间块可见可编辑；刷新后仍是这个视图（localStorage 记忆）。
- 7 天窗口点「下一周」→ 列日期整体 +7 天，点「回到今天」→ 回到默认窗口。
- 三档视图显示的**同一天的件数 / 学习时长一致**（同一数据源，断言数字相等）。
- 既有 e2e（AC-21~AC-25 计划相关）**必须原样全绿**：视图切换不得改变 `plans` 的写路径。

---

## 5. N4 · 交互与沉浸感（现在几乎没有）

### 现状证据（这是可量化的短板，不是感觉）
- `src/assets/main.css` 里 **`transition` 只有 2 处、`@keyframes` 只有 2 个**（`pulse` 保存中闪烁、`sheet-up` 移动端抽屉上滑），grep `:active` 无任何命中 —— 也就是**按钮按下没有任何反馈**。
- 全站没有 `prefers-reduced-motion` 处理。
- 唯一「像交互」的地方：保存状态文字、倒计时归零提示、toast。

### 建议清单（按投入产出排序，全部不破坏 v5 规范）
| # | 交互 | 怎么做 | 落点 |
| --- | --- | --- | --- |
| 1 | **按下手感** | 主按钮/卡片 `:active { transform: translate(2px, 2px); box-shadow: none }`（硬投影"按进去"），`transition: transform 90ms` | `main.css` 的 `.primary-btn / .ghost-btn / .danger-btn / .home-card / .book-card` |
| 2 | **完成反馈** | 勾选计划/训练组/待办时：行先 `background: var(--mark)` 闪一下 → 变灰 + 删除线；只对"完成"方向播 | `PlanTimeline`、`HomeNext`、`WorkoutDay` |
| 3 | **数字滚动** | 喝水 +1、学习时长、计时器秒数用等宽 + `font-variant-numeric: tabular-nums`（已在用）+ 数字变化时 120ms 高亮 | `HomeCards`、`WorkoutDay`、`StudyTimerView` |
| 4 | **页面切换过渡** | 路由层 `<Transition name="page-fade">` 140ms 淡入 + 微位移（4px） | `App.vue` |
| 5 | **进度条/柱状图过渡** | `width / height` 加 `transition: 240ms ease-out` | 首页进度、本周学习柱、SubjectWeekChart |
| 6 | **空态引导** | 空状态图标轻微 `pulse`（一次，不循环）+ 主按钮有 hover 抬升 | `EmptyState.vue` |
| 7 | **快捷键提示** | 已存在（Space / ←→ / T / N），可在页脚加一行小字提示"按 ? 看快捷键"→ 弹出快捷键表（可选） | 新增小弹层 |

### 硬约束（写进实现纪律，别越界）
- **必须**尊重 `prefers-reduced-motion: reduce`（用一个 `@media` 块把所有 `transition / animation` 关掉）。
- **禁止**：模糊阴影、渐变、弹性回弹（bounce）、超过 300ms 的动画、循环播放的装饰动效、任何"打开页面就动"的自动动画。
- 动画只表达**状态变化**（按下 / 完成 / 递进 / 切页），不做装饰。
- 动画不得影响测试：e2e 断言前用 `toBeVisible()`（Playwright 会等稳定），不要新增 `waitForTimeout`。

### 需要你拍板
- **Q4**：上面 7 条要全做，还是只做 1/2/4（按下 + 完成 + 切页）这三条核心？

### 验收（建议 AC-75）
- 按下任意主按钮，位移 2px 且阴影消失（可用 `:active` 样式断言 + 人工目视）。
- 勾选一个计划 → 该行有 120~200ms 的完成态过渡，最终变灰划线；取消勾选立刻还原。
- 系统开启"减少动态效果"后，所有过渡时长变为 0（`@media (prefers-reduced-motion: reduce)` 断言存在）。
- 全站动画总时长无一处超过 300ms（`grep` 质检 + 人工）。

---

## 6. P1~P3 · 之前就挂着的功能缺口（细节见 `REMAINING_WORK.md`）

| 序号 | 事项 | 现状 | 卡在哪 |
| --- | --- | --- | --- |
| **P1 (M9)** | 错题本·文字录入 | `mistakes` 表、备份、文本导出都已就绪；**路由 / store / 视图 / 导航全缺** | Q5：单条编辑 vs 一题一卡；错误原因是否预设标签；是否进日期切换 |
| **P2 (M10)** | 错题本·照片录入 | `src/utils/image.ts`（1400px / 0.72 压缩）已写好且有测试；缺 `ImageInput.vue` | Q6：图片是否进备份（50 张≈20MB），还是单独导出 |
| **P3 (M7)** | 心情 / 精力曲线 | `reviews.mood / energy` 字段与保存链路都通；缺 `sparkline.ts` + `TrendChart.vue` | Q7：曲线放复盘页底部 / 首页 / 新建 `/trends` |

这三项的共同点：**表结构不用动、不用升 DB 版本**，纯粹是「加页面 / 加组件」。

---

## 7. P4~P6 · 工程与流程欠账

### P4 侧栏主动折叠（0.25 段）
- 现状：`.side-nav` 宽 212px（`main.css`），折叠只发生在 `@media (max-width: …)` 里、宽度是 **64px**，而且**没有用户自己点的入口**。
- 改法：侧栏顶部加一个折叠按钮，折叠态 68px 只留图标，状态存 `localStorage`（键名建议 `evan-sidebar-collapsed`），刷新保持；响应式断点里的 64 与 68 统一成 68。
- 验收：点按钮 → 212⇄68 切换，刷新保持；折叠态每个入口仍有 `title` / `aria-label`（可访问性不退化）。

### P5 e2e / AC 号欠账（0.5 段）
- 日程页（7 天概览 + 三泳道）**只有单测**，没有 e2e，也没占 AC 号。
- 首页新增的「接下来」「本周学习」也只有单测（`home-next.spec.ts` / `home-week-study.spec.ts`）。
- 改法：给日程页和首页这两块各补 1 条 e2e，并在 `AC-MATRIX.md` 占号（可用 AC-74 之后）。

### P6 技术债（1 段，一次性清）
| # | 项 | 位置 | 建议 |
| --- | --- | --- | --- |
| 1 | `addExercise` 先写项目库再取当天记录，休息日会产生"库里多一条、今天没加上" | `src/stores/workout.ts:477` | 先拿可编辑记录，成功后再 upsert；或包事务（N3 会重写这块，顺手修） |
| 2 | `books.sort_index` 可选 + `?? Infinity` 兜底 | `src/stores/library.ts` 读取端 | 在 `importBackupObject` 后补一层归一化，别只靠 `normalizeRow` |
| 3 | 书架拖动**没有键盘/触屏替代** | `BookCard.vue` / `StudyBooksView.vue` | 给每张卡片加「上移 / 下移」按钮（键盘可 tab 到），触屏也就能排序 |
| 4 | `testTimeout = 15000` | `vite.config.ts:38` | 先测一条「整轮耗时」基线，再试着降到 8000；失败用例必须先查根因，不许靠调大超时 |
| 5 | 备份 `SCHEMA_VERSION = 3` 不可降级 | `src/db/schema.ts` | 二选一：接受单设备事实标准（写进文档），或把 `SCHEMA_VERSION` 退回 2（导入端继续接受 3） |
| 6 | 新增页面没进 `docs/CURRENT_STATE.md` 的结构说明 | 文档 | 每做一项就补一段（纪律，不单独排期） |

---

## 8. 需要你回答的问题（回答完就能一路做完，不用再问）

| 编号 | 问题 | 我的建议 |
| --- | --- | --- |
| **Q1** | 日程页要几档视图？窗口要能跨周滑动吗？ | 三档（7 天概览 / 单日时间轴 / 列表）+ 可滑动 + 记忆上次 |
| **Q2** | 健身动作要不要「一键整组完成」？默认 3 组？ | 要；默认 3 组，可在设置页改 |
| **Q3** | 项目库改名撞名：合并还是报错？删项目时历史记录里的同名动作？ | 撞名合并；历史记录保留（记录存的是名字快照） |
| **Q4** | 交互动效做 7 条还是只做核心 3 条？ | 先做核心 3 条（按下 / 完成 / 切页），其余按需 |
| **Q5** | 错题：单条编辑 vs 一题一卡？错误原因预设标签？进日期切换？ | 一题一卡 + 预设标签（概念不清/计算失误/审题错误/时间不够）+ 进日期切换 |
| **Q6** | 错题图片进不进备份？ | 进备份，但单条最多 4+4 张，超阈值在设置页提示 |
| **Q7** | 心情/精力曲线放哪？ | 复盘页底部（和录入同屏） |
| **Q8** | 健身页的「每周计划」要不要能折叠？ | 要（今日训练置顶后，周计划收成一行摘要，点开再编辑） |

---

## 9. 执行纪律（每次改动都照这个来，别自己发明）

1. **一条改动一个 commit**，信息写清「改了什么 / 为什么」。
2. **每条改动都要有测试**；不得删除、跳过或放宽既有断言（导航类改动只能改操作路径）。
3. 新增验收用例**先在 `e2e/AC-MATRIX.md` 占号**（下一个可用 **AC-71**）。
4. 动表结构才需要三件套：`DB_VERSION` + `upgradeToVn` 迁移 + 旧备份可导入断言。**本文件里的 N1~N4、B1、P1~P3 都不需要升版本**（除 P1/P2 复用现成 `mistakes` 表）。
5. "今天"一律 `logicalToday(settings.dayStartMin)`，禁止 `new Date()` 取日期。
6. 颜色只用 CSS 变量；圆角只用 `0 / var(--radius*) / 50%`；不加 CDN / 外部字体 / 图标库 / UI 库。
7. 验证范围：改动相关的测试先跑；**交付一个完整功能点**时才跑全量（`vitest run` + `vue-tsc --noEmit` + `playwright test`，e2e 必须独占、不要与 vitest 并发）。
8. 端口：`5173` 是真实数据（别拿它做破坏性试验），`5180` 是独立库随便造；e2e 默认打 5173。

### 快速命令
```bash
pnpm run dev              # 5173（真实数据）
pnpm run dev:5180         # 5180（独立库）
npx vitest run <文件>      # 单文件测试
npx vue-tsc --noEmit      # 类型检查（必须 0 错误）
npx playwright test e2e/xxx.spec.ts --reporter=line   # e2e 独占跑
```

---

## 10. 建议的交付顺序（三批）

**第 1 批 · 当天能验（约 1 天）**
1. B1 弹窗关闭 bug（7 处 + 守卫测试）
2. N1 首页喝水 ±1
3. N3 健身：今日训练置顶 + 项目库增删
4. N4 核心 3 条交互（按下 / 完成 / 切页）

**第 2 批 · 需要拍板（约 2 天）**
5. N2 日程页三档视图 + 窗口可调 + 记忆
6. N3 收尾（一键整组完成、周计划折叠）

**第 3 批 · 功能补齐（约 3~4 天）**
7. P1 错题文字录入 → P3 心情曲线 → P2 错题照片
8. P4 侧栏折叠 + P5 e2e/AC 欠账 + P6 技术债

每一批做完：全量 `vitest` + `vue-tsc` + `playwright` 绿 → 更新 `CURRENT_STATE.md` 与 `AC-MATRIX.md` → 提交。
