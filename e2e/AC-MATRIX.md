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

