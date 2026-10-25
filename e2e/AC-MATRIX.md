# AC 覆盖矩阵（Playwright E2E）

生成方式：每条 AC 至少一个 test()，测试名与代码注释均标注 AC 编号。
命令：`npx playwright test`（package.json `test:e2e`）。

| AC | 测试名 | 文件 |
|---|---|---|
| AC-01 | AC-01 数据刷新后保留并停留当前页 | e2e/data-persistence.spec.ts |
| AC-02 | AC-02 关闭浏览器重开后数据仍在 | e2e/data-persistence.spec.ts |
| AC-03 | AC-03 重启后数据仍在 | e2e/data-persistence.spec.ts |
| AC-04 | AC-04 计时跨刷新不丢 | e2e/study.spec.ts |
| AC-05 | AC-05 导出-清空-导入数据完全恢复 | e2e/data-persistence.spec.ts |
| AC-06 | AC-06 坏文件被拒绝且现有数据不变 | e2e/data-persistence.spec.ts |
| AC-07 | AC-07 导入覆盖前确认并自动备份 | e2e/data-persistence.spec.ts |
| AC-08 | AC-08 清空必须输入清空二字 | e2e/data-persistence.spec.ts |
| AC-09 | AC-09 备份时间显示与8天备份提醒 | e2e/data-persistence.spec.ts |
| AC-10 | AC-10 离线使用零外部请求 | e2e/offline.spec.ts |
| AC-11 | AC-11 十一路由导航与高亮 | e2e/global.spec.ts |
| AC-12 | AC-12 凌晨2点记录归属前一天 | e2e/global.spec.ts |
| AC-13 | AC-13 前一天补记喝水 | e2e/global.spec.ts |
| AC-14 | AC-14 删除后5秒内撤销恢复 | e2e/global.spec.ts |
| AC-15 | AC-15 全页面空状态引导 | e2e/global.spec.ts |
| AC-15 | 计时器空状态主按钮 `empty-add-target`（补齐 PRD §10 AC-15 缺口） | e2e/global.spec.ts |
| AC-16 | AC-16 快捷键 N Esc Space | e2e/global.spec.ts |
| AC-17 | AC-17 首页+1杯与饮食页同步 | e2e/home.spec.ts |
| AC-18 | AC-18 计划完成数同步首页 | e2e/home.spec.ts |
| AC-19 | AC-19 首页提示条最多2条且按优先级 | e2e/home.spec.ts |
| AC-20 | AC-20 昨天MIT今天显示并防重复加入 | e2e/home.spec.ts |
| AC-21 | AC-21 待办安排时间进入时间轴 | e2e/plan.spec.ts |
| AC-22 | AC-22 重叠时间块并排显示与提示 | e2e/plan.spec.ts |
| AC-23 | AC-23 移到明天 | e2e/plan.spec.ts |
| AC-24 | AC-24 一键顺延昨日未完成且分母不变 | e2e/plan.spec.ts |
| AC-25 | AC-25 关联书籍计时并询问完成计划块 | e2e/plan.spec.ts |
| AC-26 | AC-26 新增在读书籍出现在在读栏 | e2e/books.spec.ts |
| AC-27 | AC-27 更新页码40%并同步首页与复盘 | e2e/books.spec.ts |
| AC-28 | AC-28 读到总页数提示并移入读完 | e2e/books.spec.ts |
| AC-29 | AC-29 摘录按页码排序 | e2e/books.spec.ts |
| AC-30 | AC-30 开始阅读计时预选与手动补记 | e2e/books.spec.ts |
| AC-31 | AC-31 科目周目标与截止倒计时 | e2e/study.spec.ts |
| AC-32 | AC-32 手动补记后周进度与柱状图更新 | e2e/study.spec.ts |
| AC-33 | AC-33 未选对象无法开始计时 | e2e/study.spec.ts |
| AC-34 | AC-34 暂停时间不计入有效时长 | e2e/study.spec.ts |
| AC-35 | AC-35 不足1分钟询问丢弃 | e2e/study.spec.ts |
| AC-36 | AC-36 待结算刷新恢复且保存更新页码 | e2e/study.spec.ts |
| AC-37 | AC-37 计时胶囊跨页显示与跳转 | e2e/study.spec.ts |
| AC-38 | AC-38 全局单计时守卫 | e2e/study.spec.ts |
| AC-39 | AC-39 倒计时1分钟到点提示与再来一轮 | e2e/study.spec.ts |
| AC-40 | AC-40 常吃快捷项前8且不串餐次 | e2e/life.spec.ts |
| AC-41 | AC-41 复制昨天这一餐 | e2e/life.spec.ts |
| AC-42 | AC-42 喝水加减与圆点进度 | e2e/life.spec.ts |
| AC-43 | AC-43 周三模板带出/上次数值/勾选持久 | e2e/life.spec.ts |
| AC-44 | AC-44 完成训练自动用时与首页历史同步 | e2e/life.spec.ts |
| AC-45 | AC-45 休息日临时训练 | e2e/life.spec.ts |
| AC-46 | AC-46 娱乐超额变红仍可保存 | e2e/life.spec.ts |
| AC-47 | AC-47 复盘7项汇总与各模块一致 | e2e/review.spec.ts |
| AC-48 | AC-48 复盘评分文字刷新保留与再点取消 | e2e/review.spec.ts |
| AC-49 | AC-49 未写日期不占行，顶栏切过去补写后进入区间列表 | e2e/review.spec.ts |
| AC-50 | AC-50 设置目标立即生效与内置分类保护 | e2e/review.spec.ts |
| AC-51 | AC-51 深色模式刷新保持 | e2e/review.spec.ts |
| AC-52 | AC-52 导入1年模拟数据后页面切换不卡顿 | e2e/perf.spec.ts |
| AC-53 | AC-53 控制台无红色报错 | e2e/perf.spec.ts |

辅助（不属于 AC，但覆盖 PRD §5.4 的 12 小时恢复规则）：
- AC-39辅助 计时12小时恢复（e2e/study.spec.ts）
- AC-49b 自评草稿未确认时切日期二次确认（e2e/review.spec.ts）

覆盖完整性：AC-01~AC-53 共 53 条，全部有对应测试；无 skip / only。

## M2 日期月历（AC-57 ~ AC-59）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-57 | AC-57 顶栏日期弹窗月历：格数、今天与选中日高亮、点选跳转、翻月不改选中日 | e2e/calendar.spec.ts |
| AC-58 | AC-58 月历小点只认五张主动记录表，忽略软删除与 water/meals | e2e/calendar.spec.ts |
| AC-59 | AC-59 日期控件只在 5 个日期相关页面显示，原生日期输入仍可用 | e2e/calendar.spec.ts |

## M3 娱乐页倒计时（AC-60 ~ AC-61）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-60 | AC-60 未填内容名称无法开始倒计时 | e2e/play-countdown.spec.ts |
| AC-60 | AC-60 倒计时快捷30分钟启动并显示剩余时间 | e2e/play-countdown.spec.ts |
| AC-60 | AC-60 自定义分钟生效且非法值被拒绝 | e2e/play-countdown.spec.ts |
| AC-60 | AC-60 按剩余额度取今日剩余分钟且额度为0时禁用 | e2e/play-countdown.spec.ts |
| AC-61 | AC-61 娱乐倒计时到点后超时结束仍记设定时长 | e2e/play-countdown.spec.ts |
| AC-61 | AC-61 历史再来一轮预填但不自动开始 | e2e/play-countdown.spec.ts |

覆盖完整性：AC-60 / AC-61 共 2 条，逐条有对应测试，无 skip / only。

## M4 书架拖动（AC-62 ~ AC-63）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-62 | AC-62 拖到读完：当前页设为总页数、finish_date 今天、不生成学习记录 | e2e/books-drag.spec.ts |
| AC-62 | AC-62 从读完拖出：finish_date 清空、current_page 不变 | e2e/books-drag.spec.ts |
| AC-62 | AC-62 拖到在读：start_date 补逻辑今天 | e2e/books-drag.spec.ts |
| AC-63 | AC-63 同栏拖动顺序刷新后保持 | e2e/books-drag.spec.ts |

补充（AC-63 的迁移 / 旧备份兼容两项由单测覆盖）：
- v2 老库升级到 v3 后每本书都有 sort_index 且顺序按 created_at —— src/db/migration.spec.ts
- v2 备份文件仍能导入且 books 自动补 sort_index —— src/db/backup-v2.spec.ts
- 同栏重排幂等、跨栏改状态的数据语义 —— src/stores/library.spec.ts、src/utils/dragSort.spec.ts

覆盖完整性：AC-62 / AC-63 逐条有对应测试，无 skip / only。

## M5 健身项目库与快速记录（AC-64 ~ AC-65）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-64 | AC-64 项目库自动维护与快速选择 | e2e/workout-library.spec.ts |
| AC-65 | AC-65 动作备注写入/刷新/清空与回归 | e2e/workout-library.spec.ts |

补充（组件/单元层）：
- 项目库排序纯函数（最近使用优先、无历史按名字升序）—— src/stores/workout.spec.ts
- addExercise/renameExercise/saveTemplate upsert 项目库；软删除行视为不存在；重复添加不新增行 —— src/stores/workout.spec.ts
- setExerciseNote 落库/清空存 null/勾选与改值后仍保留/不影响默认用时 —— src/stores/workout.spec.ts
- libraryNames getter 顺序 —— src/stores/workout.spec.ts
- ExerciseLibrary 区块渲染/点选 emit/空状态 —— src/components/exercise-library.spec.ts
- 健身页接线：项目库点击加入、备注编辑与刷新保留/清空 —— src/views/life-workout-view.spec.ts

覆盖完整性：AC-64 / AC-65 逐条有对应测试，无 skip / only。

## M8 文本导出（AC-66）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-66 | AC-66 文本导出区间文件名与内容且不刷新备份提醒 | e2e/text-export.spec.ts |

补充（组件/单元层）：
- 文本导出端到端写法：最近 7 天 → 触发一次下载，文件名 `evan-text-YYYYMMDD-YYYYMMDD.md`（区间 = 今天往前 6 天 ~ 今天），内容含 `### 计划`/`AC66计划`、`### 饮食`/`- 早：AC66早餐`、喝水汇总 `- 喝水：1 次，合计 250 ml` —— src/components/settings-form.spec.ts
- 导出前后 `settings.last_backup_at` 相等（DB 与 store 两层都断言）—— src/components/settings-form.spec.ts、src/db/exportSource.spec.ts（只读：导出不写 settings）
- 自定义区间控件生效、起止填反自动对调、非法日期抛错 —— src/components/settings-form.spec.ts、src/db/exportSource.spec.ts
- 「全部」无记录时退回最近 30 天并写进导出区间 —— src/components/settings-form.spec.ts、src/db/exportSource.spec.ts
- `loadExportSource` 只取 `deleted_at === null` 的行、带上 settings/exercises、不做区间裁剪（区间过滤交给 exportText）—— src/db/exportSource.spec.ts
- `triggerDownload` 默认 `application/json`（备份沿用）、可传 `text/markdown`、10 秒后 revokeObjectURL —— src/utils/download.spec.ts

覆盖完整性：AC-66 逐条有对应测试，无 skip / only。

## 第二轮 UI 改造 · 第 1 步 样式令牌对齐（AC-67）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-67 | 样式令牌与 UI_GUIDE 一致 + .vue 无硬编码颜色 | src/assets/styleTokens.spec.ts |

补充（端到端 / 回归层）：
- AC-51 深色模式刷新保持仍通过：主题变量（含新增 --hero-*）在深色下生效，首页问候大块用 --hero-bg/--hero-ink/--hero-sub —— e2e/review.spec.ts
- 全站令牌换值（颜色/圆角）后布局与交互零回归 —— 全量 e2e 71 passed / 0 failed

覆盖完整性：AC-67 有对应测试（src/assets/styleTokens.spec.ts 共 9 条断言），无 skip / only。

## 第二轮 UI 改造 · 第 2 步 跟随系统主题（AC-68）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-68 | AC-68 跟随系统主题：三选一、系统切换即时生效、手选不被系统覆盖、刷新保持 | e2e/theme.spec.ts |
| AC-68 | AC-68 theme-color 与 UI_GUIDE 主色一致 | e2e/theme.spec.ts |

补充（单元/组件层）：
- `resolveTheme(mode, prefersDark)` 三分支：light→light（系统深/浅都一样）、dark→dark、system→跟随 prefersDark —— src/stores/settings.spec.ts
- `applyTheme('system')` 在 matchMedia 深色下写 `data-theme='dark'`、浅色下写 `'light'`；显式 light/dark 不受系统偏好影响；未知模式写入的值仍是 light —— src/stores/settings.spec.ts
- **监听器只注册一次**：连续 3 次 `startSystemThemeWatch()`（等价于重复 load）后假 MediaQueryList 上只有 **1 个** 监听器；模拟系统变化时统计的「应用次数」恰好 +1 —— src/stores/settings.spec.ts；`store.load()` 连跑两次后同样只有 1 个监听器，且 system 模式下来回切系统偏好 data-theme 立刻 dark↔light —— src/stores/settings.spec.ts
- `stopSystemThemeWatch()` 注销后监听器清空、系统变化不再应用 —— src/stores/settings.spec.ts
- **未知主题值兜底**：`normalizeTheme('sepia' | '' | null | undefined | 1) === 'light'`；库里写入未知值后 `settings.theme === 'light'`、`resolvedTheme === 'light'`、`isDark === false`、`data-theme === 'light'`（导入口带进来的未知值走同一条读取路径）—— src/stores/settings.spec.ts
- 设置页三选一：`theme-light`/`theme-dark`（保留）+`theme-system`（新增），文案「浅色 / 深色 / 跟随系统」，选中态 `.seg-btn.on`，点击持久化 system / 覆盖回 dark —— src/components/settings-form.spec.ts

覆盖完整性：AC-68 逐条有对应测试（e2e 2 条 + 单测 16 条 + 组件 1 条），无 skip / only；AC-51 既有断言未改动仍通过。


## 补齐 PRD 缺口（AC-69 / AC-70）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-69 | AC-69 书架卡片直接改页码 | e2e/books.spec.ts |
| AC-70 | AC-70 首页开始计时带对象直接开 | e2e/home.spec.ts |

补充（组件/视图层）：
- 书架上改页码 → 落库 `current_page` 且生成一条 `source='page_update'` 的学习记录（pages_read = 新页 - 旧页）—— src/views/study-books-view.spec.ts
- 页码超过总页数 → 不改库、给错误 toast、卡片数字保持原值 —— src/views/study-books-view.spec.ts
- 到总页数且未读完 → `updateBookPage` 返回 `confirmDone`，书架页 toast 提示改成「读完」—— src/views/study-books-view.spec.ts + src/stores/library.spec.ts（既有）

覆盖完整性：AC-69 有 1 条 e2e + 2 条视图层断言，无 skip / only；AC-26~AC-30 既有断言未改动（`book-pages` 文本保持原样）。
- 首页「开始计时」：有在读的书就带着它直接 `startTimer`，已有计时则只跳转不重复开 —— src/components/home-cards.spec.ts（2 条）

## 修复弹窗关闭 bug（AC-71）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-71 | AC-71 弹窗三种关闭方式（✕ / 遮罩 / Esc） | e2e/study.spec.ts |

补充（单测/组件/视图层）：
- **全库守卫**：`src` 下所有 `<BaseModal>` 开始标签都必须绑 `@close`（扫描式断言，扫到 ≥13 处，缺失即列出 文件:行）；扫描器自带自检用例，防止守卫变成永真 —— src/components/base-modal-close.spec.ts
- `✕` 按钮契约：`type="button"` + `data-test="modal-close"` + `aria-label="关闭"`，点击 emit `close`；点遮罩 emit `close` —— src/components/base-modal-close.spec.ts
- **Esc 的真相**：父组件没绑 `@close` 时，Esc 已把弹窗从 modal store 栈里弹出（`isOpen === false`）但弹窗仍留在屏幕上，且全局 Esc 处理器此后不再认它 —— 断言 emit 了 `close`、栈已空、屏幕仍在 —— src/components/base-modal-close.spec.ts
- 科目页：新增科目 ✕ 关闭不写库 / 手动补记点遮罩关闭不写库 / 历史记录 Esc 关闭 —— src/views/study-subjects-view.spec.ts
- 书架页：新增书籍 ✕ 关闭不写库 / 编辑书籍点遮罩关闭书名不变 —— src/views/study-books-view.spec.ts
- 书详情页：读完确认 ✕ 关闭后 status 仍为 reading / 新增摘录 Esc 关闭不写摘录 —— src/views/study-book-detail-view.spec.ts

覆盖完整性：AC-71 有 1 条 e2e + 5 条组件契约断言 + 7 条视图层断言，无 skip / only；既有「取消 / 保存」行为（AC-26~AC-32 附近）未改动且全绿。

## 首页喝水可加可减（AC-72）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-72 | AC-72 首页喝水可加可减 | e2e/home.spec.ts |

补充（单测/组件层）：
- `home.removeWater()` 复用 `diet.addWater(today, -1)`：+2 杯后减 1 杯 → 聚合 500→250 ml，water 表出现 `-250` 行 —— src/stores/home.spec.ts
- 0 ml 时 `removeWater()` 返回 null、不写记录、聚合保持 0 —— src/stores/home.spec.ts
- 剩余不足一杯时只扣剩余（100 ml 减一杯 → 写 `-100`，归零）—— src/stores/home.spec.ts
- 喝水卡按钮顺序固定 `water-minus` → `water-plus`（减号在左）、0 ml 时减号 disabled —— src/components/home-cards.spec.ts
- 点减号只调用一次 `home.removeWater()`，不触发卡片跳转 —— src/components/home-cards.spec.ts

覆盖完整性：AC-72 有 1 条 e2e + 5 条单测/组件断言；既有 AC-17（首页 +1 杯）断言未改动仍全绿。

## 健身专区：项目库可编写 + 今日训练置顶（AC-73）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-73 | AC-73 项目库可编写 / 一键整组完成 / 今日训练置顶 | e2e/workout-library.spec.ts |

补充（单测/组件/视图层）：
- `createLibraryExercise`：trim 后新建一行；再建同名复用同一条（不产生第二行）；空名字抛错 —— src/stores/workout.spec.ts
- `libraryItems`：带 id、排序与 `libraryNames` 一致 —— src/stores/workout.spec.ts
- `deleteLibraryExercise`：软删除 + 列表消失 + `toast.undoable('已删除动作，可撤销')` 撤销后恢复；当天训练里的同名动作保留（名字快照）；不存在 id 返回 false —— src/stores/workout.spec.ts
- `renameLibraryExercise`：无撞名改名成功；撞同名**合并**（被改那条软删除，保留已有条目）—— src/stores/workout.spec.ts
- `completeExercise`：该动作全部组置完成（默认 3 组）、其他动作不动、重复调用不重复写 —— src/stores/workout.spec.ts
- `addExercise` 顺序改为「先写当天记录、再维护项目库」（P6-1）—— 既有 AC-64 断言原样通过
- 项目库区块：输入框 + 添加按钮（回车/按钮都 emit add、空名字不 emit）、每条 ✕ emit remove(id)、空态文案改为「这里是你自己的动作清单，先写下来，练的时候点一下」—— src/components/exercise-library.spec.ts
- 健身页：顺序 = 今日训练 → 每周计划 → 历史；`day-card-title` 带日期/星期/状态（未开始·进行中·已完成）；周计划默认折叠（`aria-expanded=false` + summary「周一 胸」）—— src/views/life-workout-view.spec.ts
- 健身页：项目库新增落库、同名不重复、空名字不加；删除后 5 秒撤销恢复；一键完成全部组 → 3/3 组 —— src/views/life-workout-view.spec.ts

覆盖完整性：AC-73 有 1 条 e2e（含置顶位置、折叠、增删撤销、一键整组）+ 16 条单测/组件/视图断言，无 skip / only；AC-64 / AC-65 原有断言未改动，仍全绿（周计划改为默认折叠后，e2e 通过新增的 `openWeekPlan()` helper 展开，只改操作路径）。

## 交互与沉浸感（AC-74）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-74 | AC-74 按下手感：2px 位移 + 阴影消失 | e2e/motion.spec.ts |
| AC-74 | AC-74 完成反馈：勾选瞬间 flash，最终变灰划线 | e2e/motion.spec.ts |
| AC-74 | AC-74 prefers-reduced-motion 下所有过渡归零 | e2e/motion.spec.ts |

补充（机械守卫 + 组件层）：
- **机械守卫**：全站 `transition` / `animation` 单次时长 ≤ 300ms、**不允许 `infinite` 循环**；`prefers-reduced-motion: reduce` 块把时长全部归零；`.primary-btn/.ghost-btn/.danger-btn/.home-card/.book-card` 都有 `:active` 位移 2px + 阴影消失；`done-flash` 为 180ms 一次性 mark 闪烁；App.vue 有 `<Transition name="page-fade">` + `:key="route.path"`，样式为 140ms 淡入 + 4px 位移 —— src/assets/motion.spec.ts
- 计划页：勾选待办那一刻该行挂 `done-flash`；**打开页面时已完成的待办不会自己动**；取消勾选不播 —— src/views/plan-view.spec.ts
- 首页「接下来」：点「完成」后只有那一行挂 `done-flash` —— src/components/home-next.spec.ts
- 健身页：勾选一组 → 该行 `done-flash` + 右侧出现对勾（`set-done-mark`）+ `set-row-done` 划线 —— src/views/life-workout-view.spec.ts

覆盖完整性：AC-74 有 3 条 e2e（按下 / 完成 / 减少动态效果）+ 10 条单测与组件断言，无 skip / only。
既有断言未改动：计时胶囊「待结算」的 `pulse` 从 1.2s 无限循环改成 300ms×2 次有限闪烁（硬约束要求），其它动效断言与 AC-11~AC-25、AC-43~AC-45 全绿。

## 日程页三档视图（AC-75）

| AC | 测试名 | 文件 |
|---|---|---|
| AC-75 | AC-75 日程页三档视图与 7 天窗口记忆 | e2e/plan.spec.ts |

补充（组件层）：
- **ScheduleWeek**：新增 `windowStart` prop（非法值退回默认窗口「昨天 → 后五天」）、`week-range` 窗口标签、`week-prev / week-today / week-next` 三个按钮 `emit('nav', step)`、点某天同时 `emit('pick', date)` —— src/components/schedule-week.spec.ts（4 条）
- **PlanView**：`plan-view-seg` 三档切换（`plan-view-week / plan-view-day / plan-view-list`，选中态 `.on`）；`day-view` 整页 `PlanTimeline`；`list-view` 按时间排序的行（时间 / 标题 / 分类 / 状态 / 勾选 / 删除）；视图与窗口起点分别记在 `localStorage: evan-plan-view`、`evan-plan-week-start`（「回到今天」清掉后者）；点概览某天下钻到单日视图 —— src/views/plan-view.spec.ts（6 条）

行为口径：某天没有任何计划时仍显示全局空状态引导（`plan-empty`），此时三档视图主体不渲染；既有 AC-21~AC-25 全部保持绿。
