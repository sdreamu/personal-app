import { defineStore } from 'pinia';
import {
  clearActiveTimer,
  createRecord,
  errorMessage,
  getActiveTimer,
  getRecord,
  setActiveTimer,
  updateRecord,
  uuid,
  type ActiveTimer,
  type PlayRecord,
  type StudyRecord,
} from '@/db';
import { APP_NAME } from '@/config/app';
import { logicalDateOf } from '@/utils/date';
import { useSaveStatusStore } from './saveStatus';
import { useSettingsStore } from './settings';
import { useToastStore } from './toast';

export const DEFAULT_COUNTDOWN_SEC = 1500;
export const OVERRUN_RECOVERY_THRESHOLD_MS = 12 * 60 * 60 * 1000;
export const MIN_SETTLE_SESSION_MS = 60 * 1000;
export const MIN_SETTLE_MINUTES = 1;
export const APP_TITLE = APP_NAME;
export const COUNTDOWN_FINISH_TITLE = '⏰ 时间到！';

export interface NewTimerInput {
  type: 'book' | 'subject' | 'entertainment';
  targetId: string | null;
  targetTitle: string;
  planId?: string | null;
  mode: 'stopwatch' | 'countdown';
  countdownSec?: number;
}

export interface SettleStudyPayload {
  note?: string | null;
  endPage?: number | null;
  durationSecOverride?: number | null;
}

export interface SettleEntertainmentPayload {
  minutes?: number;
}

export type StartTimerResult = { ok: true } | { ok: false; reason: string };

/**
 * 娱乐结算分钟数（纯函数，用户拍板规则）：
 * - 正计时：按实际有效时长向上取整，最少 1 分钟（与既有行为一致）；
 * - 倒计时：默认结算 min(实际用时, 设定时长)，向上取整到分钟且最少 1 分钟——
 *   到点后一直不点结束、挂到 45 分钟才结束的 30 分钟倒计时仍记 30 分钟。
 * 显式传入的分钟数同样不允许超过设定时长（结算弹窗的预填值来自实际时长，含到点后的溢出部分）。
 */
export function capEntertainmentMinutes(
  minutes: number,
  mode: 'stopwatch' | 'countdown',
  countdownSec: number,
): number {
  const normalized = Math.max(MIN_SETTLE_MINUTES, Math.floor(minutes));
  if (mode !== 'countdown') return normalized;
  const capMinutes = Math.max(MIN_SETTLE_MINUTES, Math.ceil(countdownSec / 60));
  return Math.min(normalized, capMinutes);
}

export interface PendingPlanQuestion {
  planId: string;
  planTitle: string;
}

/**
 * 全局计时状态机（第 2 阶段）：持久化到 active_timer 单行（key='global'）。
 * 进行中（ended_at=null）与待结算（ended_at 非空）都占用全局唯一计时位；
 * 刷新/重开后 init() 按时间戳重建进度，并检测 12 小时超时与倒计时归零。
 * 内存态（recoveryPending / countdownFinishedPrompt / durationOverrideAllowed /
 * pendingPlanQuestion）不落库，仅用于驱动全局弹窗，不改变 active_timer 字段。
 */
export const useTimerStore = defineStore('timer', {
  state: () => ({
    timer: null as ActiveTimer | null,
    nowTick: 0,
    _intervalId: null as number | null,
    _flashIntervalId: null as number | null,
    recoveryPending: false,
    recoveryDismissedFor: null as string | null,
    countdownFinishedPrompt: false,
    durationOverrideAllowed: false,
    pendingPlanQuestion: null as PendingPlanQuestion | null,
  }),
  getters: {
    /** 进行中（started_at 有值且未写 ended_at；含暂停状态）。 */
    isRunning(): boolean {
      return this.timer !== null && this.timer.ended_at === null;
    },
    /** 待结算（ended_at 非空，等待“保存/丢弃”）。 */
    isSettling(): boolean {
      return this.timer !== null && this.timer.ended_at !== null;
    },
    /** 暂停中（仅进行中的计时可能暂停）。 */
    isPaused(): boolean {
      return this.timer !== null && this.timer.ended_at === null && this.timer.paused;
    },
    targetTitle(): string {
      return this.timer?.target_title ?? '';
    },
    /** 学习计时（书/科目）→ #/study/timer；娱乐计时 → #/life/play。 */
    targetRoute(): string {
      return this.timer?.type === 'entertainment' ? '/life/play' : '/study/timer';
    },
    /**
     * 有效已用毫秒：墙钟 - started_at - paused_total_ms - 暂停中段的当前长度；
     * 待结算按 ended_at 冻结；不含暂停；倒计时不封顶（封顶见 usedMs / remainingSec）。
     */
    elapsedMs(): number {
      const t = this.timer;
      if (!t) return 0;
      const end = t.ended_at ?? (this.nowTick > 0 ? this.nowTick : Date.now());
      let used = end - t.started_at - t.paused_total_ms;
      if (t.ended_at === null && t.paused && t.pause_started_at !== null) {
        used -= end - t.pause_started_at;
      }
      return Math.max(0, used);
    },
    /** 胶囊显示用：同 elapsedMs，但倒计时封顶在设定长度（第 1 阶段行为保持）。 */
    usedMs(): number {
      if (!this.timer) return 0;
      const used = this.elapsedMs;
      if (this.timer.mode === 'countdown' && this.timer.ended_at === null) {
        return Math.min(used, this.timer.countdown_sec * 1000);
      }
      return used;
    },
    /** 倒计时剩余毫秒（正计时或待结算为 0）。 */
    remainingMs(): number {
      if (!this.timer || this.timer.mode !== 'countdown' || this.timer.ended_at !== null) return 0;
      return Math.max(0, this.timer.countdown_sec * 1000 - this.elapsedMs);
    },
    /** 倒计时剩余秒（向上取整，归零后为 0）。 */
    remainingSec(): number {
      return Math.ceil(this.remainingMs / 1000);
    },
    /** 倒计时已到点（进行中且有效时长达到设定值）。 */
    isCountdownFinished(): boolean {
      const t = this.timer;
      if (!t || t.ended_at !== null || t.mode !== 'countdown') return false;
      return this.elapsedMs >= t.countdown_sec * 1000;
    },
    /** 待结算且有效时长不足 1 分钟（UI 需先询问是否丢弃）。 */
    isUnderOneMinute(): boolean {
      return this.isSettling && this.elapsedMs < MIN_SETTLE_SESSION_MS;
    },
    /** 进行中的计时超过 12 小时，等待用户选择处理方式（内存态）。 */
    needsRecovery(): boolean {
      return this.recoveryPending;
    },
    /** 倒计时归零提示是否展示（12 小时恢复优先）。 */
    showCountdownFinishedPrompt(): boolean {
      return this.countdownFinishedPrompt && !this.recoveryPending;
    },
    /**
     * 目标保护查询（2b/2c 删除/归档防呆）：计时中或待结算都返回 true。
     * 用法：timerStore.isTargetActive(id)。
     */
    isTargetActive(): (targetId: string | null) => boolean {
      return (targetId: string | null) =>
        targetId !== null && this.timer !== null && this.timer.target_id === targetId;
    },
    /** 仅“待结算”的目标保护查询（进行中的计时不包含）。 */
    isTargetSettling(): (targetId: string | null) => boolean {
      return (targetId: string | null) =>
        targetId !== null &&
        this.timer !== null &&
        this.timer.ended_at !== null &&
        this.timer.target_id === targetId;
    },
  },
  actions: {
    /** 应用启动时调用：载入持久化计时、启动每秒心跳并检测边界（12h / 倒计时归零）。 */
    init(): Promise<void> {
      this.nowTick = Date.now();
      if (this._intervalId === null) {
        this._intervalId = window.setInterval(() => this.tick(), 1000);
      }
      return this.loadActiveTimer()
        .then(() => this.detectBoundaryNeeds())
        .catch(() => undefined);
    },
    dispose() {
      if (this._intervalId !== null) {
        window.clearInterval(this._intervalId);
        this._intervalId = null;
      }
      this.stopTitleFlash();
    },
    async loadActiveTimer() {
      this.timer = await getActiveTimer();
    },
    async clearActiveTimer() {
      await clearActiveTimer();
      this.timer = null;
    },

    /** 每秒心跳：刷新显示时钟 + 边界检测（倒计时归零 / 12 小时超时）。 */
    tick() {
      this.nowTick = Date.now();
      this.detectBoundaryNeeds();
    },
    /** 按当前时间戳重建进度并检测边界（刷新/重开后由 init 调用，可重复调用）。 */
    detectBoundaryNeeds() {
      const t = this.timer;
      if (!t || t.ended_at !== null || this.recoveryPending) return;
      if (this.recoveryDismissedFor !== t.id && this.elapsedMs > OVERRUN_RECOVERY_THRESHOLD_MS) {
        this.recoveryPending = true;
        this.stopTitleFlash();
        return;
      }
      if (t.mode === 'countdown' && this.elapsedMs >= t.countdown_sec * 1000 && !this.countdownFinishedPrompt) {
        this.countdownFinishedPrompt = true;
        this.startTitleFlash();
      }
    },
    /** 12 小时恢复弹窗选“继续计时”。 */
    continueAfterRecovery() {
      this.recoveryDismissedFor = this.timer?.id ?? null;
      this.recoveryPending = false;
      this.detectBoundaryNeeds();
    },
    /** 12 小时恢复弹窗选“结束并手动修改时长”：进入待结算并允许覆盖时长。 */
    async endWithDurationOverride(): Promise<void> {
      await this.endTimer();
      this.recoveryPending = false;
      this.durationOverrideAllowed = true;
    },

    /**
     * 开始一次新计时（全局单实例）。存在进行中或待结算计时时拒绝并 toast 提示。
     * 倒计时缺省 1500 秒；娱乐计时的 target_id 即娱乐内容名称。
     */
    async startTimer(input: NewTimerInput): Promise<StartTimerResult> {
      if (this.timer !== null) {
        const reason =
          this.timer.ended_at !== null
            ? '有待结算的计时未处理，请先保存或丢弃'
            : '已有计时进行中，请先结束当前计时';
        useToastStore().error(reason);
        return { ok: false, reason };
      }
      const title = input.targetTitle.trim();
      if (title === '') {
        const reason = '计时对象名称不能为空';
        useToastStore().error(reason);
        return { ok: false, reason };
      }
      if (input.type !== 'entertainment' && input.targetId === null) {
        const reason = '请先选择对象';
        useToastStore().error(reason);
        return { ok: false, reason };
      }
      const mode: 'stopwatch' | 'countdown' = input.mode === 'countdown' ? 'countdown' : 'stopwatch';
      const countdownSec =
        mode === 'countdown' ? Math.max(1, Math.round(input.countdownSec ?? DEFAULT_COUNTDOWN_SEC)) : DEFAULT_COUNTDOWN_SEC;
      const now = Date.now();
      const row: ActiveTimer = {
        key: 'global',
        id: uuid(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
        type: input.type,
        target_id: input.type === 'entertainment' ? (input.targetId ?? title) : input.targetId,
        target_title: title,
        plan_id: input.planId ?? null,
        mode,
        countdown_sec: countdownSec,
        started_at: now,
        paused_total_ms: 0,
        paused: false,
        pause_started_at: null,
        ended_at: null,
      };
      await this.runWithSaveStatus(async () => {
        await setActiveTimer(row);
        this.timer = row;
      });
      this.resetTransientFlags();
      this.nowTick = now;
      return { ok: true };
    },
    /** 暂停：写 paused=true / pause_started_at（进行中且未暂停时生效）。 */
    async pauseTimer(): Promise<void> {
      const t = this.timer;
      if (!t || t.ended_at !== null || t.paused) return;
      const now = Date.now();
      const next: ActiveTimer = { ...t, paused: true, pause_started_at: now };
      await this.runWithSaveStatus(async () => {
        await setActiveTimer(next);
        this.timer = next;
      });
      this.nowTick = now;
    },
    /** 继续：结算本次暂停段并写 paused=false。 */
    async resumeTimer(): Promise<void> {
      const t = this.timer;
      if (!t || t.ended_at !== null || !t.paused) return;
      const now = Date.now();
      const segment = Math.max(0, now - (t.pause_started_at ?? now));
      const next: ActiveTimer = {
        ...t,
        paused: false,
        pause_started_at: null,
        paused_total_ms: t.paused_total_ms + segment,
      };
      await this.runWithSaveStatus(async () => {
        await setActiveTimer(next);
        this.timer = next;
      });
      this.nowTick = now;
      this.detectBoundaryNeeds();
    },
    /**
     * 结束（进入待结算）：立即写 ended_at（若仍处于暂停，先合入暂停段），
     * 随后由全局结算弹窗接管；不足 1 分钟的询问由弹窗根据 isUnderOneMinute 发起。
     */
    async endTimer(): Promise<void> {
      const t = this.timer;
      if (!t || t.ended_at !== null) return;
      const now = Date.now();
      const next: ActiveTimer = { ...t, ended_at: now };
      if (next.paused && next.pause_started_at !== null) {
        next.paused_total_ms += Math.max(0, now - next.pause_started_at);
        next.paused = false;
        next.pause_started_at = null;
      }
      await this.runWithSaveStatus(async () => {
        await setActiveTimer(next);
        this.timer = next;
      });
      this.countdownFinishedPrompt = false;
      this.stopTitleFlash();
      this.nowTick = now;
    },
    /**
     * 结算保存学习计时：生成 study_records 并更新书的当前页。
     * 书：start_page=结算时该书 current_page，endPage 必填缺省同值，
     * pages_read=max(0,endPage-start_page)，保存后 book.current_page=endPage。
     * 若 startTimer 时带了 plan_id，保存成功后挂起“标记计划完成”询问。
     */
    async settleStudy(payload: SettleStudyPayload = {}): Promise<StudyRecord> {
      const t = this.timer;
      if (!t || t.ended_at === null) throw new Error('当前没有待结算的学习计时');
      if (t.type === 'entertainment') throw new Error('娱乐计时请使用娱乐结算');
      const targetType: 'book' | 'subject' = t.type;
      const endedAt: number = t.ended_at;
      const baseSec = Math.floor(Math.max(0, endedAt - t.started_at - t.paused_total_ms) / 1000);
      const durationSec =
        payload.durationSecOverride !== undefined && payload.durationSecOverride !== null
          ? Math.max(0, Math.floor(payload.durationSecOverride))
          : baseSec;
      const dayStartMin = useSettingsStore().dayStartMin;
      const date = logicalDateOf(t.started_at, dayStartMin);

      let bookId: string | null = null;
      let startPage: number | null = null;
      let endPage: number | null = null;
      let pagesRead: number | null = null;
      if (t.type === 'book' && t.target_id !== null) {
        const book = await getRecord('books', t.target_id);
        if (book) {
          bookId = book.id;
          startPage = book.current_page;
          endPage =
            payload.endPage !== undefined && payload.endPage !== null
              ? Math.max(0, Math.floor(payload.endPage))
              : book.current_page;
          pagesRead = Math.max(0, endPage - startPage);
        }
      }

      const record = await this.runWithSaveStatus(async () => {
        const created = await createRecord('study_records', {
          target_type: targetType,
          target_id: t.target_id,
          target_title: t.target_title,
          start_at: t.started_at,
          end_at: endedAt,
          duration_sec: durationSec,
          note: payload.note ?? null,
          start_page: startPage,
          end_page: endPage,
          pages_read: pagesRead,
          source: 'timer',
          date,
        });
        if (bookId !== null && endPage !== null) {
          await updateRecord('books', bookId, { current_page: endPage });
        }
        await clearActiveTimer();
        return created;
      });
      this.timer = null;
      this.resetTransientFlags();
      if (t.plan_id !== null) {
        try {
          const plan = await getRecord('plans', t.plan_id);
          this.pendingPlanQuestion = { planId: t.plan_id, planTitle: plan?.title ?? t.target_title };
        } catch {
          // 计划读取失败不阻断结算，仅跳过联动询问
        }
      }
      this.nowTick = Date.now();
      return record;
    },
    /**
     * 结算保存娱乐计时：默认分钟数 = 向上取整的实际有效时长（最少 1 分钟），可被 payload.minutes 覆盖；
     * 倒计时再按设定时长封顶（见 capEntertainmentMinutes），正计时行为不变。
     */
    async settleEntertainment(payload: SettleEntertainmentPayload = {}): Promise<PlayRecord> {
      const t = this.timer;
      if (!t || t.ended_at === null) throw new Error('当前没有待结算的娱乐计时');
      if (t.type !== 'entertainment') throw new Error('学习计时请使用学习结算');
      const baseSec = Math.floor(Math.max(0, t.ended_at - t.started_at - t.paused_total_ms) / 1000);
      const defaultMinutes = Math.max(MIN_SETTLE_MINUTES, Math.ceil(baseSec / 60));
      const requestedMinutes =
        payload.minutes !== undefined && payload.minutes !== null
          ? Math.max(MIN_SETTLE_MINUTES, Math.floor(payload.minutes))
          : defaultMinutes;
      const minutes = capEntertainmentMinutes(requestedMinutes, t.mode, t.countdown_sec);
      const dayStartMin = useSettingsStore().dayStartMin;
      const date = logicalDateOf(t.started_at, dayStartMin);
      const record = await this.runWithSaveStatus(async () => {
        const created = await createRecord('play_records', {
          date,
          content: t.target_title,
          minutes,
          source: 'timer',
        });
        await clearActiveTimer();
        return created;
      });
      this.timer = null;
      this.resetTransientFlags();
      this.nowTick = Date.now();
      return record;
    },
    /** 丢弃本次计时：清空 active_timer，不留任何记录。 */
    async discardTimer(): Promise<void> {
      if (!this.timer) return;
      await this.runWithSaveStatus(async () => {
        await clearActiveTimer();
      });
      this.timer = null;
      this.resetTransientFlags();
      this.nowTick = Date.now();
    },
    /**
     * 倒计时到点弹窗选“再来一轮”：按默认值结算本轮（不打断式询问计划联动），
     * 并立即以同对象同设置开启下一轮。
     */
    async settleAndStartNextRound(): Promise<StartTimerResult> {
      const t = this.timer;
      if (!t || t.ended_at !== null || !this.isCountdownFinished) {
        return { ok: false, reason: '当前没有到点的倒计时' };
      }
      const prevType = t.type;
      const prevTargetId = t.target_id;
      const prevTitle = t.target_title;
      const prevPlanId = t.plan_id;
      const prevMode = t.mode;
      const prevCountdownSec = t.countdown_sec;
      try {
        await this.endTimer();
        if (prevType === 'entertainment') {
          await this.settleEntertainment({});
        } else {
          await this.settleStudy({});
        }
      } catch (err) {
        useToastStore().error(`保存失败：${errorMessage(err)}`);
        return { ok: false, reason: errorMessage(err) };
      }
      this.pendingPlanQuestion = null;
      return this.startTimer({
        type: prevType,
        targetId: prevTargetId,
        targetTitle: prevTitle,
        planId: prevPlanId,
        mode: prevMode,
        countdownSec: prevCountdownSec,
      });
    },
    /** 计划联动询问选“是”：plans.done=true、done_at=now。 */
    async confirmPlanDone(): Promise<void> {
      const question = this.pendingPlanQuestion;
      if (!question) return;
      await this.runWithSaveStatus(async () => {
        await updateRecord('plans', question.planId, { done: true, done_at: Date.now() });
      });
      this.pendingPlanQuestion = null;
      useToastStore().success('已标记计划完成');
    },
    /** 计划联动询问选“暂不”。 */
    dismissPlanQuestion() {
      this.pendingPlanQuestion = null;
    },

    /** 标题闪烁：⏰ 时间到！ ↔ 应用名（网页打开时有效）。 */
    startTitleFlash() {
      this.stopTitleFlash();
      let on = false;
      document.title = APP_TITLE;
      this._flashIntervalId = window.setInterval(() => {
        on = !on;
        document.title = on ? COUNTDOWN_FINISH_TITLE : APP_TITLE;
      }, 600);
    },
    stopTitleFlash() {
      if (this._flashIntervalId !== null) {
        window.clearInterval(this._flashIntervalId);
        this._flashIntervalId = null;
      }
      if (document.title !== APP_TITLE) document.title = APP_TITLE;
    },
    resetTransientFlags() {
      this.recoveryPending = false;
      this.recoveryDismissedFor = null;
      this.countdownFinishedPrompt = false;
      this.durationOverrideAllowed = false;
      this.pendingPlanQuestion = null;
      this.stopTitleFlash();
    },

    /** 写库动作统一包保存状态（保存中/失败红条 + 失败 toast）。 */
    async runWithSaveStatus<T>(fn: () => Promise<T>): Promise<T> {
      const saveStatus = useSaveStatusStore();
      saveStatus.begin();
      try {
        const result = await fn();
        saveStatus.idle();
        return result;
      } catch (err) {
        saveStatus.fail();
        useToastStore().error(`保存失败：${errorMessage(err)}`);
        throw err;
      }
    },
  },
});
