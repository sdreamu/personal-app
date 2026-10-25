# 现状盘点（阶段 A3）—— Evan的专属APP

> 本文档为**只读盘点**结果：未改动任何现有业务文件，仅新增本文件。
> 盘点时间：2026-10-24 06:30（本地时区）　git HEAD：`31dceee`（分支 main；工作区有未提交改动，见 §17.5）
> 验证方式：除静态阅读外，实际执行了 `pnpm run typecheck`、`pnpm run test`、`pnpm run test:e2e`，结果见 §16 与附录 B。
>
> **2026-10-24 更新（M1 复盘增加两栏）**：§5.2、§7.2、§12.1、§12.2 已同步为最新口径，交付记录见 §12.3。
>
> **2026-10-26 更新（本轮 M2~M5/M8/UI 改造收尾）**：剩余工作、未修问题与交接说明见 **`docs/REMAINING_WORK.md`**（含逐项改法、验收标准与已知技术债）。

---

## 1. 技术栈、依赖清单、scripts、拖拽库

### 1.1 技术栈
- 框架：Vue 3（全部 SFC 使用 `<script setup lang="ts">`），TypeScript strict（`tsconfig.json` 中 `"strict": true`）。
- 构建/开发服务器：Vite 6（`vite.config.ts`，使用 `defineConfig` from `vitest/config` 以便合并测试配置）。
- 路由：vue-router 4，**hash 模式**（`createWebHashHistory`，`src/router/index.ts`）。
- 状态管理：Pinia 3，一个模块一个 store，全部在 `src/stores/`（date/diet/home/library/modal/plan/play/review/saveStatus/settings/timer/toast/workout）。
- 本地存储：Dexie 4 封装 IndexedDB，全部在 `src/db/`。
- 单测/组件测试：Vitest 3 + @vue/test-utils + jsdom + fake-indexeddb（`src/test/setup.ts` 里 `import "fake-indexeddb/auto"`）。
- 端到端：@playwright/test（`playwright.config.ts`，`channel: "chrome"`，串行 `workers: 1`，`testDir: "e2e"`）。
- UI 库/图标字体：**没有**。图标是内联 SVG path 字符串（`src/config/nav.ts` 的 `ICONS`），字体用系统字体栈（`src/assets/main.css` 的 `body { font-family: system-ui, ... }`）。
- 无 ESLint / Prettier / Stylelint 配置或依赖（仓库内无 `.eslintrc*`、`eslint.config.*`、`.prettierrc*`）。

### 1.2 依赖清单（package.json 声明版本 / node_modules 实际安装版本）

`dependencies`：

| 包 | package.json | 实际安装 |
|---|---|---|
| dexie | ^4.0.11 | 4.4.7 |
| pinia | ^3.0.1 | 3.0.4 |
| vue | ^3.5.13 | 3.5.44 |
| vue-router | ^4.5.0 | 4.6.4 |

`devDependencies`：

| 包 | package.json | 实际安装 |
|---|---|---|
| @playwright/test | ^1.64.1 | 1.64.1 |
| @types/node | ^22.13.0 | 22.20.5 |
| @vitejs/plugin-vue | ^5.2.1 | 5.2.4 |
| @vue/test-utils | ^2.4.6 | 2.5.1 |
| fake-indexeddb | ^6.0.0 | 6.2.6 |
| jsdom | ^26.1.0 | 26.1.0 |
| typescript | ~5.8.2 | 5.8.3 |
| vite | ^6.2.0 | 6.4.5 |
| vitest | ^3.1.1 | 3.2.7 |
| vue-tsc | ^2.2.0 | 2.2.12 |

运行环境：Node v24.21.0（系统 PATH 中没有 node，实际使用 `C:\Users\admin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`，pnpm 走 `...\pnpm\bin\pnpm.mjs`）。

### 1.3 scripts（package.json）

```
dev        vite
build      vue-tsc --noEmit && vite build
test       vitest run
test:unit  vitest run
test:run   vitest run
typecheck  vue-tsc --noEmit
test:e2e   playwright test
```

注意：**没有** `check` 脚本；`test` / `test:unit` / `test:run` 三条完全等价。

### 1.4 有没有拖拽库？
**没有。**
- `package.json` / `pnpm-lock.yaml` 中搜不到 `vuedraggable`、`sortablejs`、`@dnd-kit/*`、`dragula` 等任何拖拽相关包（lock 里唯一命中 "dnd" 的是某个包的 integrity 哈希片段，不是依赖）。
- `src/` 全文搜 `draggable|sortable|dnd` 无命中。
- 排程交互为「安排时间」按钮 + 表单（`src/components/PlanFormModal.vue`），与 `DECISIONS.md`「不做鼠标拖拽」和 PRD §9「待办鼠标拖拽留到 v1.2」一致。

---

## 2. 运行方式（启动 / 构建 / 端口）

| 事项 | 现状 | 位置 |
|---|---|---|
| 开发启动 | `pnpm run dev`（即 `vite`） | `package.json` |
| 双击启动 | `start-app.bat`：优先系统 node+pnpm，缺失则回退 DSH 内置运行时，最后执行 `pnpm run dev` | `start-app.bat` |
| 构建 | `pnpm run build` = `vue-tsc --noEmit && vite build` | `package.json` |
| 端口 | `host: "127.0.0.1"`、`port: 5173`、**`strictPort: true`** | `vite.config.ts` 的 `server` |
| E2E 启动 | Playwright `webServer` 用 `process.execPath` 直接跑 `node_modules/vite/bin/vite.js`，`url: http://127.0.0.1:5173`，`reuseExistingServer: true` | `playwright.config.ts` |

- **有 strictPort**：端口被占用时 Vite 直接报错退出，不会顺延到 5174（符合 PRD §7.1）。
- 无 `preview` / `serve` / 部署脚本；`dist/` 内是 2026-10-23 的旧构建产物（`dist/index.html`、`dist/assets/`，已被 `.gitignore` 忽略）。
- 打开方式：`http://127.0.0.1:5173/`，hash 路由（如 `#/plan`）。

---

## 3. 路由列表（地址 → 页面组件文件）

定义位置：`src/router/index.ts`（`routes` 常量、`appRoutePaths` 常量）；导航结构唯一来源：`src/config/nav.ts`（`navItems`、`bottomTabs`）。

| # | 地址 | name | 页面组件文件 |
|---|---|---|---|
| 1 | `#/home` | home | `src/views/HomeView.vue` |
| 2 | `#/plan` | plan | `src/views/PlanView.vue` |
| 3 | `#/study/books` | study-books | `src/views/StudyBooksView.vue` |
| 4 | `#/study/books/:id` | study-book-detail | `src/views/StudyBookDetailView.vue` |
| 5 | `#/study/subjects` | study-subjects | `src/views/StudySubjectsView.vue` |
| 6 | `#/study/timer` | study-timer | `src/views/StudyTimerView.vue` |
| 7 | `#/life/diet` | life-diet | `src/views/LifeDietView.vue` |
| 8 | `#/life/workout` | life-workout | `src/views/LifeWorkoutView.vue` |
| 9 | `#/life/play` | life-play | `src/views/LifePlayView.vue` |
| 10 | `#/review` | review | `src/views/ReviewView.vue` |
| 11 | `#/settings` | settings | `src/views/SettingsView.vue` |

另外两条：`/` → redirect `/home`；`/:pathMatch(.*)*` → redirect `/home`。全部组件都是懒加载 `() => import(...)`。

导航入口（`navItems`）：首页、计划、学习（读书/科目/计时器）、生活（饮食/健身/娱乐）、复盘、设置 —— 共 10 个一级项，覆盖上面 11 条路由；`bottomTabs` 去掉「设置」用于手机底部导航。

顶栏日期控件（前一天 / 日期标签 / 后一天 / 回到今天）的显示范围唯一来源：`src/config/nav.ts` 的 `dateSwitchPaths` + `showsDateSwitch(path)` —— 只在 `#/plan`、`#/life/diet`、`#/life/workout`、`#/life/play`、`#/review` 显示；`#/home`、`#/study/books`、`#/study/books/:id`、`#/study/subjects`、`#/study/timer`、`#/settings` 完全不显示。快捷键 ← / → / T / Home 不受影响，仍全局生效（见 §6.3）。

---

## 4. 数据库（IndexedDB）

- **数据库名**：`evan_personal_app_db`（`src/db/schema.ts` 的 `DB_NAME`）。
- **当前 Dexie schema 版本号**：`DB_VERSION = 3`（`src/db/schema.ts`）。`src/db/database.ts` 的构造函数里保留 `this.version(1).stores(SCHEMA_V1_STORES)`（冻结的 v1 建表语句，供旧库升级），再 `this.version(2).stores(SCHEMA_V2_STORES).upgrade(upgradeToV2)`，以及 `this.version(DB_VERSION).stores(SCHEMA_V3_STORES).upgrade(upgradeToV3)`（M4 新增；v3 建表结构与 v2 相同）。
- **备份结构版本**：`SCHEMA_VERSION = 3`（与 Dexie 版本解耦）；导出写 3，导入可接受 `SUPPORTED_BACKUP_VERSIONS = [1, 2, 3]`（旧备份仍可导入，大于当前的拒绝）。
- **字段命名风格：全库 snake_case**（`daily_study_min`、`current_page`、`mit_added_to_plan`…）。TypeScript 侧同样是 snake_case 接口字段，没有做 camelCase 映射。
- 通用字段（除单行表主键外每张表都有）：`id`（UUID 字符串主键）、`created_at`(ms)、`updated_at`(ms)、`deleted_at`(ms|null，软删除)。
- `settings` 与 `active_timer` 是**单行表**：主键为 `key`（`"app"` / `"global"`），但仍携带上述通用字段（`deleted_at` 恒为 null）。
- 共 **18 张表**（`TABLE_NAMES`）。

### 4.1 表清单：名称、索引、字段

索引串即 Dexie `stores()` 声明（第一项是主键，其余是索引）。

| # | 表名 | 索引声明 | 字段（不含通用字段） |
|---|---|---|---|
| 1 | `settings` | `key` | `key:"app"`、`daily_study_min`、`daily_water_ml`、`cup_ml`、`daily_play_min`、`day_start`（"HH:mm"）、`theme`("light"/"dark"/"system"，第二轮 UI 第 2 步扩成三选一；读取端 `normalizeTheme` 把未知值兜底 `light`)、`last_backup_at`(ms\|null) |
| 2 | `plan_categories` | `id, builtin_key, deleted_at` | `name`、`builtin_key`("study"/"life"/"other"\|null) |
| 3 | `meal_types` | `id, builtin_key, deleted_at` | `name`、`builtin_key`("breakfast"/"lunch"/"dinner"/"snack"\|null) |
| 4 | `workout_types` | `id, deleted_at` | `name` |
| 5 | `plans` | `id, date, category_key, target_id, deleted_at` | `title`、`date`("YYYY-MM-DD")、`start_min`(number\|null，0~1440 偏移)、`end_min`(number\|null)、`category_key`、`category_name`(快照)、`target_type`("book"/"subject"\|null)、`target_id`、`target_title`(快照)、`done`、`done_at`、`rollover_from_date`、`is_rolled_over` |
| 6 | `books` | `id, status, deleted_at` | `title`、`author`、`total_pages`、`current_page`、`status`("want"/"reading"/"done")、`color`、`start_date`、`finish_date`、`sort_index`(v3，同 status 内升序显示，不建索引) |
| 7 | `excerpts` | `id, book_id, deleted_at` | `book_id`、`page`、`content`、`thought` |
| 8 | `subjects` | `id, archived, deleted_at` | `name`、`weekly_goal_min`、`deadline`("YYYY-MM-DD"\|null)、`archived` |
| 9 | `study_records` | `id, date, target_id, deleted_at` | `target_type`("book"/"subject")、`target_id`、`target_title`(快照)、`start_at`、`end_at`、`duration_sec`、`note`、`start_page`、`end_page`、`pages_read`、`source`("timer"/"manual"/"page_update")、`date`(逻辑日期) |
| 10 | `active_timer` | `key` | `key:"global"`、`type`("book"/"subject"/"entertainment")、`target_id`、`target_title`、`plan_id`、`mode`("stopwatch"/"countdown")、`countdown_sec`、`started_at`、`paused_total_ms`、`paused`、`pause_started_at`、`ended_at`(非空=待结算) |
| 11 | `meals` | `id, date, meal_key, deleted_at` | `date`、`meal_key`、`meal_name`(快照)、`text`、`feeling`("full"/"not_full"/"overeat"\|null) |
| 12 | `water` | `id, date, deleted_at` | `date`、`ml`(可正可负)、`at`(ms) |
| 13 | `workout_templates` | `id, weekday, deleted_at` | `weekday`(1=周一~7=周日)、`type_name`(快照)、`exercise_names`(string[]) |
| 14 | `workout_records` | `id, date, deleted_at` | `date`、`type_name`(快照)、`exercises`: `[{ name, sets: [{ weight_kg, reps, done }], note? }]`、`duration_min`(number\|null)、`done` |
| 15 | `play_records` | `id, date, deleted_at` | `date`、`content`、`minutes`(正整数)、`source`("timer"/"manual") |
| 16 | `reviews` | `id, date, deleted_at` | `date`、`rating`(1-5\|null)、`mood`(1-5\|null)、`energy`(1-5\|null)、`good`、`improve`、`mit`、`record_worthy?`、`day_summary?`、`mit_added_to_plan`(bool) |
| 17 | `exercises` | `id, deleted_at` | `name`（训练动作库；M5 起由健身页自动维护并作为「项目库」按钮来源，见 §11.4） |
| 18 | `mistakes` | `id, date, mastered, deleted_at` | `date`、`subject_name`、`question_text`、`question_images`(base64 dataURL 数组)、`correction_text`、`correction_images`、`reasons`(string[])、`difficulty`(1-5)、`mastered` |

### 4.2 表分组常量（`src/db/schema.ts`）
- `TABLE_NAMES`：18 张表，用于备份遍历。
- `V1_TABLE_NAMES`：除 `exercises`、`mistakes` 外的 16 张（v1 备份兼容用）。
- `GC_TABLES`：除 `settings`、`active_timer` 外的 **16 张**（软删除 GC 覆盖范围）。
- `DATA_TABLES`：13 张用户数据表（备份提醒判断「最早数据」用）。
- `DateTableName`：带 `date` 索引、可按逻辑日期查的表（plans/study_records/meals/water/workout_records/play_records/reviews/mistakes）。

### 4.3 迁移
- `src/db/database.ts` 的 `upgradeToV2(tx)`：只补字段、只建新表 —— `reviews` 补 `record_worthy`/`day_summary = null`，`workout_records.exercises[*]` 补 `note = null`；不删不改旧数据。
- `upgradeToV3(tx)`（M4）：给所有 `books` 回填 `sort_index` —— 按 `status` 分组、组内按 `created_at` 升序赋值 10、20、30…（给后续插入留空隙）；只补不改其它字段。
- 迁移测试：`src/db/migration.spec.ts`（用冻结的 `SCHEMA_V1_STORES` 造真实旧库再打开 v3，验证 v1→v2→v3 链式升级与 `sort_index` 回填）。

---

## 5. 服务层 / 数据访问层

### 5.1 数据访问层 `src/db/`（每个导出函数一行）

**`src/db/util.ts`**
- `uuid()`
- `nowMs()`
- `errorMessage(err)`

**`src/db/database.ts`**
- `upgradeToV2(tx)`
- `getDb()`
- `initAppDb()`
- `resetDbForTests()`（仅测试）
- `seedFirstRun(db)`
- `gcOnDb(db, nowMsValue)`
- `clearAll()`
- 另导出 `class EvanDB`、常量 `GC_GRACE_MS`、`SCHEMA_V1_STORES`、`SCHEMA_V2_STORES`。

**`src/db/crud.ts`**
- `createRecord(tableName, data)`
- `updateRecord(tableName, id, patch)`
- `getRecord(tableName, id)`
- `isAlive(record)`
- `listAlive(tableName)`
- `listAliveByDate(tableName, date)`
- `softDelete(tableName, id)`
- `undoDelete(tableName, id)`
- `gc(nowMsValue)`（`gcOnDb` 的便捷包装，应用内没有调用点，仅测试用）

**`src/db/categories.ts`**
- `isBuiltinCategory(record)`
- `listCategories(kind)`
- `addCategory(kind, name)`
- `renameCategory(kind, id, name)`
- `removeCategory(kind, id)`

**`src/db/settings.ts`**
- `getSettings()`
- `updateSettings(patch)`
- `setLastBackupAt(tsMs)`
- `getOldestDataCreatedAt()`

**`src/db/timer.ts`**
- `getActiveTimer()`
- `setActiveTimer(timer)`
- `clearActiveTimer()`

**`src/db/backup.ts`**
- `backupFileName(exportedAtMs)`
- `exportBackup()`
- `downloadBackup()`
- `validateBackup(raw)`
- `parseBackupJson(text)`
- `summarizeBackup(backup)`
- `importBackupObject(backup)`
- `importBackupFromJson(text)`

**`src/db/dateStats.ts`**（月历小点；未加入 `index.ts` barrel，`MonthCalendar.vue` 按路径直接导入）
- `datesWithData(year, month)`：只查 plans / study_records / workout_records / play_records / reviews 五张表，`deleted_at !== null` 一律忽略；返回该月 `YYYY-MM-DD` 升序去重。water / meals / excerpts 不参与。
- 另导出常量 `DATE_STAT_TABLES`（五张表的唯一口径）。

**`src/db/exportText.ts`**（纯函数，把各表整理成 Markdown 文本；M8 起由设置页「导出文本」调用，见 §14.5）
- `emptyExportSource(start, end)`
- `inRange(date, start, end)`
- `eachDateInRange(start, end)`
- `excerptDateKey(excerpt)`
- `aggregateDay(source, date)`
- `dayAggregates(source)`
- `bookActiveInRange(book, start, end)`
- `summarizeSource(source)`
- `exportText(source)`

**`src/db/exportSource.ts`**（M8 新增：文本导出的数据装载层，只读，不碰 `settings.last_backup_at`）
- `loadExportSource(start, end)`：读全部导出用表的有效记录（`deleted_at === null`）+ `settings` + `exercises`，组装 `ExportSource`；**不做区间裁剪**，区间过滤交给 `exportText()` 的 `inRange` / 按天分段（书的「区间内有活动」要看区间外的 `start_date`，裁剪会算错）。
- `getEarliestRecordDate()`：最早有记录的日期（带 `date` 的 8 张表取最小日期；摘录按 `created_at` 换算本地日期）；一条都没有返回 `null`。
- `resolveAllRange(earliest, today)`：「全部」区间 = 最早记录日 ~ 今天；无记录退回最近 30 天（`ALL_RANGE_FALLBACK_DAYS`）。
- `resolveTextRange(preset, today, earliest, custom)`：`last7` / `last30` / `all` / `custom`；自定义日期非法抛错，起止填反自动对调。
- `textExportFileName(start, end)`：`evan-text-YYYYMMDD-YYYYMMDD.md`。
- 另导出类型 `TextRangePreset`、`DateRange`。

**`src/db/schema.ts`**：只有类型/常量，无函数。
**`src/db/index.ts`**：统一出口 `export * from`（schema / util / database / crud / categories / settings / timer / backup）——**`exportText` / `exportSource` 都未加入这个 barrel**，设置页按路径直接导入 `@/db/exportText`、`@/db/exportSource`（与 `dateStats.ts` 的做法一致）。

### 5.2 业务服务层 `src/stores/`（Pinia store：store id → actions）

**`src/stores/date.ts`**（id `date`）
- `setSelected(date)`
- `prevDay()`
- `nextDay()`
- `goToday()`

**`src/stores/settings.ts`**（id `settings`；另导出 `THEME_MODES`、`DARK_SCHEME_QUERY`、`normalizeTheme(value)`、`resolveTheme(mode, prefersDark)`、`prefersDarkScheme()`、`refreshSystemPrefersDark()`、`systemPrefersDark`（响应式 ref）、`applyTheme(mode)`、`startSystemThemeWatch(getMode)`、`stopSystemThemeWatch()`）
- getters：`theme`（归一化后的 ThemeMode）、`resolvedTheme`（解析后的 light/dark）、`isDark`、`dayStartMin`、`lastBackupAt`
- `load()`（applyTheme + 注册系统主题监听，重复调用不叠加）
- `update(patch)`
- `setTheme(theme: ThemeMode)`

**`src/stores/saveStatus.ts`**（id `save-status`）
- `begin()` / `idle()` / `fail()`

**`src/stores/modal.ts`**（id `modal`）
- `open(id)` / `close(id)` / `closeTop()` / `isOpen(id)`

**`src/stores/toast.ts`**（id `toast`）
- `show(message, options)`
- `info(message)`
- `success(message)`
- `error(message)`
- `undoable(message, action)`（5 秒撤销）
- `remove(id)`

**`src/stores/plan.ts`**（id `plan`；另导出纯函数 `validateTimeRange`、`resolveTimeRange`、`isTimedPlan`、`sortPlansByOffset`、`rangesOverlap`、`layoutTimelineLanes`、`weekdayOf`、`addMitToPlan`、常量 `QUICK_DURATIONS`）
- `load(date)`
- `reload()`
- `runWithSaveStatus(fn)`
- `createPlan(date, input)`
- `updatePlan(id, input)`
- `toggleDone(plan)`
- `softDeletePlan(plan)`
- `moveToTomorrow(plan)`
- `rollOverYesterday()`
- `doRollOver()`
- `addMit()`

**`src/stores/library.ts`**（id `library`；另导出 `randomBookColor`、`expectedRemainingSeconds`、`weekDateKeys`、`weeklyBarSeconds`、`weeklyStudySeconds`、`daysUntil`、常量 `TIMING_GUARD_MESSAGE`、`BOOK_COLORS`、`MIN_ESTIMATE_TOTAL_SEC`）
- `bumpRevision()`
- `runWithSaveStatus(fn)`
- `loadBooks()`
- `createBook(input)`
- `saveBook(id, input)`
- `setBookStatus(bookId, status)`
- `markBookDone(bookId)`
- `updateBookPage(bookId, rawPage)`
- `deleteBook(bookId)`
- `loadExcerpts(bookId)`
- `createExcerpt(input)`
- `saveExcerpt(id, input)`
- `deleteExcerpt(id)`
- `loadSubjects()`
- `createSubject(input)`
- `saveSubject(id, input)`
- `setSubjectArchived(subjectId, archived)`
- `deleteSubject(subjectId)`
- `loadSubjectsStats(referenceDate)`
- `listSubjectRecords(subjectId)`
- `addManualStudyRecord(input)`
- `bookTotalStudySeconds(bookId)`

**`src/stores/timer.ts`**（id `timer`；另导出常量 `DEFAULT_COUNTDOWN_SEC=1500`、`OVERRUN_RECOVERY_THRESHOLD_MS=12h`、`MIN_SETTLE_SESSION_MS=60s`、`MIN_SETTLE_MINUTES=1`、`APP_TITLE`、`COUNTDOWN_FINISH_TITLE`；纯函数 `capEntertainmentMinutes(minutes, mode, countdownSec)`）
- `init()`
- `dispose()`
- `loadActiveTimer()`
- `clearActiveTimer()`
- `tick()`
- `detectBoundaryNeeds()`
- `continueAfterRecovery()`
- `endWithDurationOverride()`
- `startTimer(input)`
- `pauseTimer()`
- `resumeTimer()`
- `endTimer()`
- `settleStudy(payload)`
- `settleEntertainment(payload)`
- `discardTimer()`
- `settleAndStartNextRound()`
- `confirmPlanDone()`
- `dismissPlanQuestion()`
- `startTitleFlash()`
- `stopTitleFlash()`
- `resetTransientFlags()`
- `runWithSaveStatus(fn)`

**`src/stores/diet.ts`**（id `diet`；另导出 `computeTopFrequent`、`computeWaterState`、`FEELING_LABELS`、`QUICK_MEAL_LIMIT=8`）
- `loadMealData(date)`
- `reload()`
- `runWithSaveStatus(fn)`
- `addMealItem(date, mealKey, mealName, text, feeling)`
- `updateMealItem(id, patch)`
- `softDeleteMeal(meal)`
- `copyYesterdayMeal(mealKey)`
- `topFrequentItems(mealKey, limit)`
- `waterState(date)`
- `addWater(date, delta)`
- `doAddWater(date, delta)`

**`src/stores/workout.ts`**（id `workout`；另导出 `weekdayOf`、`emptySets`、`sortRecordsDesc`、`latestCompletedSets`、`defaultSetsForExercise`、`buildExercisesFromNames`、`buildDraftForDate`、`normalizeDurationMinutes`、`normalizeWeight`、`normalizeReps`、`computeDefaultDuration`、常量 `REST_TYPE_NAME="休息"`、`TEMP_WORKOUT_TYPE_NAME="临时训练"`、`DEFAULT_SET_COUNT=3`）
- `runWithSaveStatus(fn)`
- `refreshWeek()`
- `loadWeek(date)`
- `loadDay(date)`
- `load(date)`
- `listHistory()`
- `setDay(date, record, persisted)`
- `saveTemplate(weekday, patch)`
- `startTemporaryWorkout(date)`
- `ensureDay(date)`
- `getEditableRecord(date)`
- `persistExercises(record, exercises)`
- `toggleSet(date, exerciseIndex, setIndex)`
- `updateSet(date, exerciseIndex, setIndex, patch)`
- `addExercise(date, name)`
- `removeExercise(date, exerciseIndex)`
- `renameExercise(date, exerciseIndex, name)`
- `setDuration(date, minutes)`
- `finishWorkout(date?)`

**`src/stores/play.ts`**（id `play`；另导出 `validatePlayInput`、`recentContentsFrom`、`resolveCountdownMinutes`、`quotaStateFrom`、`DEFAULT_RECENT_LIMIT=8`、常量 `PLAY_QUICK_COUNTDOWN_MINUTES=[15,30,45,60]`、`MIN_PLAY_COUNTDOWN_MINUTES=1`、`MAX_PLAY_COUNTDOWN_MINUTES=1440`、`DEFAULT_PLAY_COUNTDOWN_MINUTES=30`、`QUOTA_EXHAUSTED_HINT='今日娱乐额度已用完'`）
- `loadPlayData(date)`（同时按 `logicalToday(settings.dayStartMin)` 重算 `state.todayQuota`，与选中日期无关）
- `reload()`
- `recentContents(limit)`
- `startEntertainment(name, options?)`（`options.mode: 'stopwatch' | 'countdown'`（缺省正计时）、`options.countdownMinutes`（缺省 30，非法值拒绝并 toast））
- `manualAdd(input)`
- `editPlay(id, input)`
- `softDeletePlay(record)`
- `quotaState(date)`
- `weekTotal(date)`
- `runWithSaveStatus(fn)`

**`src/stores/review.ts`**（id `review`；另导出 `formatDiffText`、`computeMetrics`、`hasReviewContent`、`summarizeReview`、`sortReviewsDesc`、`normalizeReviewPatch`、常量 `REVIEW_TEXT_DEBOUNCE_MS=300`、`REVIEW_TEXT_FIELDS`（good/improve/mit/record_worthy/day_summary）、`DAY_SUMMARY_MAX_LENGTH=100`）
- `load(date)`
- `reload()`
- `upsertReview(date, patch)`
- `doUpsert(date, patch)`
- `replaceReview(updated)`
- `debouncedSaveText(date, patch)`
- `flush()`
- `flushPending(options)`
- `runWithSaveStatus(fn)`

**`src/stores/home.ts`**（id `home`；另导出 `buildHomeHintCandidates`、`pickHomeHints`、`computeNextTimedPlan`、`summarizeTodayPlans`、`computeStudyAggregate`、`pickMainReadingBook`、`computePlayAggregate`、`computeWorkoutAggregate`）
- `load()`
- `reload()`
- `addWater()`
- `addMit()`
- `rollover()`
- `completeNext()`

### 5.3 工具与服务辅助

**`src/utils/date.ts`**（21 个纯函数）：`pad2`、`parseDayStart`、`dayStartToHHmm`、`parseTime`、`minutesOfDay`、`dateKeyOf`、`logicalDateOf`、`logicalToday`、`timeToOffset`、`offsetToTime`、`parseDateKey`、`formatDateKey`、`addDays`、`weekStart`、`weekdayCN`、`formatDateCN`、`formatDateCNWeekday`、`formatDuration`、`formatDateTimeCN`、`backupTimestamp`、`isBackupReminderDue`。

**`src/utils/image.ts`**（图片压缩成 base64 data URL，**目前只有单测调用**）：`fitWithin`、`createBrowserImageDeps`、`compressImageToDataUrl`。

**`src/utils/download.ts`**（M8 新增）：`triggerDownload(filename, content, mime = 'application/json')` —— 隐藏 `<a download>` 触发下载，`DOWNLOAD_REVOKE_DELAY_MS = 10_000` 后 `revokeObjectURL`。备份（`src/db/backup.ts`，JSON）与文本导出（`text/markdown`）共用这一份实现。

**`src/config/nav.ts`**：`navItems`、`bottomTabs`、`isActivePath`、`isGroupActive`、`isItemActive`。

**`src/composables/useEscToCloseModal.ts`**：`useEscToCloseModal()`（App.vue 调用一次，Esc 关闭 modal store 栈顶弹窗）。

---

## 6. 时钟与逻辑日期

### 6.1 取当前时间 / 计算逻辑日期用的函数

| 用途 | 函数 | 位置 |
|---|---|---|
| 取当前毫秒时间戳 | `nowMs()` → `Date.now()` | `src/db/util.ts` |
| 本地日期键 `YYYY-MM-DD` | `dateKeyOf(tsMs)` | `src/utils/date.ts` |
| 逻辑日期（给定时刻） | `logicalDateOf(tsMs, dayStartMin = 240)` = `dateKeyOf(tsMs - dayStartMin*60000)` | `src/utils/date.ts` |
| 今天的逻辑日期 | `logicalToday(dayStartMin = 240, nowMs = Date.now())` | `src/utils/date.ts` |
| `HH:mm` → 距起点偏移分钟 | `timeToOffset(hhmm, dayStartMin = 240)` | `src/utils/date.ts` |
| 偏移分钟 → `HH:mm` | `offsetToTime(offsetMin, dayStartMin = 240)` | `src/utils/date.ts` |
| `HH:mm` → 起点分钟数 | `parseDayStart(hhmm)`（只允许整点/半点） | `src/utils/date.ts` |

- 常量：`DEFAULT_DAY_START = "04:00"`、`DEFAULT_DAY_START_MIN = 240`、`MINUTES_PER_DAY = 1440`（`src/utils/date.ts`）。
- 一天起点的运行时来源：`settings.day_start`（表 `settings`，单行 `key="app"`）→ `useSettingsStore().dayStartMin` getter（`src/stores/settings.ts`，内部调用 `parseDayStart`）。
- 所有业务模块都通过这两个入口取"今天"，例如 `planStore.load()`、`homeStore.load()`、`timerStore.settleStudy()`（记录日期用 `logicalDateOf(t.started_at, dayStartMin)`）。
- 周起点：`weekStart(dateKey)` 固定周一。

### 6.2 直接调用 `Date.now()` / `new Date()` 的地方（生产代码，逐文件）

`Date.now()`：

| 文件 | 行 | 用途 |
|---|---|---|
| `src/db/util.ts` | 24 | `nowMs()` 实现（唯一的"正式"入口） |
| `src/utils/date.ts` | 75 | `logicalToday()` 的默认参数 |
| `src/utils/date.ts` | 180 | `isBackupReminderDue()` 的默认参数 |
| `src/stores/timer.ts` | 98 | `elapsedMs` getter（`nowTick` 为 0 时回退） |
| `src/stores/timer.ts` | 161 / 186 | `init()` / `tick()` 刷新 `nowTick` |
| `src/stores/timer.ts` | 243 / 274 / 286 / 308 | `startTimer` / `pauseTimer` / `resumeTimer` / `endTimer` 的时间戳 |
| `src/stores/timer.ts` | 391 / 419 / 430 / 473 | 结算后刷新 `nowTick`、`discardTimer`、`confirmPlanDone` 写 `done_at` |
| `src/stores/diet.ts` | 279 / 285 | 喝水记录 `at` 字段 |
| `src/stores/home.ts` | 207 | `nowOffsetMin` getter（"下一项"选择） |
| `src/stores/library.ts` | 285 | `addManualStudyRecord()` 的 `start_at`/`end_at` |
| `src/stores/library.ts` | 544 | `updateBookPage()` 生成 `page_update` 记录的 `start_at`/`end_at` |
| `src/stores/plan.ts` | 396 | `toggleDone()` 写 `done_at` |
| `src/stores/review.ts` | 356 | `doUpsert()` 本地拼 `updated_at` |
| `src/stores/workout.ts` | 374 | `toggleSet()` 记录首组勾选时刻 `firstCheckAtMs` |
| `src/stores/workout.ts` | 446 | `finishWorkout()` 计算默认用时 |
| `src/components/HomeHero.vue` | 16 / 34 | 首页实时时钟初值与每秒刷新 |

`new Date(...)`：

| 文件 | 行 | 用途 |
|---|---|---|
| `src/utils/date.ts` | 56 / 62 | `dateKeyOf()` / `logicalDateOf`（经 `minutesOfDay`）取本地年月日 |
| `src/utils/date.ts` | 104 / 162 / 168 | `parseDateKey` / `formatDateTimeCN` / `backupTimestamp` |
| `src/components/HomeHero.vue` | 28 | 拼 `HH:mm:ss` 显示 |
| `src/db/exportText.ts` | 257 | 文本导出里格式化时间 |

> 另外：**测试文件**里也有大量 `Date.now()` / `new Date()`（17 个 `*.spec.ts`，其中 `src/db/db.spec.ts` 12 处），属测试造数，不逐一列举。
> 结论：项目**没有**统一的"时钟注入"层 —— 只有 `nowMs()` 和 `logicalToday(dayStart, nowMs)` 支持注入参数，多数 store 直接调 `Date.now()`（单测靠 `vi.setSystemTime` 覆盖）。

### 6.3 M2 交付记录：日期月历（2026-10-24）

- `src/utils/calendar.ts`（纯函数，不读时钟、不碰数据库）：`daysInMonth`、`monthOfDateKey`、`shiftMonth`、`monthLabel`、`buildMonthGrid(year, month, { today, selected?, recordDates? })`。周一为一周起点；格子数一定是 7 的倍数（28~42），每格含 `date` / `day` / `in_month` / `is_today` / `is_selected` / `has_record`；所有“今天”由调用方注入。
- `src/db/dateStats.ts`：`datesWithData(year, month)`，只查 plans / study_records / workout_records / play_records / reviews 五张表，忽略 `deleted_at !== null`；water / meals / excerpts 不参与。
- `src/components/MonthCalendar.vue`：月历网格 + 上/下月 + 「今天」；今天与选中日分别高亮（同一天时叠加内描边区分）；有主动记录的日期格子下方带小点；点某天 emit `select`，翻月只改查看月份、不改变选中日。小点数据异步加载，快速翻月用 token 丢弃过期结果。
- `src/components/DateJumpPopover.vue`：月历放在顶部，原生 `<input type="date">` 与「今天/昨天/前天/一周前」快捷按钮完整保留在下方。
- 显示范围：见 §3 的 `dateSwitchPaths` / `showsDateSwitch`（只在 5 个日期相关页面显示；快捷键仍全局生效）。

---

## 7. 保存机制

### 7.1 弹窗表单保存（点"保存"才写入）

统一模式：`BaseModal.vue`（Teleport + 遮罩；注册进 `useModalStore`，Esc/点遮罩关闭）→ 表单在组件内维护临时 state → 点保存时 emit/调用父组件 handler → **写库成功后才关闭弹窗**，失败保留弹窗并显示错误。

| 场景 | 表单组件 | 保存入口（函数） | 落库 |
|---|---|---|---|
| 新增/编辑计划项、安排时间 | `src/components/PlanFormModal.vue` | `PlanView.vue` 的 `handleFormSave()` → `planStore.createPlan()` / `planStore.updatePlan()` | `createRecord`/`updateRecord("plans")` |
| 新增/编辑书 | `src/views/StudyBooksView.vue`（内联 `<form>`） | `save()` → `library.createBook()` / `library.saveBook()` | `createRecord`/`updateRecord("books")` |
| 新增/编辑科目 | `src/views/StudySubjectsView.vue` | `save()` → `library.createSubject()` / `library.saveSubject()` | `subjects` |
| 手动补记学习记录（科目） | 同上（`subject-manual-form`） | `saveManual()` → `library.addManualStudyRecord()` | `study_records`（source=manual） |
| 手动补记阅读记录（书） | `src/views/StudyBookDetailView.vue` | `saveManual()` → `library.addManualStudyRecord()` | `study_records`（source=manual） |
| 摘录新增/编辑 | `StudyBookDetailView.vue` | `saveExcerpt()` → `library.createExcerpt()` / `library.saveExcerpt()` | `excerpts` |
| 娱乐手动补记/编辑 | `src/components/PlayRecordList.vue` | `saveForm()` → `playStore.manualAdd()` / `playStore.editPlay()` | `play_records` |
| 计时结算 | `src/components/SettlementModal.vue` | `save()` → `timerStore.settleStudy()` / `settleEntertainment()`；`discard()` → `discardTimer()` | `study_records` / `play_records` / `active_timer` |
| 清空所有数据 | `src/components/ClearDataModal.vue` | `SettingsView.vue` 的 `confirmClear()` → `clearAll()` | 全表 clear + 重新种子 |
| 导入备份确认 | `src/views/SettingsView.vue`（`import-confirm-modal`） | `confirmImport()` | `importBackupObject()` |

错误反馈：计划弹窗把 store 抛出的异常写进 `formError` 并显示在表单底部（`external-error` prop）；其它弹窗走 store 内统一 toast + 顶部红条。

### 7.2 页内即时自动保存（含 300ms 防抖 / 切页 flush）

| 区域 | 有无 300ms 防抖 | 实现 |
|---|---|---|
| 复盘文字栏（record_worthy / day_summary / good / improve / mit） | **有** | `reviewStore.debouncedSaveText(date, patch)`：`clearTimeout` 重置 → 合并 `pendingTextPatch` → `setTimeout(flush, REVIEW_TEXT_DEBOUNCE_MS=300)`（`src/stores/review.ts`）。"一句话总结"另有 `maxlength=100` 与右下角字数计数 |
| 复盘评分/心情/精力 | 无（点击即写） | `ReviewView.vue` 的 `onRatingChange/onMoodChange/onEnergyChange` → `reviewStore.upsertReview()` |
| 设置页每日目标 | **有**（300ms） | `SettingsView.vue`：`watch(goals)` → `window.setTimeout(commitGoals, 300)`；输入框另绑 `@change="commitGoals"` 立即提交 |
| 设置页一天起点 | 无 | `watch([dayStartHour, dayStartMinute])` → `settings.update({ day_start })` |
| 设置页主题 | 无 | `setTheme()` → `settings.update({ theme })` |
| 健身（周计划、组数、重量、次数、增删动作、用时） | 无（每次操作立即写） | `workoutStore.saveTemplate()` / `persistExercises()` / `setDuration()` / `finishWorkout()` |
| 饮食（新增/编辑/删除/喝水/常吃快捷项/复制昨天） | 无 | `dietStore` 各 action 立即写 |
| 娱乐（计时、补记、编辑、删除） | 无 | `playStore` / `timerStore` |
| 计划一键动作（勾选、移到明天、顺延、删除/撤销、MIT 加入） | 无 | `planStore` / `addMitToPlan()` |

**切页前是否立即写入**：
- 复盘：切日期时 `ReviewView.vue` 的 `watch(() => dateStore.selectedDate)` **先 `await reviewStore.flush()`** 再加载新日期；组件卸载时 `onBeforeUnmount(() => { void reviewStore.flush().catch(...) })`（发出写入但不 await）。
- `reviewStore.load()` 内部也会先 `flushPending({ silent: true })`。
- 设置页：没有显式 flush；防抖 `setTimeout` 不随组件卸载清除，300ms 后仍会写库。
- 全局没有路由离开拦截弹窗（符合 PRD §2.5「不设全局路由离开拦截」）。

### 7.3 保存状态反馈

- `src/stores/saveStatus.ts`（id `save-status`）：`begin()`→保存中、`idle()`→已自动保存、`fail()`→错误。
- 每个写库 action 都用 `runWithSaveStatus(fn)` 包裹（plan/library/timer/diet/play/review/workout 各有一个同名方法）。
- 顶栏 `src/components/SaveStatus.vue`：`保存中...` / `⚠ 保存失败` / `已自动保存 ✓`。
- 失败时的全局红条：`src/App.vue` 的 `error-bar`（含"立即导出备份"按钮 → `downloadBackup()`）。
- 写库失败同时 `useToastStore().error("保存失败：...")`。

### 7.4 计时状态的写入频率
每秒只更新内存 `nowTick`（驱动秒表显示），**不每秒写库**；只有 开始 / 暂停 / 继续 / 结束 / 结算 / 丢弃 才写 `active_timer`。

---

## 8. 计时器

### 8.1 全局计时状态存在哪里
- **持久层**：IndexedDB 表 `active_timer`，单行 `key="global"`。读写函数在 `src/db/timer.ts`：`getActiveTimer()` / `setActiveTimer(timer)` / `clearActiveTimer()`。
- **内存层**：Pinia `useTimerStore`（`src/stores/timer.ts`）的 `state.timer: ActiveTimer | null`、`nowTick`（每 1000ms 由 `tick()` 刷新）。
- 启动：`src/main.ts` 调 `timerStore.init()` → `loadActiveTimer()` + 开 1s 心跳 + `detectBoundaryNeeds()`。
- 全局单实例：`startTimer()` 第一行判断 `if (this.timer !== null)` → 拒绝并 toast（有待结算 / 已有计时进行中两种文案）。
- 记录字段：`type`(book/subject/entertainment)、`target_id`（娱乐时即内容名）、`target_title`、`plan_id`、`mode`(stopwatch/countdown)、`countdown_sec`、`started_at`、`paused_total_ms`、`paused`、`pause_started_at`、`ended_at`。

### 8.2 待结算阻塞流程怎么实现
1. 点"结束" → `timerStore.endTimer()`：把 `ended_at = Date.now()` 写入 `active_timer`（若仍在暂停先合入暂停段），内存 `timer` 同步更新。
2. getter `isSettling = timer.ended_at !== null` → `src/components/SettlementModal.vue`（挂在 `App.vue`，任何路由都在）显示结算表单。
3. 防逃逸：该弹窗**不**注册进 `useModalStore`（所以全局 Esc 处理器 `useEscToCloseModal` 管不到它）；遮罩层没有 `@click.self` 关闭；只能点"保存"或"丢弃"。
4. 阻塞新计时：`startTimer()` 见到 `timer !== null` 直接拒绝（学习与娱乐共用）。
5. 顶栏胶囊：`TimerCapsule.vue` 在 `isSettling` 时显示 `⏱ 待结算（点击处理）` 并加 `.settling` 动画；点击跳 `targetRoute`（学习 `/study/timer`、娱乐 `/life/play`）。
6. 刷新/关掉重开：`init()` → `loadActiveTimer()` 读回同一行（`ended_at` 非空）→ 弹窗自动重现，时长按时间戳重算。
7. 不足 1 分钟：getter `isUnderOneMinute`（`elapsedMs < MIN_SETTLE_SESSION_MS=60_000`）→ 弹窗先显示"计时过短，是否直接丢弃？"。
8. 超过 12 小时：`needsRecovery`（`recoveryPending`，阈值 `OVERRUN_RECOVERY_THRESHOLD_MS`）→ 弹窗给"继续计时 / 结束并手动修改时长 / 直接丢弃"。
9. 计划联动：`settleStudy()` 完成后若计时来自计划（`plan_id` 非空）→ `pendingPlanQuestion`，弹窗问"是否将关联的计划时间块标记为完成？"→ `confirmPlanDone()` 写 `plans.done/done_at`。

### 8.3 倒计时模式是否已实现
**已实现（学习计时）。**
- 入口：`src/views/StudyTimerView.vue` 的"模式"分段按钮（`mode-stopwatch` / `mode-countdown`），倒计时分钟输入（默认 25，范围 1~1440），`startTimer({ mode: "countdown", countdownSec: 分钟*60 })`。
- 状态：`active_timer.mode`、`active_timer.countdown_sec`；getter `remainingMs` / `remainingSec`（向上取整）/ `isCountdownFinished`。
- 到点：`detectBoundaryNeeds()` 置 `countdownFinishedPrompt = true` 并 `startTitleFlash()`（600ms 在 `⏰ 时间到！` 与 `Evan的专属APP` 间切换 `document.title`）；弹窗"再来一轮"→ `settleAndStartNextRound()`（自动结算本轮 + 同参数立刻开下一轮），"结束"→ `endTimer()`。
- **娱乐计时也已支持倒计时（M3）**：`playStore.startEntertainment(name, { mode: 'countdown', countdownMinutes })` 透传 `mode` / `countdownSec`；到点复用同一套 `detectBoundaryNeeds()` 提示（不区分类型）。
- 娱乐倒计时结算封顶（用户拍板）：`settleEntertainment()` 用 `capEntertainmentMinutes()` 把分钟数封顶在设定时长（`ceil(countdown_sec/60)`，最少 1 分钟），即 30 分钟倒计时挂到 45 分钟才结束仍记 30 分钟；正计时与 `settleStudy()` 不看这个封顶。

### 8.4 娱乐页（`#/life/play`）现在的计时控件长什么样
文件：`src/components/PlayTimerPanel.vue`（页面 `src/views/LifePlayView.vue` 只是 `<PlayTimerPanel />` + `<PlayRecordList />`）。

| 状态 | 界面 |
|---|---|
| 无计时 | 标题"娱乐计时" → "内容名称"输入框（placeholder `如：塞尔达传说`）→ "最近使用：" 标签按钮行（点一下填入输入框）→ **"模式"分段按钮（`play-mode-stopwatch` 正计时 / `play-mode-countdown` 倒计时）** → 倒计时时展开：快捷 `15/30/45/60 分钟` 按钮 + "倒计时分钟数（1~1440）"输入框 + "按剩余额度（N 分钟）"按钮（N = `playStore.todayQuota.remaining`，额度 0 时 disabled 并显示"今日娱乐额度已用完"）→ "开始"按钮 |
| 有娱乐计时 | 居中一行：`娱乐` 徽章 + 名称 + **模式徽章（`正计时` / `倒计时`）** + 状态徽章（`计时中` / `已暂停` / `待结算`）→ 48px 大钟面（倒计时进行中显示剩余时间，其余显示已用时间，均 `HH:MM:SS`）→ 按钮（暂停 / 继续 / 结束） |
| 待结算 | 上面加一行提示"待结算：请在上方弹窗中保存或丢弃本次计时。" |
| 有其它计时 | 一行提示"当前有其他计时进行中，娱乐计时暂不可用。" |

特点：内容名称仍为必填（空名称点"开始"→ toast `请输入娱乐内容名称`，沿用原有提示）；没有内联结算表单（全部交给全局 `SettlementModal`）；最近使用标签来自 `playStore.recent`（`recentContentsFrom()` 按 `created_at` 倒序去重取前 8）。

历史记录（`PlayRecordList.vue`）每一行有"再来一轮"（`play-again-btn`）：emit 内容名称 + 30 分钟 → `LifePlayView` 的 `prefill` state 传给 `PlayTimerPanel` 的 `prefill` prop → 面板预填名称、切到倒计时、分钟填 30，**不自动开始**，用户再点"开始"才计时。

### 8.5 M3 交付记录：娱乐页倒计时（2026-10-24）

- `src/stores/play.ts`：`startEntertainment(name, options?)` 支持 `{ mode, countdownMinutes }`（缺省正计时 / 30 分钟）；新增纯函数 `resolveCountdownMinutes()`（整数 1~1440，0 / 负数 / 小数 / 超上限 / 空值返回 `{ ok:false, reason }`）与 `quotaStateFrom()`；`loadPlayData()` 额外按 `logicalToday(settings.dayStartMin)` 重算 `todayQuota`（供"按剩余额度"，与选中日期所在周无关）。
- `src/stores/timer.ts`：新增纯函数 `capEntertainmentMinutes(minutes, mode, countdownSec)`，`settleEntertainment()` 用它封顶——倒计时默认结算 `min(实际用时, 设定时长)` 并向上取整到分钟、最少 1 分钟；**`settleStudy()` 与正计时结算未改**。`settleAndStartNextRound()` 未改（原本就保留 entertainment 的 type/mode/countdown_sec）。
- `src/components/PlayTimerPanel.vue`：模式分段按钮 + 快捷 15/30/45/60 + 自定义分钟 + "按剩余额度（N 分钟）"（额度 0 时 disabled + "今日娱乐额度已用完"）；运行中显示模式徽章与剩余时间；接收 `prefill` prop（`prefill-applied` 回抛给父页清空）；娱乐计时结束/丢弃后自动 `playStore.reload()` 刷新记录与额度。
- `src/components/PlayRecordList.vue`：每行新增"再来一轮"（emit `play-again`，内容名称 + `DEFAULT_PLAY_COUNTDOWN_MINUTES=30`）。
- `src/views/LifePlayView.vue`：持有 `prefill` state，把"再来一轮"接到计时面板。
- `src/components/SettlementModal.vue`（coordinator 授权放开）：娱乐计时的"折算分钟数"预填改为复用 `capEntertainmentMinutes()`（预填值 == 落库值）：娱乐倒计时 30 分钟挂到 45 分钟 → 预填 30 而不是 45；娱乐正计时仍按实际时长向上取整；学习计时（含学习倒计时超时）完全不经过这条分支，"本次有效时长"仍如实显示实际值。

---

## 9. 计划页

### 9.1 时间轴怎么渲染
组件：`src/components/PlanTimeline.vue`（纯展示，`props: plans`、`dayStartMin`）。
- 左侧 24 个小时标签（`hours = 0..23`，文字用 `offsetToTime(h*60, dayStartMin)`，行高固定 44px）。
- 右侧轨道 `height: calc(24 * 44px)`；每小时一条虚线 `hour-line`（`top = h/24*100%`）。
- 时间块绝对定位：`top = startMin/1440*100%`、`height = (endMin-startMin)/1440*100%`、`left = lane*(100/laneCount)%`、`width = 100/laneCount%`（`blockStyle()`）。
- 布局算法在 `src/stores/plan.ts` 的 `layoutTimelineLanes(plans)`：先 `sortPlansByOffset()` 过滤无时间待办并按 `start_min`（同开始按 `end_min`）升序，再把"重叠链"聚成簇，簇内贪心分配泳道，返回 `{ plan, startMin, endMin, lane, laneCount, hasOverlap }`。
- 重叠：`hasOverlap` 为真时块右上角显示 `⚠`（`data-test="overlap-icon"`），块并排不叠加；**不阻止保存**。
- 块内容：`HH:mm-HH:mm`、标题、完成态（`.done` 划线+绿底）、"开始"按钮（未完成且 `target_type/target_id` 非空时才显示）。
- 说明：`rangesOverlap()` 也导出了，但生产代码没用到（只有单测），实际重叠判定靠上面的聚簇算法。

### 9.2 "安排时间"的具体实现
- 入口：`src/views/PlanView.vue` 待办项的 `todo-schedule` 按钮（仅未完成项显示）→ `openEdit(plan)` 打开同一个 `PlanFormModal`（编辑态）。
- 时间输入：两个 `<input type="time">`（`plan-form-start` / `plan-form-end`，`HH:mm`，可空）。
- 快捷时长：`QUICK_DURATIONS = [30, 45, 60, 90]`（`src/stores/plan.ts`）→ `PlanFormModal.applyDuration(minutes)`：`startMin = timeToOffset(start, dayStartMin)`，`endMin = startMin + minutes`，超过 1440 报"时间块不得跨越一天起点边界"。
- 提交：`save()` → `parseTimes()` → `resolveTimeRange(startHhmm, endHhmm, dayStartMin)`（同文件）：`endMin <= startMin` 时视为次日 `+1440`；`endMin > 1440` 拒绝；返回偏移分钟。
- 写库：`PlanView.handleFormSave()` → `planStore.updatePlan(id, payload)` → `planPatchFrom()`（`src/stores/plan.ts`）写 `start_min` / `end_min`（附 `category_key/category_name/target_*` 快照）。清空起止时间 = 变回普通待办（`start_min`/`end_min` 均为 null）。

### 9.3 移到明天
`src/stores/plan.ts` 的 `moveToTomorrow(plan)`：`if (plan.done) return;` → `updateRecord("plans", plan.id, { date: addDays(plan.date, 1) })` → `reload()`。入口 `PlanView.vue` 的 `todo-tomorrow` 按钮（未完成项可见）。语义是"直接改这一条的日期"，不产生新记录。

### 9.4 一键顺延昨日未完成（是否克隆 + 标记 is_rolled_over）
**是：在「今天」克隆生成新待办，同时把昨天的原记录标 `is_rolled_over = true`（原记录留在昨天）。**
- 入口：`PlanView.vue` 的 `rollover-btn`（文案「一键顺延昨日未完成（N）」）→ `planStore.rollOverYesterday()`；首页 P3 提示也走 `homeStore.rollover()` → 同一个 action。
- 实现：`src/stores/plan.ts` 的 `doRollOver()`：
  - 候选 = `listAliveByDate("plans", 昨天).filter(p => !p.done && !p.is_rolled_over)`（昨天 = `logicalToday(dayStartMin) - 1`）；
  - 逐条：`updateRecord("plans", original.id, { is_rolled_over: true })`（**原记录留在昨天，保证昨天复盘的分母不变**）+ `createRecord("plans", { title, date: 今天, start_min: null, end_min: null, category_key, category_name, target_type, target_id, target_title, done: false, done_at: null, rollover_from_date: 昨天, is_rolled_over: false })`；
  - 完成后 toast「已把 N 项昨日未完成顺延到今天」；返回条数。
- 防连点：模块级 `rolloverInFlight` promise 复用（`rollOverYesterday()`）。
- 计数展示：`planStore.load()` 里 `rolloverCount = 昨天未完成且未顺延的条数`，为 0 时按钮禁用。
- 相关但不同：昨日复盘 MIT 加入今日待办由 `addMitToPlan()`（同文件模块级函数，模块级 `mitInFlight` 防连点）实现 —— 生成无时间待办（分类固定 `other/其他`）并把 `reviews.mit_added_to_plan` 置 true。

### 9.5 计划页其它现状
- 顶部：完成进度 `doneCount/totalCount` + 进度条、`今日训练：<类型> [去训练]`（只读，来自 `workout_templates` 按今天星期几取）、昨日 MIT 行、顺延按钮。
- 左右两栏：左 `PlanTimeline`（时间块），右待办清单（未完成在前、完成在后）。
- 空状态：`EmptyState`（"这一天还没有计划" + 新增按钮）。
- 快捷键：`N` 新建（`PlanView.onKeydown`，输入框/弹窗打开时不响应）。

---

## 10. 读书

### 10.1 书架现在是标签页还是三栏并排？
**三栏并排。**
- 文件：`src/views/StudyBooksView.vue`。模板 `.books-columns` 内 `v-for` 渲染三列（想读 / 在读 / 读完），每列标题带数量、下面是 `BookCard` 或 `EmptyState`。
- 样式：`.books-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }` —— 固定三列，没有 Tab 切换、也没有窄屏折行媒体查询。
- 没有全局 Tab 状态；列由 `wantBooks / readingBooks / doneBooks` 三个 computed 按 `book.status` 过滤，各列再用 `sortColumn`（`src/utils/dragSort.ts`）按 `sort_index` 升序显示。
- **M4 起支持拖动**（原生 HTML5 draggable，零新依赖）：跨栏拖动改状态、同栏上下拖动改顺序，见 §10.3。

### 10.2 手动改页码时如何生成 page_update 学习记录
- 入口：`src/views/StudyBookDetailView.vue` 的"更新当前页"输入框（`page-input`）+ `page-save` 按钮（或回车）→ `savePage()`。
- 业务：`libraryStore.updateBookPage(bookId, rawPage)`（`src/stores/library.ts`）：
  1. 校验：`Number.isInteger`、`>= 0`、`<= total_pages`；失败返回 `{ ok: false, reason }`。
  2. `oldPage = book.current_page`；若 `newPage > oldPage` → `createRecord("study_records", { target_type: "book", target_id: book.id, target_title: book.title, start_at: now, end_at: now, duration_sec: 0, note: null, start_page: oldPage, end_page: newPage, pages_read: newPage - oldPage, source: "page_update", date: useDateStore().selectedDate })`。
  3. 页码有变化 → `updateRecord("books", bookId, { current_page: newPage })`。
  4. 返回 `{ ok: true, confirmDone: newPage === book.total_pages && book.status !== "done" }`；详情页据此弹"标记为读完？"（确认 → `library.markBookDone()` 写 `status="done"` + `finish_date=selectedDate`）。
- 注意两点：
  - 记录的 `date` 取**顶栏当前选中日期** `dateStore.selectedDate`，不是 `logicalToday()`（回看历史日期时会把增量写到那天）。
  - 书架卡片（`BookCard.vue`）**没有**改页码控件，只有详情页能改（与 PRD §5.2「在书架或书详情页」不完全一致）。

### 10.3 M4 交付记录：书架拖动（2026-10-25）
- **交互**：`.books-columns` 三栏接收 drop；书卡 `BookCard.vue` 加 `draggable="true"` 与 `dragstart/dragend`（用 `DataTransfer` 写 book.id），既有按钮/下拉/点击入口一律保留。视图 `@dragover.prevent` + `@drop`（落在卡片=插到该卡之前，落在栏空白=追加列尾），把落点换算成「目标列移除被拖动书之后」的下标交给 store。
- **纯函数** `src/utils/dragSort.ts`：`compareBySortIndex / sortColumn / clampIndex / orderedIdsAfterMove / assignSortIndexes / nextSortIndex`，负责「(fromId, toStatus, toIndex) → 新的有序 id 列表」与 sort_index 的 10/20/30 分配。
- **store 动作**（`src/stores/library.ts`）：
  - `createBook`：`sort_index = 该 status 列现有最大值 + 10`（空列 10）。
  - `reorder(bookId, toIndex)`：同栏重排，整列按 10/20/30 重分配，单事务写回；幂等。
  - `moveBook(bookId, toStatus, toIndex)`：跨栏改状态 + 落点排序。拖到 `done` 时 `current_page = total_pages`、`finish_date = 逻辑今天`，**直接 updateRecord，绝不走 updateBookPage、绝不生成 source='page_update' 学习记录**；拖出 `done` 时 `finish_date = null`、`current_page` 保持不动；拖到 `reading` 时 `start_date` 为空才补 `logicalToday(settingsStore.dayStartMin)`。「今天」用 `logicalToday(settingsStore.dayStartMin)`。
- **数据**：`books.sort_index`（v3 新增，Dexie DB_VERSION 2→3，备份 SCHEMA_VERSION 2→3）；备份导入 `normalizeRow` 给缺失的 books 按出现顺序补 `sort_index`（10、20…）。详见 §4.3。
- **测试实跑**：
  - `run typecheck`：0 错。
  - `run test`：**434 passed / 51 files**（原 414，新增 dragSort/迁移/备份/拖动等 20 条）。
  - 全量 e2e（独占）：**68 passed / 0 failed**（原 64，新增 `e2e/books-drag.spec.ts` 4 条）；拖动用例另用 `--repeat-each=3`（12 次）复跑全绿，采用 DataTransfer 事件注入而非 Playwright 原生 dragAndDrop 以保证稳定。

---

## 11. 健身

### 11.1 周计划模板
- 表：`workout_templates`；字段 `weekday`(1=周一~7=周日)、`type_name`（类型名快照）、`exercise_names`（string[]）。一个星期几最多一条（按 weekday 查找更新）。
- 编辑器：`src/components/WorkoutWeekPlanEditor.vue`：7 行（周一~周日），每行 `<select>`（选项 = 内置"休息" + `workout_types` 里的类型，若历史类型已被删则临时插回当前值）+ 动作 chip 列表（改名/删除）+ 逗号分隔批量添加。
- 保存方式：**即时自动保存** —— 每次下拉变更/增删改动作都 `emit("save", weekday, patch)` → `LifeWorkoutView.handleTemplateSave()` → `workoutStore.saveTemplate(weekday, patch)`：
  - 校验 weekday 1~7、类型必须存在于 `workout_types`；
  - `type_name === "休息"` 时清空 `exercise_names`；动作去重 `dedupeNames()`；
  - 已有模板 → `updateRecord("workout_templates", id, patch)`；没有 → `createRecord(...)`；然后 `refreshWeek()`。
  - **M5 项目库自动维护**：保存后把 `exercise_names` 逐个 `upsertLibraryExercise()` 进 `exercises` 表（同名去重、软删除行视为不存在即新建）。
- 当天训练若尚未落库（`dayPersisted=false`）且改的是今天，会顺带 `loadDay()` 刷新草稿。

### 11.2 当天训练记录
- 表：`workout_records`；字段 `date`、`type_name`、`exercises: [{ name, sets: [{ weight_kg, reps, done }], note? }]`、`duration_min`、`done`。一天最多一条（`listAliveByDate(date)[0]`）。
- 载入：`workoutStore.load(date)` → `loadWeek()` + `loadDay()`；`loadDay()` 若当天已有记录直接用；否则 `buildDraftForDate(date, week, history)`：按 `weekdayOf(date)` 找模板 → 休息日返回 `null`（页面显示"今天休息"+"开始临时训练"）；非休息日生成**内存草稿**（不落库）。
- 默认组：`defaultSetsForExercise(name, history)` → `latestCompletedSets()` 找"最近一次已完成记录"里同名动作的 `weight_kg/reps`，`done` 重置为 false；没历史用 `emptySets(3)` 三组空值。
- 首次落库：第一次勾选/改值/加动作时 `getEditableRecord()` → `ensureDay()` → 草稿 `createRecord("workout_records", {...})`（或直接新建 `type_name="临时训练"` 的空记录）。
- 保存方式：**即时自动保存**，每次交互一条 `updateRecord("workout_records", id, { exercises })`（`persistExercises()`，整组数组覆盖写）；用时手改 `setDuration()`；完成 `finishWorkout()` 写 `done: true` + `duration_min`（未手填则 `computeDefaultDuration(firstCheckAtMs, now)`：首组勾选到完成的分钟差，<1 分钟或没勾过则为 30）。
- **M5 动作备注**：每条动作可有一条 `note`（`string | null`）。写入走 `setExerciseNote(date, exerciseIndex, note)` → `persistExercises()`（trim 后空存 `null`，即时落库）；`cloneExercises()` 会保留 `note`，所以勾选/改重量/次数后备注不会丢。备注**不影响**组数、勾选与默认用时（仍按首勾到完成的差值计算）。
- **M5 项目库自动维护**：`addExercise`、`renameExercise`、`saveTemplate` 都会把动作名 `upsertLibraryExercise()` 进 `exercises`（同名去重、软删除行视为不存在即新建一条有效行）；重复添加同名动作是幂等 no-op，不产生重复行。

### 11.3 历史记录
- 数据来源：**同一个 `workout_records` 表**（不是单独的归档表）。`workoutStore.listHistory()` → `sortRecordsDesc()`（日期倒序，同日按 `updated_at` 倒序），存 `state.history`。
- 展示：`src/components/WorkoutHistory.vue` 每条一个 `<details>`：日期+星期、类型、已完成/进行中、用时；展开后复用 `WorkoutDay.vue`（`mode="history"`）可直接编辑（勾组、改重量次数、增删改动作、改用时）。
- 保存：展开后的编辑同样走 `workoutStore` 的 `toggleSet/updateSet/addExercise/removeExercise/renameExercise/setDuration`，按 `record.date` 定位记录，立即写库。
- 动作自动补全：`exerciseNames` getter 从 `state.history` 收集去重 → `WorkoutDay.vue` 的 `<datalist>`。
- **M5 项目库区块（`ExerciseLibrary.vue`）**：挂在 `WorkoutDay.vue` 当天编辑区（`mode==='day'`）下方。按钮列表来自 `exercises` 表，经 `libraryNames` getter 用纯函数 `recentOrder()` 排序 —— **最近使用优先**（由 `workout_records` 历史推导每个动作最后一次出现的 `updated_at`），无历史的排后面，再按名字升序。点一下即 `emit('add-exercise', name)` → `addExercise()`（重复点击幂等）；项目库为空时显示简短空状态提示。

### 11.4 M5 交付记录：健身项目库与快速记录（2026-10-25）

| 项 | 内容 |
|---|---|
| 数据 | **未改表结构、未改 `DB_VERSION`（仍为 3）/ `SCHEMA_VERSION`（仍为 3）**，只使用已存在的 `exercises` 表与训练记录里早已存在的 `note` 字段 |
| Store | `workout.ts` 新增纯函数 `lastUsedAtByName()` / `recentOrder()`；新增 state `exerciseLibrary`、getter `libraryNames`、action `refreshLibrary()` / `upsertLibraryExercise()` / `setExerciseNote()`；`refreshWeek()` 一并载入 `exercises`；`cloneExercises()` 改为保留 `note` |
| 项目库自动维护 | `addExercise` / `renameExercise` / `saveTemplate` 触发 `upsertLibraryExercise()`：同名（trim 后）已有有效行不新增，**软删除行视为不存在即新建一条有效行**（不复活旧行）；重复添加同名动作不产生重复行、不删除用户已有行 |
| 快速选择 | 新增 `src/components/ExerciseLibrary.vue`（项目库区块，挂在 `WorkoutDay.vue` 当天编辑区下方）；按钮排序=最近使用优先（历史推导 `updated_at`）→ 无历史靠后 → 名字升序；点一下即 `addExercise`（幂等）；空时显示空状态 |
| 动作备注 | `WorkoutDay.vue` 每条动作支持一条备注（`note`）：点「备注」编辑、blur/回车即时保存、清空存 `null`；展示在动作名下方，为空不占位；写入走 `persistExercises` 同一条落库路径 |
| 接线 | `src/views/LifeWorkoutView.vue` 向 `WorkoutDay` 传 `:library` 并监听 `@set-note`；既有能力（自由输入、历史默认组数、勾选、改名、删除、时长、完成训练）与默认用时语义全部保留 |
| 测试 | `src/stores/workout.spec.ts`（排序纯函数 / upsert 去重与软删除 / setExerciseNote 落库与清空 / 备注不影响默认用时 / libraryNames 顺序）、`src/components/exercise-library.spec.ts`（渲染/点选/空状态）、`src/views/life-workout-view.spec.ts`（项目库点击加入与幂等、备注编辑与刷新保留/清空）、`e2e/workout-library.spec.ts`（AC-64 / AC-65） |

本次实跑：`run typecheck` 0 错误；`run test` **52 文件 / 448 用例全部通过**（原 51 文件 / 434 用例，M5 新增 14 条）；全量 e2e（独占）**70 passed / 0 failed**（原 68 passed，新增 AC-64 / AC-65 两条）。


---

## 12. 复盘

### 12.1 现有字段名
表 `reviews`（`src/db/schema.ts` 的 `interface Review`）：

| 中文 | 字段名 | 类型 |
|---|---|---|
| 逻辑日期 | `date` | `"YYYY-MM-DD"` |
| 今日评分（1~5 星） | `rating` | `number \| null` |
| 今日心情（1~5 表情） | `mood` | `number \| null` |
| 今日精力（1~5 能量格） | `energy` | `number \| null` |
| 做得好的 | `good` | `string \| null` |
| 要改进的 | `improve` | `string \| null` |
| 明天最重要的一件事 | `mit` | `string \| null` |
| 最重要一件事是否已加入次日待办 | `mit_added_to_plan` | `boolean`（默认 false） |
| 今天一件值得记录的事（v2 新增；M1 起有 UI，多行文本框） | `record_worthy` | `string \| null \| undefined` |
| 一句话总结今天（v2 新增；M1 起有 UI，单行文本框，限 100 字） | `day_summary` | `string \| null \| undefined` |

写入接口：`reviewStore.upsertReview(date, patch)`（按 date upsert；`ReviewPatch` 现已包含 `rating/mood/energy/good/improve/mit/record_worthy/day_summary/mit_added_to_plan`）。新增两栏与其他文字栏一样走 `debouncedSaveText`（300ms 防抖，切日期/卸载前 flush）；`normalizeReviewPatch` 统一 trim（空白存 null），并把 `day_summary` 截到 `DAY_SUMMARY_MAX_LENGTH=100`。

### 12.2 "已复盘"状态是怎么判断的
**M1 起已统一为单一口径（`hasReviewContent`），此前"两套标准"的问题已修复。**

- 判定函数：`src/stores/review.ts` 的 `hasReviewContent(review)` —— `rating/mood/energy` 任一非 null，或 `good/improve/mit/record_worthy/day_summary` 任一 trim 后非空即算已复盘（只填"值得记录"或"一句话总结"也算）。
- 使用方（同一口径）：
  1. 复盘页历史列表 `historyItems` 与最近 14 天灰点 `last14Dots`；
  2. 首页提示条 P2（"昨天还没复盘"）：`src/stores/home.ts` 的 `load()` 里 `this.yesterdayReviewed = reviews.some(hasReviewContent)` —— **不再仅凭存在空记录行判定**（点了评分又取消留下的全空行不算已复盘）。
- 历史列表的一句话摘要（`summarizeReview`）：优先 `day_summary`；为空时取"做得好的"首行前 30 字；都为空显示"（无摘要）"。

补充：`mit_added_to_plan` 由 `addMitToPlan()`（`src/stores/plan.ts`）在把 MIT 加进今日待办时置 true；首页/计划页据此把按钮切成"已加入今日待办 ✓"并禁用。

### 12.3 M1 交付记录（复盘增加两栏，2026-10-24）

| 项 | 内容 |
|---|---|
| 数据 | **未改表结构、未改 `DB_VERSION`（仍为 2）**，只使用已存在的 `record_worthy`、`day_summary` |
| Store | `ReviewPatch` 增加 `record_worthy?: string \| null`、`day_summary?: string \| null`；两字段并入 `REVIEW_TEXT_FIELDS`，沿用 `debouncedSaveText` 的 300ms 防抖与 `flush`（切日期/卸载前立即写入）；新增常量 `DAY_SUMMARY_MAX_LENGTH=100` |
| 界面 | `src/views/ReviewView.vue` 在三栏文字**上方**新增「今天一件值得记录的事」（多行 textarea）与「一句话总结今天」（单行 input，`maxlength=100`，右下角 `n/100` 字数计数）；输入即触发自动保存，顶栏 `SaveStatus` 显示「已自动保存 ✓」 |
| 联动 | `hasReviewContent` 纳入两个新字段；`summarizeReview` 改为优先 `day_summary`、回退"做得好的"前 30 字；`homeStore.load()` 改用 `hasReviewContent` 判断昨日是否已复盘 |
| 测试 | `src/stores/review.spec.ts`（新增两栏防抖保存 / `hasReviewContent` / 摘要回退 / 100 字截断）、`src/stores/home.spec.ts`（空记录行不算已复盘）、`src/views/review-view.spec.ts`（两栏渲染与字数计数） |

本次实跑：`pnpm run typecheck` 0 错误；`pnpm run test` 46 个文件 / 355 个用例全部通过。

---

## 13. 软删除与垃圾回收

### 13.1 `deleted_at` 软删除
- 字段：**18 张表全部**都有 `deleted_at: number | null`（定义在 `src/db/schema.ts` 的 `BaseFields`）。
- 写：`src/db/crud.ts` 的 `softDelete(tableName, id)` → `updateRecord(tableName, id, { deleted_at: nowMs() })`；`undoDelete(tableName, id)` → `deleted_at: null`。
- 读：`listAlive(tableName)` / `listAliveByDate(tableName, date)` 统一 `.filter(record => record.deleted_at === null)`；`isAlive(record)` 单条判断。
- 调用点（业务层）：
  - `planStore.softDeletePlan()` → `softDelete("plans", id)`
  - `libraryStore.deleteBook()` → 级联 `softDelete("books")` + 该书所有 `excerpts`
  - `libraryStore.deleteExcerpt()` / `deleteSubject()` → `excerpts` / `subjects`
  - `dietStore.softDeleteMeal()` → `meals`
  - `playStore.softDeletePlay()` → `play_records`
  - `CategoryManager.vue` 的 `handleRemove()` → `removeCategory()` → `softDelete("plan_categories"/"meal_types"/"workout_types")`

### 13.2 "5 秒撤销"在哪里实现
- `src/stores/toast.ts` 的 `undoable(message, action)` → `show(message, { undo: { label: "撤销", action } })`；`show()` 里 `window.setTimeout(remove, options.undo ? 5000 : 4000)`。
- UI：`src/components/ToastStack.vue`（`.toast-stack` 固定右上角 `top:64px`），渲染"撤销"按钮 → 点击执行 `action()`（即各 store 里的 `undoDelete(...)` + `reload()`）。
- 各删除动作都是「软删除 + toast.undoable」，例如 `planStore.softDeletePlan()` / `libraryStore.deleteBook()` / `dietStore.softDeleteMeal()` / `playStore.softDeletePlay()`。

### 13.3 "物理清除 1 小时前已删记录"在哪里实现、覆盖哪些表
- 实现：`src/db/database.ts` 的 `gcOnDb(db, nowMsValue)` —— `threshold = nowMs - GC_GRACE_MS`（`GC_GRACE_MS = 60*60*1000`），对 `GC_TABLES` 逐表执行 `table.where("deleted_at").below(threshold).delete()`，返回删除总数。
- 触发点：
  1. **启动**：`getDb()` → `openAndPrepare()` 里 `await gcOnDb(db, nowMs())`（在 `seedFirstRun()` 之后、`requestPersistentStorage()` 之前）。
  2. **导出前**：`src/db/backup.ts` 的 `exportBackup()` 第一行 `await gcOnDb(db, nowMs())`。
  3. `src/db/crud.ts` 的 `gc(nowMsValue)` 是同一个函数的包装，但**应用内没有调用点**（仅测试）。
- 覆盖表：`GC_TABLES` = **16 张**（18 张去掉 `settings`、`active_timer`）：`plan_categories`、`meal_types`、`workout_types`、`plans`、`books`、`excerpts`、`subjects`、`study_records`、`meals`、`water`、`workout_templates`、`workout_records`、`play_records`、`reviews`、`exercises`、`mistakes`。
- 备份/导出本身也只导出 `deleted_at === null` 的行，所以备份文件里不会反复携带已删数据。

---

## 14. 备份与恢复

### 14.1 导出备份
- 入口：设置页"数据管理"里的"导出备份"按钮（`data-test="export-backup"`）→ `SettingsView.handleExport()` → `downloadBackup()`。
- 遍历方式：`exportBackup()`（`src/db/backup.ts`）**遍历 `TABLE_NAMES` 全部 18 张表**（不是写死的表清单），逐表 `filter(r => r.deleted_at === null).toArray()`。
- 结构：`{ app: "evan-app", schema_version: 2, exported_at: <ms>, tables: { <表名>: [记录...] } }`。
- 文件名：`evan-backup-YYYYMMDD-HHmm.json`（`backupFileName()` + `backupTimestamp()`）。
- 下载：`triggerDownload()` 用 `Blob` + `URL.createObjectURL` + 临时 `<a download>` 点击（10s 后 `revokeObjectURL`）。
- 顺带写 `settings.last_backup_at = exported_at`（`setLastBackupAt()`），设置页显示"最近备份时间"，首页 P4 提示用 `isBackupReminderDue()`（超过 7 天）。

### 14.2 导入如何校验 app 标识与 schema_version
- `parseBackupJson(text)`：`JSON.parse` 失败 → `JSON 格式错误，无法解析`。
- `validateBackup(raw)`（`src/db/backup.ts`）依次校验：
  1. 必须是对象（非 null/数组）→ 否则"文件不是有效的备份对象"；
  2. **`app !== "evan-app"` 直接拒绝**（"应用标识不匹配（需要 evan-app）"）；
  3. **`schema_version` 必须是数字且在 `SUPPORTED_BACKUP_VERSIONS = [1, 2, 3]` 内**（"结构版本不匹配（需要 1、2 或 3）"；v3 起 books 有 `sort_index`）；
  4. `exported_at` 必须是有限数字；
  5. `tables` 必须是对象；v1 备份允许缺 `exercises`/`mistakes`（视为空表），其余表必须存在且是数组；
  6. 每条记录必须是对象且有字符串 `id`；
  7. 不允许出现未知表名（"包含未知数据表：…"）。
- 校验通过后 `normalizeBackup()` 补齐 v2 默认值：`reviews.record_worthy/day_summary = null`、`workout_records.exercises[*].note = null`、`mistakes.*_images/reasons = []`。
- **校验失败时完全不动现有数据**（`validateBackup` 是纯函数，只有 `importBackupObject` 才写库）。

### 14.3 导入流程 / 覆盖前是否自动下载当前备份
**是，覆盖前自动导出当前数据。**
1. `SettingsView.handleImportFile()`：读文件 → `parseBackupJson` → 失败 toast"导入失败：…（现有数据未改动）"；成功则打开确认弹窗（`import-confirm-modal`），显示导出时间 + 18 张表各自条数。
2. `SettingsView.confirmImport()`：`await downloadBackup(); // 覆盖前自动导出当前数据备份` → `importBackupObject(JSON.parse(JSON.stringify(preview.backup)))`。
   - 注意这里的深拷贝是为规避 Vue 响应式 Proxy 写入 IndexedDB 触发 `DataCloneError`（代码注释明确写了）。
3. `importBackupObject()`：在**单个 `rw` 事务**里 `clear()` 全部 18 张表 → 逐表 `bulkPut(rows)`（保留原 `id`）；异常则整个事务回滚，现有数据不变。
4. 成功后 `settings.load()`、`dataVersion += 1`（触发设置页各列表刷新）、toast"导入完成，数据已覆盖"。

### 14.4 清空
- `ClearDataModal.vue` 要求手动输入"清空"二字；确认 → `SettingsView.confirmClear()` → `clearAll()`（`wipeAllTables()` 清空 18 表 + `seedFirstRun()` 重新写入默认 settings 与内置分类/餐次）。

### 14.5 文本导出（Markdown，M8）

**入口**：设置页 →「数据管理」卡片里的「导出文本」区块（`data-test="export-text"`）。

- **区间选择**：快捷「最近 7 天」(`text-range-last7`) / 「最近 30 天」(`text-range-last30`) / 「全部」(`text-range-all`)，以及「自定义」(`text-range-custom`) 下的两个原生 `type="date"` 输入（`text-start` / `text-end`）。
  - 「最近 7 天」= 今天往前 6 天 ~ 今天（含首尾，共 7 天）；「最近 30 天」同理共 30 天。
  - 「全部」= `getEarliestRecordDate()`（最早有记录的日期）~ 今天；**一条记录都没有时退回最近 30 天**，并把这个区间原样写进导出文本与文件名。
  - 起止日期填反了自动对调；日期非法则 toast「请选择有效的起止日期」，不产生下载。
- **今天**一律用 `logicalToday(settingsStore.dayStartMin)`（遵守 04:00 之类的「一天起点」）。
- **文件**：`triggerDownload(filename, exportText(source), 'text/markdown')`，文件名 `evan-text-YYYYMMDD-YYYYMMDD.md`（起止日期去横线）。
- **内容**：完全复用 `src/db/exportText.ts` 的 `exportText()`（本阶段没有重写任何 Markdown 生成逻辑），数据由 `src/db/exportSource.ts` 的 `loadExportSource(start, end)` 装进 `ExportSource`。
- **绝不刷新备份提醒**：整条链路不调用 `setLastBackupAt()`、不写 `settings.last_backup_at`；页面上有一句「文本导出不会刷新备份提醒」的说明。AC-66 用「导出前后 `last_backup_at` 相等」守住这一点。
- **备份未受影响**：`src/db/backup.ts` 的 `triggerDownload` 提取到 `src/utils/download.ts` 后，备份仍然传 `application/json`、仍然 10 秒后 revoke、文件名规则（`backupFileName`）不变；AC-05 / AC-06 / AC-07 / AC-09 等既有 e2e 全绿。

### 14.6 M8 交付记录：文本导出（2026-10-25）

| 改动 | 文件 |
|---|---|
| 新增数据装载层（只读，区间预设 / 文件名纯函数） | `src/db/exportSource.ts` + `src/db/exportSource.spec.ts`（11 用例） |
| 下载函数提取（支持 mime，备份路径行为不变） | `src/utils/download.ts` + `src/utils/download.spec.ts`（2 用例） |
| 备份改为复用提取出的 `triggerDownload` | `src/db/backup.ts`（`downloadBackup()` 的调用顺序、mime、文件名均未变） |
| 设置页「数据管理」新增「导出文本」区块 | `src/views/SettingsView.vue`（预设按钮 / 自定义日期 / 区间回显 / 按钮 + 说明文案） |
| UI 测试 | `src/components/settings-form.spec.ts`（+3 用例：最近 7 天文件名与内容且 `last_backup_at` 不变 / 自定义区间填反自动对调 / 全部无记录退回 30 天） |
| e2e | `e2e/text-export.spec.ts`（AC-66，1 条） |
| 文档 | `e2e/AC-MATRIX.md`（追加 AC-66）、本文件 |

没有改表结构：`DB_VERSION` / `SCHEMA_VERSION` / 备份版本一律未动；零新依赖。

---

## 15. 样式方案

- **写法：原生手写 CSS**，没有 Tailwind、没有 CSS Modules、没有 Sass/Less，也没有任何 UI 组件库。
  - 全局：`src/assets/main.css`（557 行，布局/顶栏/侧栏/弹窗/toast/表格/按钮/移动底部导航等公共类）。
  - 组件内：每个 `.vue` 的 `<style scoped>`（样式与模板同文件）。
- **CSS 变量：有，且是主要的主题机制。** `:root` 定义 `--bg`、`--panel`、`--panel-2`、`--text`、`--muted`、`--border`、`--accent`、`--accent-soft`、`--danger`、`--danger-soft`、`--success`、`--success-soft`、`--warning`、`--warning-soft`、`--shadow`、`--shadow-up`、`--radius`、`--on-accent`、`--overlay`、`--nav-active-bar/bg/text`、`--bottom-nav-bg`、`--bottom-nav-h`、`--touch`；`[data-theme="dark"]` 覆盖同名变量。第二轮 UI 改造新增 UI_GUIDE 命名令牌作既有变量别名：`--surface`(=--panel)、`--surface-2`(=--panel-2)、`--ink`(=--text)、`--line`(=--border)、`--accent-ink`(=--on-accent)、`--good`(=--success)、`--warn`(=--warning)、`--warn-soft`(=--warning-soft)，以及首页问候大块专用 `--hero-bg`/`--hero-ink`/`--hero-sub`（深色在 `[data-theme="dark"]` 覆盖）；圆角拆三档 `--radius`(10px 列表行)/`--radius-card`(16px 卡片)/`--radius-pill`(999px 按钮胶囊)。
- **深浅色切换**（第二轮 UI 第 2 步起是三选一：浅色 / 深色 / 跟随系统）：
  - 变量作用在 `<html data-theme="light|dark">`（`index.html` 初始 `data-theme="light"`）；**data-theme 的取值域始终只有 light/dark**，`[data-theme='dark']` 规则继续成立。
  - 设置页"外观"三个分段按钮（`theme-light` / `theme-dark` / `theme-system`）→ `SettingsView.setTheme(ThemeMode)` → `settingsStore.update({ theme })`；`src/stores/settings.ts` 的 `applyTheme(mode)` 先用 `resolveTheme(mode, prefersDarkScheme())` 解析，再把**解析后的** light/dark 写到 `document.documentElement.dataset.theme`，`load()` / `update()` 后都会调用。
  - `ThemeMode = 'light' | 'dark' | 'system'` 唯一定义在 `src/db/schema.ts`（store 与设置页共用）；`DEFAULT_SETTINGS_VALUES.theme` 仍是 `'light'`（默认观感不变）。
  - 跟随系统：`startSystemThemeWatch()` 用 `window.matchMedia('(prefers-color-scheme: dark)')` 注册监听，**只注册一次**（重复 `load()` 复用同一个监听器），系统切换深浅色立即生效；`stopSystemThemeWatch()` 可注销（测试清理用）。系统偏好本身用响应式 `systemPrefersDark` ref 供 `resolvedTheme`/`isDark` 派生。
  - 主题值持久化在 `settings.theme`（数据库），刷新后由 `settings.load()` 重新应用（e2e AC-51 / AC-68 覆盖）。
- 响应式：`main.css` 两条媒体查询（`max-width: 768px` 显示底部导航/隐藏侧栏、`769~1023px` 侧栏收窄），个别页面另有 `@media (max-width: 860px)`（`PlanView` 两栏改单栏）。
- 字体：正文用 UI_GUIDE §3 中文栈（`"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif`），**不引入 Outfit / 任何外部字体或 CDN**；数字对齐统一靠 `font-variant-numeric: tabular-nums`（时钟、时间轴、计时）。

### 15.1 第二轮 UI 改造 · 第 1 步交付记录：样式令牌对齐（2026-10-26）

- **依据**：`docs/UI_GUIDE.md`（唯一依据）。**只改样式令牌与纯样式，不改任何业务逻辑 / 模板结构 / store / db**。
- **`src/assets/main.css`**：`:root`（浅色）与 `[data-theme='dark']`（深色）**保留既有变量名**，取值改为 UI_GUIDE §2 的浅色/深色表；新增 UI_GUIDE 命名令牌（`--surface`/`--surface-2`/`--ink`/`--line`/`--accent-ink`/`--good`/`--warn`/`--warn-soft`）作为既有变量的别名，另加问候大块专用 `--hero-bg`/`--hero-ink`/`--hero-sub`（在 `[data-theme='dark']` 里覆盖）。圆角拆三档：`--radius`(10px)/`--radius-card`(16px)/`--radius-pill`(999px)；`.settings-card`/`.empty-state` 卡片改 `--radius-card`，`.timer-capsule`/`.badge`/`.primary-btn`/`.ghost-btn`/`.danger-btn`/`.toast-undo` 改 `--radius-pill`；`body` 字体改 UI_GUIDE §3 正文栈，`.content` 内边距对齐 24px。
- **`src/components/HomeHero.vue`**：问候大块真正用上 `--hero-bg`（底色）/ `--hero-ink`（主文字）/ `--hero-sub`（次要文字）；圆角 `--radius-card`、内边距 28px、去边框与阴影（UI_GUIDE §4）。
- **消除硬编码颜色**：`BookCard.vue:91` 与 `StudyBookDetailView.vue:355` 的 `color: #fff` → `var(--hero-ink)`（书封底色为 `BOOK_COLORS` 的饱和色块，`--hero-ink` 在浅/深两套都保持近白，保证对比度）。
- **卡片圆角切换（逐处判断，仅卡片容器）**：`HomeTiles.vue`(.home-tile)、`HomeCards.vue`(.home-card)、`SubjectCard.vue`(.subject-card)、`BookCard.vue`(.book-card) 由 `var(--radius)` → `var(--radius-card)`；`PlanView.vue`(.todo-item)、`WorkoutHistory.vue`(.history-item)、`WorkoutDay.vue`(.exercise-item) 属**列表行，保持 10px 不动**。
- **守护测试**：新增 `src/assets/styleTokens.spec.ts`（9 条）：断言 `:root`/`[data-theme='dark']` 关键令牌取值等于 UI_GUIDE（别名递归解析）、圆角三档、扫描 `src/**/*.vue` 不含 `#hex`/`rgb(`/`hsl(`。
- **实跑**：typecheck 0 错；`run test` 55 文件 / 473 用例全绿（基线 54/464，+9）；全量 e2e 71 passed / 0 failed。

### 15.2 第二轮 UI 改造 · 第 2 步交付记录：跟随系统主题（2026-10-26）

- **依据**：本步任务书（用户已拍板三选一）+ `docs/UI_GUIDE.md` §1.2「浅色、深色两套都要做，设置里选"跟随系统"时用 prefers-color-scheme」。
- **`src/db/schema.ts`**：新增 `export type ThemeMode = 'light' | 'dark' | 'system'`（**唯一类型定义**，store 与设置页复用）；`SettingsRecord.theme` 由 `'light' | 'dark'` 改为 `ThemeMode`；`DEFAULT_SETTINGS_VALUES.theme` **仍是 `'light'`**（默认观感不变）。`DB_VERSION` / `SCHEMA_VERSION` / 备份版本一律不动（旧备份的 light/dark 仍合法）。
- **`src/stores/settings.ts`**：新增纯函数 `resolveTheme(mode, prefersDark)`（system 跟随 prefersDark）、`normalizeTheme(value)`（未知值兜底 `'light'`）、`applyTheme(mode)`（解析后把 light/dark 写 `document.documentElement.dataset.theme`，返回解析结果）、`prefersDarkScheme()`、`refreshSystemPrefersDark()` + 响应式 `systemPrefersDark`、`startSystemThemeWatch(getMode)` / `stopSystemThemeWatch()`（**幂等：重复调用只保留一个监听器**，返回 unsubscribe）。store getters 改为 `theme`（归一化）/ `resolvedTheme` / `isDark`；`load()` 内部 `applyTheme` + 注册监听；`setTheme` 接受 `ThemeMode`。
- **`src/views/SettingsView.vue`**：外观从二选一扩成三选一，新增 `data-test="theme-system"` 按钮（`theme-light`/`theme-dark` 的 data-test 与 `.seg-btn.on` 选中态沿用），文案「浅色 / 深色 / 跟随系统」。
- **`index.html`**：`<meta name="theme-color">` 由 `#4a6cf7` 改为 `#2A4BD7`（与 UI_GUIDE 的 `--accent` 一致）。
- **`src/main.ts`**：仅补注释（`settings.load()` 已负责 applyTheme 与注册监听，这里再兜一次底），无行为改动。
- **新增测试**：`src/stores/settings.spec.ts`（16 条：resolveTheme 三分支 / normalizeTheme 未知值 / applyTheme('system') 深·浅 / 无 matchMedia 环境 / 监听器只注册一次且只应用一次 / stop 后失效 / load 重复只注册一次 / 非 system 模式不被系统覆盖 / 默认仍 light / 库内未知值兜底）；`src/components/settings-form.spec.ts` +1（三选一控件与选中态）；`e2e/theme.spec.ts` 新增 2 条（AC-68 主用例 + theme-color 断言）。
- **实跑**：typecheck 0 错；`run test` **56 文件 / 490 用例全绿**（基线 55/473，+1 文件 17 用例）；全量 e2e **73 passed / 0 failed**（基线 71，+2），含 AC-51 深色模式刷新保持回归。

---

## 16. 测试

### 16.1 单元/组件测试文件（56 个，`src/**/*.spec.ts`，Vitest）

`src/components/`（25）：`bottom-nav.spec.ts`、`category-manager.spec.ts`、`clear-confirm.spec.ts`、`date-jump-popover.spec.ts`、`date-switch.spec.ts`、`exercise-library.spec.ts`（M5）、`home-cards.spec.ts`、`home-hero.spec.ts`、`home-hint-bar.spec.ts`、`home-tiles.spec.ts`、`meal-section.spec.ts`、`modal.spec.ts`、`month-calendar.spec.ts`、`nav.spec.ts`、`plan-form-modal.spec.ts`、`plan-timeline.spec.ts`、`play-record-list.spec.ts`、`play-timer-panel.spec.ts`、`review-components.spec.ts`、`settings-form.spec.ts`、`settlement-modal.spec.ts`、`timer-capsule-flow.spec.ts`、`timer-capsule.spec.ts`、`top-bar.spec.ts`、`water-tracker.spec.ts`

`src/db/`（6）：`db.spec.ts`、`migration.spec.ts`、`backup-v2.spec.ts`、`exportText.spec.ts`、`exportSource.spec.ts`（M8）、`dateStats.spec.ts`

`src/router/`（1）：`router.spec.ts`

`src/stores/`（9）：`diet.spec.ts`、`home.spec.ts`、`library.spec.ts`、`plan.spec.ts`、`play.spec.ts`、`review.spec.ts`、`settings.spec.ts`（第二轮 UI 第 2 步·主题解析/系统监听）、`timer.spec.ts`、`workout.spec.ts`

`src/utils/`（5）：`date.spec.ts`、`image.spec.ts`、`calendar.spec.ts`、`dragSort.spec.ts`（M4）、`download.spec.ts`（M8）

`src/views/`（8）：`life-play-view.spec.ts`、`life-workout-view.spec.ts`、`plan-view.spec.ts`、`review-view.spec.ts`、`study-book-detail-view.spec.ts`、`study-books-view.spec.ts`、`study-subjects-view.spec.ts`、`study-timer-view.spec.ts`

`src/test/`（1）：`start-app-script.spec.ts`（校验 `start-app.bat` 的 CRLF 行尾与运行时回退）

`src/assets/`（1）：`styleTokens.spec.ts`（第二轮 UI 第 1 步·样式令牌守护：颜色/圆角取值对齐 `docs/UI_GUIDE.md` + 扫描 `.vue` 无硬编码颜色）

### 16.2 端到端测试（Playwright，`e2e/`）
`books.spec.ts`、`books-drag.spec.ts`、`calendar.spec.ts`、`data-persistence.spec.ts`、`global.spec.ts`、`home.spec.ts`、`life.spec.ts`、`offline.spec.ts`、`perf.spec.ts`、`plan.spec.ts`、`play-countdown.spec.ts`、`review.spec.ts`、`study.spec.ts`、`text-export.spec.ts`（M8）、`theme.spec.ts`（第二轮 UI 第 2 步·AC-68）、`workout-library.spec.ts`；辅助文件 `helpers.ts`、`fixtures.ts`；AC 映射表 `e2e/AC-MATRIX.md`（AC-01 ~ AC-53 + M2 的 AC-57 ~ AC-59 + M3 的 AC-60 ~ AC-61 + M4 的 AC-62 ~ AC-63 + M5 的 AC-64 ~ AC-65 + M8 的 AC-66 + 第二轮 UI 第 1 步的 AC-67 + 第二轮 UI 第 2 步的 AC-68 逐条对应）。

### 16.3 运行命令与当前结果（第二轮 UI 改造第 2 步后实跑，2026-10-26）

| 命令 | 结果 | 说明 |
|---|---|---|
| `pnpm run test`（`vitest run`） | **全部通过：56 文件 / 490 用例，0 failed** | 起点为 50 文件 / 412 用例；M4 +20、M5 +14、M8 +16（`exportSource.spec.ts` 11 + `download.spec.ts` 2 + `settings-form.spec.ts` 3）、UI 第 1 步 `styleTokens.spec.ts` 9（含修 2 处不稳定用例）、UI 第 2 步 `settings.spec.ts` 16 + `settings-form.spec.ts` 1 |
| `pnpm run typecheck`（`vue-tsc --noEmit`） | **通过（0 错误）** | M8 改动后重跑 |
| `e2e/text-export.spec.ts`（Playwright） | **1 passed（7.3s）** | AC-66：最近 7 天 → 一次下载，文件名 `evan-text-YYYYMMDD-YYYYMMDD.md`（区间 = 今天往前 6 天 ~ 今天），内容断言 `### 计划`/`AC66计划`、`### 饮食`/`- 早：AC66早餐`、汇总与当天段落的喝水行；导出前后 `settings.last_backup_at`（固定值 1700000000000）相等 |
| `e2e/workout-library.spec.ts`（Playwright） | **2 passed（11.6s）** | AC-64 / AC-65 逐条覆盖（项目库自动维护/最近使用排序/点选加入与幂等；备注写入/刷新保留/清空存 null/不影响组数与默认用时） |
| `e2e/play-countdown.spec.ts`（Playwright） | **6 passed（18.6s）** | AC-60 / AC-61 逐条覆盖（名称必填、快捷 30 分钟、自定义 25 分钟与非法值、按剩余额度、到点超时封顶、再来一轮不自动开始） |
| `e2e/life.spec.ts`（Playwright） | **7 passed** | AC-40 ~ AC-46 回归（含 AC-46 娱乐超额变红） |
| `e2e/study.spec.ts`（Playwright） | **11 passed** | AC-04 / AC-31 ~ AC-39 + AC-39辅助 回归（含 AC-39 倒计时到点提示与再来一轮） |
| `pnpm run test:e2e`（全量） | **71 passed / 0 failed（2.9m）** | AC-01~AC-66 全绿（M5 的 70 条 + M8 新增 AC-66）；备份相关的 AC-05 / AC-06 / AC-07 / AC-09 未改动仍通过（回归 `triggerDownload` 提取）。注：与另一进程并发跑 Playwright 会共用 `test-results/` 导致 trace `ENOENT` 假失败，需独占跑。第二轮 UI 改造·第 1 步（样式令牌对齐）后重跑：全量 e2e 仍 **71 passed / 0 failed（3.0m）**，含 AC-51 深色模式刷新保持
| 第二轮 UI 第 2 步（跟随系统主题）后实跑 | `run test` **56 文件 / 490 用例全绿（0 failed）**；`run typecheck` **0 错**；全量 e2e **73 passed / 0 failed（3.0m）** | 新增 `src/stores/settings.spec.ts`（16 条）与 `src/components/settings-form.spec.ts` +1、`e2e/theme.spec.ts` +2（AC-68）；AC-51 深色模式刷新保持未改动仍通过 |

补充：`pnpm run test` 全量并行时 `src/views/study-book-detail-view.spec.ts > 摘录：增删改可用…` 曾偶发失败一次（`Cannot call trigger on an empty DOMWrapper`），单独重跑通过 → 该用例在并行全量跑时**偶发不稳定**（基线已存在，与 M2 无关）。

---

## 17. 对照 PRD v1.2 的差距与不一致

> 基准文档：`docs/PRD_v1.2.md`（562 行，仓库内唯一 PRD）。下文的"未完成"= PRD 明确要求但代码没有或只做了一半；"不一致" = 行为/命名/数值与 PRD 描述不同。

### 17.1 会直接阻断验收的现状（应先修）
当前无阻断项（M2 交付时已全部修复）：
1. ~~类型检查不通过~~ **已解决**：`vue-tsc --noEmit` 0 错误（基线 v1.0 收尾已修复 `Mistake.note` 等 7 个错误）。
2. ~~单元测试不全绿~~ **已解决**：`pnpm run test` 50 文件 / 393 用例全部通过（M2 交付时实跑）。
3. ~~全量 e2e 有既有用例在首页操作日期控件~~ **已解决**：AC-12 / AC-13 / AC-19 / AC-20 / AC-41 / AC-24 已把日期控件操作挪到日期相关页面（plan / life-diet / review），断言未改；全量 e2e 58 passed。

### 17.2 功能缺口（PRD 要求、代码未做完）
1. **书架页不能改页码**。PRD §5.2 规则 2 写的是"在书架**或**书详情页直接手动修改当前页"，但 `src/views/StudyBooksView.vue` / `src/components/BookCard.vue` 没有任何页码输入，只有 `src/views/StudyBookDetailView.vue` 的 `savePage()`。
2. **计时器页空状态没有主按钮**。PRD §10 AC-15 要求"在数据为空时打开每个页面，每页显示引导语和主按钮"，`StudyTimerView.vue` 的 `target-empty` 只有一句"暂无…，请先到对应页面添加。"，没有跳转按钮（e2e AC-15 只断言这句文案，所以没被拦住）。
3. ~~**"训练项目库"（`exercises` 表）没有接进任何 UI**~~ **已在 M5 解决**：`addExercise`/`renameExercise`/`saveTemplate` 自动 upsert 到 `exercises`，健身页当天编辑区新增「项目库」区块（`ExerciseLibrary.vue`，最近使用优先排序，点一下加入当天训练）；动作补全仍来自历史记录（`workoutStore.exerciseNames`）。做法详见 §11.4。
4. **"错题本"（`mistakes` 表）没有页面/入口**：schema、图片压缩工具（`src/utils/image.ts`）、文本导出（`src/db/exportText.ts`）都写好了，但路由、视图、store 全缺。
5. ~~**复盘 `record_worthy` / `day_summary` 没有输入 UI**~~ **已解决（M1）**：`ReviewView.vue` 已加「今天一件值得记录的事」多行 textarea 与「一句话总结今天」单行 input（`maxlength=100`，带字数计数），`ReviewPatch` 已纳入两字段并走 300ms 防抖保存。交付记录见 §12.3。
6. ~~**文本导出（Markdown）没有入口**~~ **已在 M8 解决**：设置页「数据管理」新增「导出文本」区块（最近 7 天 / 最近 30 天 / 全部 / 自定义起止日期 → 下载 `evan-text-YYYYMMDD-YYYYMMDD.md`），内容复用 `exportText()`，数据由 `src/db/exportSource.ts` 装载；导出不刷新备份时间。做法详见 §14.5 / §14.6，e2e AC-66。注：`exportText` / `exportSource` 仍不在 `src/db/index.ts` 的 barrel 里，设置页按路径直接导入（与 `dateStats.ts` 一致）。
7. **首页"学习"卡片的"开始计时"只是跳转**：`HomeCards.vue` 的按钮 `router.push("/study/timer")`，不会带着对象直接开始计时（PRD §3.2 把它列在"可直接操作"列）。

### 17.3 与 PRD 描述不一致的地方
1. **备份 `schema_version`**：PRD §7.2 写的是 `schema_version: 1`；代码是 `SCHEMA_VERSION = 3`（`src/db/schema.ts`）。导入端已兼容 1、2、3。
2. **表数量**：PRD 数据结构是 16 张表；代码 `TABLE_NAMES` 是 18 张（多了 `exercises`、`mistakes`），`DECISIONS.md` 已于 2026-10-24 校准为 18 张。
3. **快捷键多于三个**：PRD §2.4 说"仅三个 N / Space / Esc"；代码另有 `ArrowLeft` / `ArrowRight` 切换日期、`T` / `Home` 回到今天（`src/components/TopBar.vue` 的 `onKeydown`），以及日期跳转弹窗（`DateJumpPopover.vue`）。
4. **暂停时长单位**：PRD §5.4 写"累计暂停时长（**秒**）"；代码字段是 `active_timer.paused_total_ms`（**毫秒**）。
5. **"已复盘"判定两套口径**：首页 `homeStore.load()` 用 `reviews.length > 0`；复盘页 `hasReviewContent()` 要求有实际内容。点过评分又取消会留下全空行 → 首页认为已复盘、复盘页仍显示未填写（见 §12.2）。
6. **手动改页码生成记录的日期**：PRD §5.2 要求"当天逻辑日期"；`libraryStore.updateBookPage()` 用的是 `dateStore.selectedDate`（顶栏当前选中日期）。回看昨天并改页码时，增量会记到昨天。
7. ~~**娱乐计时没有倒计时**~~ **已在 M3 解决**：娱乐页可选正计时/倒计时（快捷 15/30/45/60、自定义分钟、按剩余额度），`startEntertainment(name, { mode, countdownMinutes })` 不再写死 `stopwatch`（见 §8.3 / §8.5）。
8. **Space 快捷键会误伤娱乐计时**：`StudyTimerView.vue` 的 `onKeydown` 调 `timerStore.toggle()`，不判断 `type`；按钮虽然对娱乐计时隐藏，键盘仍可暂停/继续娱乐计时，与 PRD §5.4"入口分离"略有出入。
9. **状态胶囊路由**：PRD 只说点击胶囊跳回对应页面；实现里学习→`/study/timer`、娱乐→`/life/play`（符合，仅记录实现方式）。
10. **首页版面**：PRD §3.2 只有"提示条 + 6 张卡片"；实现多了 `HomeHero`（问候 + 实时时钟 + 日期）和 `HomeTiles`（4 个数据方块）。
11. **移动端**：PRD §1.5 明确"不需要手机端"，但代码有 `BottomNav.vue` + `main.css` 的 `@media (max-width: 768px)` 一套移动布局。属超范围实现，不是缺陷，但会增加维护面。

### 17.4 代码已实现但超出 PRD v1.2 范围的部分（v2 遗留）
- `exercises`（训练项目库）、`mistakes`（错题本）两张表 + 迁移 v1→v2。
- `src/db/exportText.ts`（把数据整理成 Markdown 供 AI 分析）——PRD §9 明确第一版**不含 AI**。
- `src/utils/image.ts`（图片压缩成 base64 data URL）——为错题本图片准备。
- `reviews.record_worthy` / `day_summary` 两个字段。
- 备份对 `schema_version: 1` 的向后兼容与 `normalizeRow()` 补默认值。
- 首页 Hero/Tiles、日期跳转弹窗（M2 增加月历与日期控件显示范围）、方向键快捷键、移动端底部导航。

### 17.5 文档与流程漂移
- `DECISIONS.md` 仍写「库名 `evan_personal_app_db`，schema_version **1**」「**16 张表**」，与代码（v2 / 18 表）不符。
- `DECISIONS.md` 写「每个阶段结束时必须做一次全量回归，测试全绿才进入下一阶段」；M1 收尾后 `typecheck` 与单测已全绿（见 §16.3），全量 e2e 已全绿（58 passed，见 §16.3）。
- `AGENTS.md` 要求「每次改动完成都必须 Git commit」；M2 按协调者要求**不执行 git add / commit / push**，工作区里是 M2 新增/修改的文件加上之前遗留的未提交改动，提交由协调者复核后统一做。
- `docs/` 下（除本文件外）只有 `PRD_v1.2.md`，没有 v2 的需求文档 —— 因此"错题本/训练项目库/文本导出"到底要什么形态，代码里无法确认。

---

## 附录 A：未确认项（不猜，标注"未确认"）

1. **持久存储是否真的获批**：`src/db/database.ts` 的 `requestPersistentStorage()` 调 `navigator.storage.persist()` 但不检查返回值，Chrome 是否授予 —— **未确认**。
2. **v2 需求文档**：错题本/训练项目库/文本导出的目标形态 —— 仓库内无 v2 PRD，**未确认**（只能确认代码现状）。
3. **1 年数据量下的真实导入/导出耗时**：`perf.spec.ts` 有 1 年模拟数据用例，但只测页面切换耗时，备份导入导出未单独计时 —— **未确认**。
4. **移动端体验**：底部导航/safe-area 只在代码层面存在，未在真实手机或触摸设备验收 —— **未确认**。
5. **AC-52 性能阈值在低配机器上的稳定性**：本机通过（414~523ms），其他机器 —— **未确认**。
6. **工作区 28 项未提交改动（12 改 + 16 新增）的意图/是否可回滚**：只能看到 `git status`，原因 —— **未确认**。

## 附录 B：本次实跑记录（可复现）

> 下列为阶段 A3 的基线实跑记录（历史快照）；M2 交付后的当前结果见 §16.3。

```
# 环境：Node v24.21.0；node/pnpm 均走 DSH 内置运行时（系统 PATH 无 node）
"<node>" "<pnpm.mjs>" run typecheck   # 退出码 2，7 个 TS 错误
"<node>" "<pnpm.mjs>" run test        # 46 文件 / 344 用例 → 342 passed, 2 failed
"<node>" "<pnpm.mjs>" run build       # 在 vue-tsc 阶段失败，未产出新 dist
"<node>" node_modules/@playwright/test/cli.js test   # 54 passed (2.9m)，浏览器 channel=chrome
```

本次盘点**只新增了本文件**（`docs/CURRENT_STATE.md`），没有修改任何现有业务文件。
