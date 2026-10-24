<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { errorMessage, getRecord, type Book } from '@/db';
import { capEntertainmentMinutes, useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';
import { formatDuration } from '@/utils/date';

/**
 * 全局结算弹窗（挂载在 App.vue，任何页面下只要有待结算计时就显示）。
 * 也负责计时状态机的其余全局弹层：12 小时恢复、倒计时归零、不足 1 分钟询问、
 * 计划块完成联动询问。
 * 防逃逸：不注册进 modal store（Esc 全局关闭只作用于 modal store 栈顶），
 * 且遮罩不绑定点击关闭。
 */
const timerStore = useTimerStore();
const toast = useToastStore();

const note = ref('');
// Vue 3.5 对 type="number" 的 v-model 会自动转数字，因此允许 number | string。
const endPage = ref<string | number>('');
const minutes = ref<string | number>('');
const durationOverrideSec = ref<string | number>('');
const startPageHint = ref<number | null>(null);
const shortSessionConfirmed = ref(false);
const saving = ref(false);

const showRecovery = computed(() => timerStore.needsRecovery);
const showCountdownPrompt = computed(() => timerStore.showCountdownFinishedPrompt && !timerStore.isSettling);
const showShortConfirm = computed(
  () => timerStore.isSettling && timerStore.isUnderOneMinute && !shortSessionConfirmed.value,
);
const showSettleForm = computed(() => timerStore.isSettling && !showShortConfirm.value);
const showPlanQuestion = computed(
  () =>
    timerStore.pendingPlanQuestion !== null &&
    !timerStore.isSettling &&
    !showCountdownPrompt.value &&
    !showRecovery.value,
);
const visible = computed(
  () => showRecovery.value || showCountdownPrompt.value || timerStore.isSettling || showPlanQuestion.value,
);

const settleSeconds = computed(() => Math.floor(timerStore.elapsedMs / 1000));
const settleText = computed(() => formatDuration(settleSeconds.value));
const isBook = computed(() => timerStore.timer?.type === 'book');
const isEntertainment = computed(() => timerStore.timer?.type === 'entertainment');

const endPageInvalid = computed(() => {
  if (!isBook.value || !showSettleForm.value) return false;
  const raw = String(endPage.value).trim();
  const value = Number(raw);
  return raw === '' || !Number.isInteger(value) || value < 0;
});
const minutesInvalid = computed(() => {
  if (!isEntertainment.value || !showSettleForm.value) return false;
  const raw = String(minutes.value).trim();
  const value = Number(raw);
  return raw === '' || !Number.isInteger(value) || value < 1;
});
const overrideInvalid = computed(() => {
  if (!timerStore.durationOverrideAllowed || !showSettleForm.value) return false;
  const raw = String(durationOverrideSec.value).trim();
  const value = Number(raw);
  return raw === '' || !Number.isInteger(value) || value < 0;
});
const canSave = computed(
  () => !saving.value && !endPageInvalid.value && !minutesInvalid.value && !overrideInvalid.value,
);

// 计时行变化（新计时 / 结束 / 清空）时重置表单；
// 书结算时读库取“起始参考”（当前页）并作为“读到第几页”的默认值。
watch(
  () => {
    const t = timerStore.timer;
    return t === null ? 'none' : `${t.id}:${t.ended_at ?? 'running'}`;
  },
  async () => {
    shortSessionConfirmed.value = false;
    note.value = '';
    endPage.value = '';
    minutes.value = '';
    durationOverrideSec.value = '';
    startPageHint.value = null;
    const t = timerStore.timer;
    if (!t || t.ended_at === null) return;
    durationOverrideSec.value = String(settleSeconds.value);
    if (t.type === 'book' && t.target_id !== null) {
      try {
        const book: Book | undefined = await getRecord('books', t.target_id);
        startPageHint.value = book?.current_page ?? null;
        endPage.value = String(book?.current_page ?? 0);
      } catch {
        startPageHint.value = null;
      }
    } else if (t.type === 'entertainment') {
      // 预填值必须与落库值一致：娱乐倒计时按设定时长封顶（复用 timer store 的同一个纯函数），
      // 正计时仍按实际时长向上取整；学习计时（含学习倒计时）不经过这里，行为不变。
      const actualMinutes = Math.max(1, Math.ceil(settleSeconds.value / 60));
      minutes.value = String(capEntertainmentMinutes(actualMinutes, t.mode, t.countdown_sec));
    }
  },
  { immediate: true },
);

async function save(): Promise<void> {
  const t = timerStore.timer;
  if (!t || t.ended_at === null || saving.value) return;
  saving.value = true;
  try {
    if (t.type === 'entertainment') {
      await timerStore.settleEntertainment({ minutes: Number(String(minutes.value)) });
    } else {
      await timerStore.settleStudy({
        note: note.value.trim() === '' ? null : note.value.trim(),
        endPage: t.type === 'book' ? Number(String(endPage.value)) : null,
        durationSecOverride: timerStore.durationOverrideAllowed
          ? Number(String(durationOverrideSec.value))
          : undefined,
      });
    }
    toast.success('已保存');
  } catch (err) {
    toast.error(`保存失败：${errorMessage(err)}`);
  } finally {
    saving.value = false;
  }
}

async function discard(): Promise<void> {
  try {
    await timerStore.discardTimer();
  } catch (err) {
    toast.error(`操作失败：${errorMessage(err)}`);
  }
}

function onShortContinue(): void {
  shortSessionConfirmed.value = true;
}

function onRecoveryContinue(): void {
  timerStore.continueAfterRecovery();
}

async function onRecoveryEndWithOverride(): Promise<void> {
  try {
    await timerStore.endWithDurationOverride();
  } catch (err) {
    toast.error(`操作失败：${errorMessage(err)}`);
  }
}

async function onCountdownNextRound(): Promise<void> {
  await timerStore.settleAndStartNextRound();
}

async function onCountdownEnd(): Promise<void> {
  try {
    await timerStore.endTimer();
  } catch (err) {
    toast.error(`操作失败：${errorMessage(err)}`);
  }
}

async function onPlanConfirm(): Promise<void> {
  try {
    await timerStore.confirmPlanDone();
  } catch (err) {
    toast.error(`操作失败：${errorMessage(err)}`);
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="settlement-overlay modal-overlay" data-test="settlement-overlay">
      <div class="modal settlement-modal" role="dialog" aria-label="计时结算" data-test="settlement-modal">
        <!-- 12 小时恢复 -->
        <template v-if="showRecovery">
          <header>
            <h3>计时恢复</h3>
          </header>
          <div class="modal-body">
            <p>检测到进行中的计时已超过 12 小时，请选择如何处理：</p>
          </div>
          <footer>
            <button class="ghost-btn" data-test="recovery-continue" @click="onRecoveryContinue">继续计时</button>
            <button class="primary-btn" data-test="recovery-end-override" @click="onRecoveryEndWithOverride">
              结束并手动修改时长
            </button>
            <button class="danger-btn" data-test="recovery-discard" @click="discard">直接丢弃</button>
          </footer>
        </template>

        <!-- 倒计时归零 -->
        <template v-else-if="showCountdownPrompt">
          <header>
            <h3>倒计时结束</h3>
          </header>
          <div class="modal-body">
            <p data-test="countdown-finished-text">本轮倒计时已结束。</p>
          </div>
          <footer>
            <button class="primary-btn" data-test="countdown-next-round" @click="onCountdownNextRound">
              再来一轮
            </button>
            <button class="ghost-btn" data-test="countdown-end" @click="onCountdownEnd">结束</button>
          </footer>
        </template>

        <!-- 不足 1 分钟询问 -->
        <template v-else-if="showShortConfirm">
          <header>
            <h3>计时过短</h3>
          </header>
          <div class="modal-body">
            <p data-test="short-confirm-text">计时不足 1 分钟，是否直接丢弃？</p>
          </div>
          <footer>
            <button class="danger-btn" data-test="short-discard" @click="discard">直接丢弃</button>
            <button class="primary-btn" data-test="short-continue" @click="onShortContinue">继续结算保存</button>
          </footer>
        </template>

        <!-- 结算表单 -->
        <template v-else-if="showSettleForm">
          <header>
            <h3>{{ isEntertainment ? '娱乐计时结算' : '学习计时结算' }}</h3>
          </header>
          <div class="modal-body settlement-body">
            <p class="settle-target" data-test="settle-target">
              {{ timerStore.targetTitle }}
              <span class="badge">{{ settleText }}</span>
            </p>
            <div class="settle-duration" data-test="settle-duration">本次有效时长：{{ settleText }}</div>
            <div v-if="timerStore.durationOverrideAllowed" class="field">
              <label for="settle-duration-override">有效时长（秒，可修改）</label>
              <input
                id="settle-duration-override"
                v-model="durationOverrideSec"
                type="number"
                min="0"
                step="1"
                data-test="settle-duration-override"
              />
            </div>
            <div v-if="isBook" class="field">
              <p class="hint" data-test="settle-start-page">起始参考：第 {{ startPageHint ?? 0 }} 页</p>
              <label for="settle-end-page">读到第几页（必填）</label>
              <input id="settle-end-page" v-model="endPage" type="number" min="0" step="1" data-test="settle-end-page" />
            </div>
            <div v-if="!isEntertainment" class="field">
              <label for="settle-note">收获（可跳过）</label>
              <textarea id="settle-note" v-model="note" rows="2" data-test="settle-note"></textarea>
            </div>
            <div v-if="isEntertainment" class="field">
              <label for="settle-minutes">折算分钟数（可微调）</label>
              <input id="settle-minutes" v-model="minutes" type="number" min="1" step="1" data-test="settle-minutes" />
            </div>
          </div>
          <footer>
            <button class="danger-btn" data-test="settle-discard" :disabled="saving" @click="discard">丢弃</button>
            <button class="primary-btn" data-test="settle-save" :disabled="!canSave" @click="save">保存</button>
          </footer>
        </template>

        <!-- 计划块完成询问 -->
        <template v-else-if="showPlanQuestion">
          <header>
            <h3>计划联动</h3>
          </header>
          <div class="modal-body">
            <p data-test="plan-question-text">
              是否将关联的计划时间块“{{ timerStore.pendingPlanQuestion?.planTitle }}”标记为完成？
            </p>
          </div>
          <footer>
            <button class="ghost-btn" data-test="plan-question-dismiss" @click="timerStore.dismissPlanQuestion()">
              暂不
            </button>
            <button class="primary-btn" data-test="plan-question-confirm" @click="onPlanConfirm">是，标记完成</button>
          </footer>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settlement-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.settle-target {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-weight: 600;
}
.settle-duration {
  color: var(--muted);
}
.settlement-modal textarea {
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 8px;
  padding: 8px 10px;
  resize: vertical;
  font: inherit;
  color: inherit;
}
.settlement-modal .field label {
  color: var(--muted);
}
.settlement-modal footer {
  flex-wrap: wrap;
}
</style>
