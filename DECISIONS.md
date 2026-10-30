# 开发决策与数据契约（本会话定稿，后续所有阶段的唯一依据）

## 已拍板的决定
- 框架：Vue 3 + TypeScript(strict) + Vite（strictPort: true，固定 http://localhost:5173）+ vue-router(hash) + Pinia + Dexie
- 测试：每阶段 Vitest 单元+组件测试（fake-indexeddb、@vue/test-utils），阶段测试全绿才进入下一阶段；最后加 Playwright 端到端逐条核对 PRD §10 的 AC-01~AC-53；最终运行全部测试。禁止删除/跳过测试、禁止降低验收标准。
- ① 排程：不做鼠标拖拽，只用“安排时间”按钮+表单（与 PRD §8/§9/§11 一致）。
- ② 自定义计划分类删除后：历史计划项保留 category_key + category_name 快照继续显示；“学习”类聚合只认内置 key('study')。
- ③ 自定义餐次/训练类型删除后：历史饮食/训练记录保留 meal_name / type_name 名称快照显示（同 target_title 思路）。
- ④ “最重要的一件事”加入今日待办：生成无起止时间的待办，分类归入内置“其他”，并把昨日复盘 mit_added_to_plan 置 true。
- ⑤ 主键与时间戳：所有表 UUID 字符串主键 + 毫秒时间戳；备份/导入保留原 id 保证引用一致。
- 假设（未反对即生效）：不引第三方 UI 组件库、图标字体本地打包（禁外链）；默认浅色模式；系统字体栈；App 运行期零外部网络请求。

## 工具链
- Node：Node.js LTS（开发时用 v24.x；项目不锁定次要版本，只要满足 package.json 的 engines 与 Vite 6 要求）
- pnpm：通过 `corepack enable` 或官方安装脚本获取，命令即 `pnpm`
- npm 源：https://registry.npmjs.org（已验证可达）

## 数据库契约（Dexie，库名 evan_personal_app_db，schema_version **2**，共 **18 张表**）

> 2026-10-24 校准：v1 为 16 张表；v2 新增 `exercises`（训练项目库）与 `mistakes`（错题本），并给 `reviews` 补 `record_worthy`/`day_summary`。备份结构版本同步升为 2，导出写 2，导入接受 1 与 2（旧备份仍可导入）。
通用字段：id(UUID 字符串主键)、created_at(ms)、updated_at(ms)、deleted_at(ms|null 软删除)。
索引：需要按逻辑日期(date)查询的表建 date 索引；book_id、target_id、weekday 等按需建索引。
1. settings：单行 key='app'。daily_study_min=120, daily_water_ml=2000, cup_ml=250, daily_play_min=60, day_start='04:00'(整点/半点), theme='light'|'dark', last_backup_at=null
2. plan_categories：name, builtin_key('study'|'life'|'other'|null)。内置 学习/生活/其他 不可删除改名
3. meal_types：name, builtin_key('breakfast'|'lunch'|'dinner'|'snack'|null)。内置 早/午/晚/加餐 不可删除改名
4. workout_types：name
5. plans：title, date('YYYY-MM-DD'), start_min(number|null,0~1440), end_min(number|null), category_key, category_name(快照), target_type('book'|'subject'|null), target_id(string|null), target_title(string|null 快照), done(bool), done_at(number|null), rollover_from_date(string|null), is_rolled_over(bool)
6. books：title, author(string|null), total_pages(int), current_page(int 默认0), status('want'|'reading'|'done'), color(封面色), start_date(string|null), finish_date(string|null)
7. excerpts：book_id, page(int), content, thought(string|null)
8. subjects：name, weekly_goal_min(int), deadline('YYYY-MM-DD'|null), archived(bool)
9. study_records：target_type('book'|'subject'), target_id(string|null), target_title(快照), start_at(ms), end_at(ms), duration_sec(int 不含暂停), note(string|null), start_page(int|null 仅书), end_page(int|null 仅书), pages_read(int|null 仅书 =max(0,end-start)), source('timer'|'manual'|'page_update'), date(逻辑日期)
10. active_timer：单行 key='global'。type('book'|'subject'|'entertainment'), target_id(string|null), target_title, plan_id(string|null), mode('stopwatch'|'countdown'), countdown_sec(int 默认1500), started_at(ms), paused_total_ms(int), paused(bool), pause_started_at(ms|null), ended_at(ms|null 非空=待结算)
11. meals：date, meal_key, meal_name(快照), text, feeling('full'|'not_full'|'overeat'|null)
12. water：date, ml(int 可正负), at(ms)
13. workout_templates：weekday(1=周一~7=周日), type_name(快照), exercise_names(string[])
14. workout_records：date, type_name(快照), exercises:[{name, sets:[{weight_kg(number|null), reps(number|null), done(bool)}]}], duration_min(int|null), done(bool)
15. play_records：date, content, minutes(int>0), source('timer'|'manual')
16. reviews：date, rating(1-5|null), mood(1-5|null), energy(1-5|null), good(string|null), improve(string|null), mit(string|null), mit_added_to_plan(bool 默认false), record_worthy(string|null, v2), day_summary(string|null, v2, 限 100 字)
17. exercises（v2）：name（训练项目库，动作名）
18. mistakes（v2）：date, subject_name, question_text, question_images(base64 dataURL[]), correction_text, correction_images(base64 dataURL[]), reasons(string[]), difficulty(1-5), mastered(bool)

备份 JSON：{ app:'evan-app', schema_version:2, exported_at(ms), tables:{<表名>:[有效记录...]} }；导出前与启动时执行 GC（物理删除 deleted_at 早于 1 小时前的记录）。导入校验失败不改动现有数据；导入事务性覆盖并保留原 id。
首次运行种子：内置分类/餐次 + 默认 settings。
