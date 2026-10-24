import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  createRecord,
  getActiveTimer,
  getRecord,
  listAlive,
  resetDbForTests,
  type Book,
  type Subject,
} from '@/db';
import {
  APP_TITLE,
  COUNTDOWN_FINISH_TITLE,
  capEntertainmentMinutes,
  useTimerStore,
} from '@/stores/timer';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';

const BASE = new Date('2026-06-01T10:00:00').getTime();

let pinia: Pinia;
let timer: ReturnType<typeof useTimerStore>;

async function makeBook(currentPage = 50, totalPages = 300): Promise<Book> {
  return createRecord('books', {
    title: 'SICP',
    author: null,
    total_pages: totalPages,
    current_page: currentPage,
    status: 'reading',
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
  });
}

async function makeSubject(): Promise<Subject> {
  return createRecord('subjects', {
    name: '数学',
    weekly_goal_min: 360,
    deadline: null,
    archived: false,
  });
}

/** 只冻结 Date（不冻结 setTimeout/setInterval，避免影响 fake-indexeddb/Dexie 的异步调度）。 */
function useFakeDate(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  timer = useTimerStore();
  await useSettingsStore().load();
});

afterEach(() => {
  timer.dispose();
  vi.useRealTimers();
});

describe('全局计时状态机（active_timer 持久化）', () => {
  it('开始→暂停→继续→结束：elapsedMs 扣除暂停段，待结算按 ended_at 冻结', async () => {
    useFakeDate();
    const book = await makeBook();
    const result = await timer.startTimer({
      type: 'book',
      targetId: book.id,
      targetTitle: book.title,
      mode: 'stopwatch',
    });
    expect(result).toEqual({ ok: true });
    expect(timer.isRunning).toBe(true);
    expect(timer.isPaused).toBe(false);

    vi.setSystemTime(BASE + 10_000);
    await timer.pauseTimer();
    expect(timer.isPaused).toBe(true);
    timer.tick();
    expect(timer.elapsedMs).toBe(10_000);

    vi.setSystemTime(BASE + 70_000); // 暂停 60 秒
    await timer.resumeTimer();
    expect(timer.isPaused).toBe(false);
    timer.tick();
    expect(timer.elapsedMs).toBe(10_000);

    vi.setSystemTime(BASE + 130_000); // 又计时 60 秒
    timer.tick();
    expect(timer.elapsedMs).toBe(70_000);

    await timer.endTimer();
    timer.tick();
    expect(timer.isSettling).toBe(true);
    expect(timer.isRunning).toBe(false);
    expect(timer.isUnderOneMinute).toBe(false);
    const row = await getActiveTimer();
    expect(row?.paused_total_ms).toBe(60_000);
    expect(row?.paused).toBe(false);
    expect(row?.pause_started_at).toBeNull();
    expect(row?.ended_at).toBe(BASE + 130_000);
    expect(timer.elapsedMs).toBe(70_000); // 待结算时长冻结
  });

  it('学习结算：study_records 字段完整、pages_read 计算、book.current_page 更新', async () => {
    useFakeDate();
    const book = await makeBook(50, 300);
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    vi.setSystemTime(BASE + 10 * 60_000);
    await timer.endTimer();
    const record = await timer.settleStudy({ note: '读到一半', endPage: 62 });
    expect(record.target_type).toBe('book');
    expect(record.target_id).toBe(book.id);
    expect(record.target_title).toBe('SICP');
    expect(record.start_at).toBe(BASE);
    expect(record.end_at).toBe(BASE + 600_000);
    expect(record.duration_sec).toBe(600);
    expect(record.note).toBe('读到一半');
    expect(record.start_page).toBe(50);
    expect(record.end_page).toBe(62);
    expect(record.pages_read).toBe(12);
    expect(record.source).toBe('timer');
    expect(record.date).toBe('2026-06-01');
    expect((await getRecord('books', book.id))?.current_page).toBe(62);
    expect(await getActiveTimer()).toBeNull();
    expect(timer.timer).toBeNull();
    expect(timer.isSettling).toBe(false);
  });

  it('书结算缺省 endPage：默认当前页，pages_read=0，书页码不变', async () => {
    useFakeDate();
    const book = await makeBook(80);
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    vi.setSystemTime(BASE + 5 * 60_000);
    await timer.endTimer();
    const record = await timer.settleStudy({});
    expect(record.start_page).toBe(80);
    expect(record.end_page).toBe(80);
    expect(record.pages_read).toBe(0);
    expect((await getRecord('books', book.id))?.current_page).toBe(80);
  });

  it('科目结算：无页码字段，时长不含暂停', async () => {
    useFakeDate();
    const subject = await makeSubject();
    await timer.startTimer({ type: 'subject', targetId: subject.id, targetTitle: subject.name, mode: 'stopwatch' });
    vi.setSystemTime(BASE + 3 * 60_000);
    await timer.endTimer();
    const record = await timer.settleStudy({ note: '刷题' });
    expect(record.target_type).toBe('subject');
    expect(record.target_id).toBe(subject.id);
    expect(record.start_page).toBeNull();
    expect(record.end_page).toBeNull();
    expect(record.pages_read).toBeNull();
    expect(record.duration_sec).toBe(180);
  });

  it('丢弃：清空 active_timer，不留任何记录，书页码不动', async () => {
    useFakeDate();
    const book = await makeBook();
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    vi.setSystemTime(BASE + 120_000);
    await timer.endTimer();
    await timer.discardTimer();
    expect(await getActiveTimer()).toBeNull();
    expect(timer.timer).toBeNull();
    expect(await listAlive('study_records')).toHaveLength(0);
    expect((await getRecord('books', book.id))?.current_page).toBe(50);
  });

  it('娱乐结算：分钟向上取整，可被显式覆盖', async () => {
    useFakeDate();
    await timer.startTimer({ type: 'entertainment', targetId: '游戏', targetTitle: '游戏', mode: 'stopwatch' });
    vi.setSystemTime(BASE + 61_000);
    await timer.endTimer();
    const record = await timer.settleEntertainment({});
    expect(record.minutes).toBe(2); // ceil(61/60)
    expect(record.content).toBe('游戏');
    expect(record.source).toBe('timer');
    expect(record.date).toBe('2026-06-01');

    await timer.startTimer({ type: 'entertainment', targetId: '视频', targetTitle: '视频', mode: 'stopwatch' });
    vi.setSystemTime(BASE + 61_000 + 10 * 60_000);
    await timer.endTimer();
    const record2 = await timer.settleEntertainment({ minutes: 5 });
    expect(record2.minutes).toBe(5);
    expect(await listAlive('play_records')).toHaveLength(2);
  });

  it('娱乐倒计时结算封顶：设定 30 分钟、挂到 45 分钟才点结束仍记 30 分钟（AC-61）', async () => {
    useFakeDate();
    await timer.startTimer({
      type: 'entertainment',
      targetId: '塞尔达',
      targetTitle: '塞尔达',
      mode: 'countdown',
      countdownSec: 1800,
    });
    vi.setSystemTime(BASE + 45 * 60_000); // 到点后一直没点结束，45 分钟才结束
    await timer.endTimer();
    const record = await timer.settleEntertainment({});
    expect(record.minutes).toBe(30);
    expect(record.content).toBe('塞尔达');
    expect(record.source).toBe('timer');
    expect(record.date).toBe('2026-06-01');

    const rows = await listAlive('play_records');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.minutes).toBe(30);
    expect(await getActiveTimer()).toBeNull();
  });

  it('娱乐倒计时结算：提前结束按实际用时取整；显式分钟数也封顶在设定时长', async () => {
    useFakeDate();
    // 提前结束：10 分 1 秒 → ceil = 11 分钟
    await timer.startTimer({
      type: 'entertainment',
      targetId: '视频',
      targetTitle: '视频',
      mode: 'countdown',
      countdownSec: 1800,
    });
    vi.setSystemTime(BASE + 601_000);
    await timer.endTimer();
    expect((await timer.settleEntertainment({})).minutes).toBe(11);

    // 结算弹窗把实际 45 分钟预填进来 → 仍封顶 30
    await timer.startTimer({
      type: 'entertainment',
      targetId: '视频',
      targetTitle: '视频',
      mode: 'countdown',
      countdownSec: 1800,
    });
    vi.setSystemTime(BASE + 601_000 + 45 * 60_000);
    await timer.endTimer();
    expect((await timer.settleEntertainment({ minutes: 45 })).minutes).toBe(30);

    // 不超过设定时长的手动微调保留
    await timer.startTimer({
      type: 'entertainment',
      targetId: '视频',
      targetTitle: '视频',
      mode: 'countdown',
      countdownSec: 1800,
    });
    vi.setSystemTime(BASE + 601_000 + 45 * 60_000 + 20 * 60_000);
    await timer.endTimer();
    expect((await timer.settleEntertainment({ minutes: 12 })).minutes).toBe(12);
  });

  it('娱乐正计时与学习倒计时都不受娱乐封顶影响', async () => {
    useFakeDate();
    await timer.startTimer({
      type: 'entertainment',
      targetId: '视频',
      targetTitle: '视频',
      mode: 'stopwatch',
    });
    vi.setSystemTime(BASE + 45 * 60_000);
    await timer.endTimer();
    expect((await timer.settleEntertainment({})).minutes).toBe(45);

    // 学习倒计时：settleStudy 不封顶（AC-39 / settleStudy 行为不变）
    const subject = await makeSubject();
    await timer.startTimer({
      type: 'subject',
      targetId: subject.id,
      targetTitle: subject.name,
      mode: 'countdown',
      countdownSec: 1800,
    });
    vi.setSystemTime(BASE + 45 * 60_000 + 45 * 60_000);
    await timer.endTimer();
    expect((await timer.settleStudy({})).duration_sec).toBe(2700);
  });

  it('capEntertainmentMinutes 纯函数：倒计时按设定时长封顶、最少 1 分钟；正计时只取整', () => {
    expect(capEntertainmentMinutes(45, 'countdown', 1800)).toBe(30);
    expect(capEntertainmentMinutes(30, 'countdown', 1800)).toBe(30);
    expect(capEntertainmentMinutes(45, 'stopwatch', 1800)).toBe(45);
    expect(capEntertainmentMinutes(0, 'countdown', 1800)).toBe(1);
    expect(capEntertainmentMinutes(5, 'countdown', 90)).toBe(2); // ceil(90/60) = 2
    expect(capEntertainmentMinutes(12.7, 'stopwatch', 1500)).toBe(12);
  });

  it('全局单计时守卫：进行中与待结算都拒绝新计时并 toast 提示；isTargetActive 保护查询', async () => {
    useFakeDate();
    const book = await makeBook();
    const subject = await makeSubject();
    const first = await timer.startTimer({
      type: 'book',
      targetId: book.id,
      targetTitle: book.title,
      mode: 'stopwatch',
    });
    expect(first.ok).toBe(true);
    const firstRow = await getActiveTimer();

    const second = await timer.startTimer({
      type: 'subject',
      targetId: subject.id,
      targetTitle: subject.name,
      mode: 'stopwatch',
    });
    expect(second.ok).toBe(false);
    expect(second.ok ? '' : second.reason).toContain('已有计时进行中');
    expect(useToastStore().items.some((i) => i.message.includes('已有计时进行中'))).toBe(true);
    expect((await getActiveTimer())?.id).toBe(firstRow?.id);

    expect(timer.isTargetActive(book.id)).toBe(true);
    expect(timer.isTargetActive(subject.id)).toBe(false);

    vi.setSystemTime(BASE + 90_000);
    await timer.endTimer();
    const third = await timer.startTimer({
      type: 'entertainment',
      targetId: '游戏',
      targetTitle: '游戏',
      mode: 'stopwatch',
    });
    expect(third.ok).toBe(false);
    expect(third.ok ? '' : third.reason).toContain('待结算');
    expect(timer.isTargetActive(book.id)).toBe(true); // 待结算仍受保护
    expect(timer.isTargetSettling(book.id)).toBe(true);
    expect((await getActiveTimer())?.id).toBe(firstRow?.id);

    await timer.discardTimer();
    expect(timer.isTargetActive(book.id)).toBe(false);
  });

  it('有效时长不足 1 分钟：isUnderOneMinute 标记；恰好 60 秒不算不足', async () => {
    useFakeDate();
    const book = await makeBook();
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    vi.setSystemTime(BASE + 30_000);
    await timer.endTimer();
    timer.tick();
    expect(timer.isUnderOneMinute).toBe(true);
    const record = await timer.settleStudy({}); // 用户选择“继续结算保存”后 store 仍可保存
    expect(record.duration_sec).toBe(30);

    // 第二轮从 BASE+30_000 开始（上一轮结束时的系统时间），再走 60 秒
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    vi.setSystemTime(BASE + 30_000 + 60_000);
    await timer.endTimer();
    timer.tick();
    expect(timer.isUnderOneMinute).toBe(false);
    await timer.discardTimer();
  });

  it('倒计时归零：isCountdownFinished / 提示标记 / document.title 闪烁', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(BASE);
    const subject = await makeSubject();
    await timer.startTimer({
      type: 'subject',
      targetId: subject.id,
      targetTitle: subject.name,
      mode: 'countdown',
      countdownSec: 60,
    });
    expect(timer.timer?.countdown_sec).toBe(60);
    expect(timer.remainingSec).toBe(60);

    vi.setSystemTime(BASE + 30_000);
    timer.tick();
    expect(timer.remainingSec).toBe(30);
    expect(timer.isCountdownFinished).toBe(false);

    vi.setSystemTime(BASE + 60_000);
    timer.tick();
    expect(timer.isCountdownFinished).toBe(true);
    expect(timer.showCountdownFinishedPrompt).toBe(true);

    document.title = APP_TITLE;
    vi.advanceTimersByTime(600);
    expect(document.title).toBe(COUNTDOWN_FINISH_TITLE);
    vi.advanceTimersByTime(600);
    expect(document.title).toBe(APP_TITLE);

    await timer.endTimer(); // 进入结算后提示关闭、闪烁停止
    expect(timer.showCountdownFinishedPrompt).toBe(false);
    expect(timer.isCountdownFinished).toBe(false);
    expect(document.title).toBe(APP_TITLE);
    await timer.discardTimer();
  });

  it('倒计时到点“再来一轮”：本轮按默认结算并立即以同对象同设置开启下一轮', async () => {
    useFakeDate();
    const book = await makeBook(42);
    await timer.startTimer({
      type: 'book',
      targetId: book.id,
      targetTitle: book.title,
      mode: 'countdown',
      countdownSec: 60,
    });
    vi.setSystemTime(BASE + 60_000);
    timer.tick();
    expect(timer.showCountdownFinishedPrompt).toBe(true);

    const result = await timer.settleAndStartNextRound();
    expect(result).toEqual({ ok: true });
    expect(timer.isRunning).toBe(true);
    expect(timer.timer?.mode).toBe('countdown');
    expect(timer.timer?.countdown_sec).toBe(60);
    expect(timer.timer?.target_id).toBe(book.id);
    const records = await listAlive('study_records');
    expect(records).toHaveLength(1);
    expect(records[0]?.duration_sec).toBe(60);
    expect(records[0]?.pages_read).toBe(0);
    expect(timer.pendingPlanQuestion).toBeNull(); // 再来一轮不打断
    await timer.discardTimer();
  });

  it('刷新恢复：进行中按时间戳重建进度；倒计时剩余秒数正确', async () => {
    useFakeDate();
    const book = await makeBook();
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    // 模拟刷新：新 pinia / 新 store 实例，同一数据库
    setActivePinia(createPinia());
    const fresh = useTimerStore();
    await useSettingsStore().load();
    vi.setSystemTime(BASE + 3600_000);
    await fresh.loadActiveTimer();
    fresh.tick();
    expect(fresh.isRunning).toBe(true);
    expect(fresh.elapsedMs).toBe(3600_000);
    expect(fresh.needsRecovery).toBe(false);

    await fresh.discardTimer();
    const subject = await makeSubject();
    await fresh.startTimer({
      type: 'subject',
      targetId: subject.id,
      targetTitle: subject.name,
      mode: 'countdown',
      countdownSec: 60,
    });
    setActivePinia(createPinia());
    const fresh2 = useTimerStore();
    await useSettingsStore().load();
    vi.setSystemTime(BASE + 3600_000 + 20_000);
    await fresh2.loadActiveTimer();
    fresh2.tick();
    expect(fresh2.remainingSec).toBe(40);
    await fresh2.discardTimer();
  });

  it('刷新恢复：待结算状态重建并冻结时长（防逃逸阻塞）', async () => {
    useFakeDate();
    const book = await makeBook();
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    vi.setSystemTime(BASE + 300_000);
    await timer.endTimer();
    setActivePinia(createPinia());
    const fresh = useTimerStore();
    await useSettingsStore().load();
    vi.setSystemTime(BASE + 2 * 3600_000); // 时间继续流逝，但结算时长冻结
    await fresh.loadActiveTimer();
    fresh.tick();
    expect(fresh.isSettling).toBe(true);
    expect(fresh.isRunning).toBe(false);
    expect(fresh.elapsedMs).toBe(300_000);
    const record = await fresh.settleStudy({});
    expect(record.duration_sec).toBe(300);
  });

  it('进行中超过 12 小时：恢复确认三选项（继续计时 / 结束并手动修改时长 / 直接丢弃）', async () => {
    useFakeDate();
    const book = await makeBook();
    await timer.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    setActivePinia(createPinia());
    const fresh = useTimerStore();
    await useSettingsStore().load();
    vi.setSystemTime(BASE + 13 * 3600_000);
    await fresh.loadActiveTimer();
    fresh.detectBoundaryNeeds();
    expect(fresh.needsRecovery).toBe(true);

    // 继续计时：本次计时会话不再重复弹恢复确认，计时继续累计
    fresh.continueAfterRecovery();
    expect(fresh.needsRecovery).toBe(false);
    expect(fresh.isRunning).toBe(true);
    expect(fresh.elapsedMs).toBe(13 * 3600_000);
    fresh.tick();
    expect(fresh.needsRecovery).toBe(false); // 同一条计时已豁免

    // 结束并手动修改时长：模拟再次“重开”，恢复确认重新触发
    setActivePinia(createPinia());
    const fresh2 = useTimerStore();
    await useSettingsStore().load();
    await fresh2.loadActiveTimer();
    fresh2.detectBoundaryNeeds();
    expect(fresh2.needsRecovery).toBe(true);
    await fresh2.endWithDurationOverride();
    expect(fresh2.isSettling).toBe(true);
    expect(fresh2.durationOverrideAllowed).toBe(true);
    const record = await fresh2.settleStudy({ durationSecOverride: 3600 });
    expect(record.duration_sec).toBe(3600);
    expect(record.end_at).toBe(BASE + 13 * 3600_000);

    // 直接丢弃路径：重新开一轮并再次触发超时
    await fresh2.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    setActivePinia(createPinia());
    const fresh3 = useTimerStore();
    await useSettingsStore().load();
    vi.setSystemTime(BASE + 26 * 3600_000);
    await fresh3.loadActiveTimer();
    fresh3.detectBoundaryNeeds();
    expect(fresh3.needsRecovery).toBe(true);
    await fresh3.discardTimer();
    expect(fresh3.timer).toBeNull();
    expect(await getActiveTimer()).toBeNull();
  });

  it('plan_id 联动：结算保存后挂起询问，确认后 plans.done=true 且 done_at=now', async () => {
    useFakeDate();
    const book = await makeBook();
    const plan = await createRecord('plans', {
      title: '读 SICP 一小时',
      date: '2026-06-01',
      start_min: 600,
      end_min: 660,
      category_key: 'study',
      category_name: '学习',
      target_type: 'book',
      target_id: book.id,
      target_title: book.title,
      done: false,
      done_at: null,
      rollover_from_date: null,
      is_rolled_over: false,
    });
    await timer.startTimer({
      type: 'book',
      targetId: book.id,
      targetTitle: book.title,
      planId: plan.id,
      mode: 'stopwatch',
    });
    vi.setSystemTime(BASE + 5 * 60_000);
    await timer.endTimer();
    await timer.settleStudy({});
    expect(timer.pendingPlanQuestion?.planId).toBe(plan.id);
    expect(timer.pendingPlanQuestion?.planTitle).toBe('读 SICP 一小时');
    expect(timer.isSettling).toBe(false); // 计时已结算，只剩计划询问

    await timer.confirmPlanDone();
    expect(timer.pendingPlanQuestion).toBeNull();
    const after = await getRecord('plans', plan.id);
    expect(after?.done).toBe(true);
    expect(after?.done_at).toBe(BASE + 5 * 60_000);

    await timer.dismissPlanQuestion();
  });

  it('startTimer 校验：倒计时缺省 1500 秒；空名称 / 学习计时缺对象被拒绝', async () => {
    useFakeDate();
    const noTarget = await timer.startTimer({
      type: 'subject',
      targetId: null,
      targetTitle: '数学',
      mode: 'countdown',
    });
    expect(noTarget.ok).toBe(false);
    expect(noTarget.ok ? '' : noTarget.reason).toContain('请先选择对象');

    const subject = await makeSubject();
    const started = await timer.startTimer({
      type: 'subject',
      targetId: subject.id,
      targetTitle: subject.name,
      mode: 'countdown',
    });
    expect(started.ok).toBe(true);
    expect(timer.timer?.countdown_sec).toBe(1500);
    expect(timer.remainingSec).toBe(1500);
    await timer.discardTimer();

    const emptyTitle = await timer.startTimer({
      type: 'entertainment',
      targetId: null,
      targetTitle: '   ',
      mode: 'stopwatch',
    });
    expect(emptyTitle.ok).toBe(false);
    expect(emptyTitle.ok ? '' : emptyTitle.reason).toContain('名称');
  });
});
