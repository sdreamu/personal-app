<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useHomeStore } from '@/stores/home';
import { useSettingsStore } from '@/stores/settings';
import { useTimerStore } from '@/stores/timer';
import { formatDuration, offsetToTime } from '@/utils/date';

/**
 * 首页六张汇总卡片（4a）：只读渲染 home store 的聚合结果；
 * 直接操作按钮复用 home store 动作（内部再复用各模块 store），卡片点击跳对应页面。
 */
const router = useRouter();
const home = useHomeStore();
const settings = useSettingsStore();
const timerStore = useTimerStore();

function go(path: string): void {
  void router.push(path);
}

function timeRange(startMin: number, endMin: number): string {
  return `${offsetToTime(startMin, settings.dayStartMin)}–${offsetToTime(endMin, settings.dayStartMin)}`;
}

/**
 * 学习卡的「开始计时」：带着当前在读的书直接开计时（PRD §3.2 把这里列在"可直接操作"）。
 * 已经有计时在跑就只跳到对应的计时页，让用户继续/结算，不重复开工。
 */
async function startStudy(): Promise<void> {
  if (timerStore.timer !== null) {
    go(timerStore.targetRoute);
    return;
  }
  const book = home.mainBook;
  if (book !== null) {
    try {
      const result = await timerStore.startTimer({
        type: 'book',
        targetId: book.id,
        targetTitle: book.title,
        mode: 'stopwatch',
      });
      if (!result.ok) {
        go('/study/timer');
        return;
      }
    } catch {
      go('/study/timer');
      return;
    }
  }
  go('/study/timer');
}

async function addWater(): Promise<void> {
  try {
    await home.addWater();
  } catch {
    // 写库失败已由 store 统一提示
  }
}

async function removeWater(): Promise<void> {
  try {
    await home.removeWater();
  } catch {
    // 写库失败已由 store 统一提示
  }
}

async function completeNext(): Promise<void> {
  try {
    await home.completeNext();
  } catch {
    // 写库失败已由 store 统一提示
  }
}
</script>

<template>
  <div class="home-cards" data-test="home-cards">
    <!-- 今日计划 -->
    <article class="home-card" data-test="plan-card" @click="go('/plan')">
      <h2>今日计划</h2>
      <div v-if="!home.hasGoals" class="card-empty" data-test="plan-guide">
        <span>先去设置里定今日目标</span>
        <button class="primary-btn" data-test="plan-guide-btn" @click.stop="go('/settings')">去设置</button>
      </div>
      <template v-else>
        <p class="card-main" data-test="plan-progress">
          已完成 {{ home.planSummary.done }} / {{ home.planSummary.total }}
        </p>
        <div v-if="home.planSummary.next" class="card-sub" data-test="plan-next">
          下一项：{{ home.planSummary.next.title }}
          <span class="muted">（{{ timeRange(home.planSummary.next.start_min ?? 0, home.planSummary.next.end_min ?? 0) }}）</span>
        </div>
        <p v-else class="card-sub muted" data-test="plan-empty">今日无未完成时间块</p>
        <button
          v-if="home.planSummary.next"
          class="primary-btn"
          data-test="plan-complete-next"
          @click.stop="completeNext"
        >
          勾选下一项
        </button>
      </template>
    </article>

    <!-- 学习 -->
    <article class="home-card" data-test="study-card" @click="go('/study/timer')">
      <h2>学习</h2>
      <p class="card-main" data-test="study-text">
        {{ formatDuration(home.study.totalSec) }} / 目标 {{ home.study.goalMin }} 分钟
      </p>
      <div class="progress-track" data-test="study-progress">
        <div class="progress-fill" :style="{ width: home.study.progressPercent + '%' }" />
      </div>
      <button class="primary-btn" data-test="study-start" @click.stop="startStudy">开始计时</button>
    </article>

    <!-- 阅读 -->
    <article class="home-card" data-test="reading-card" @click="go(home.mainBook ? '/study/books/' + home.mainBook.id : '/study/books')">
      <h2>阅读</h2>
      <template v-if="home.mainBook">
        <p class="card-main" data-test="reading-title">{{ home.mainBook.title }}</p>
        <p class="card-sub" data-test="reading-progress">
          {{ home.mainBook.current_page }} / {{ home.mainBook.total_pages }} 页
        </p>
        <button
          class="primary-btn"
          data-test="reading-continue"
          @click.stop="go('/study/timer?type=book&id=' + home.mainBook.id)"
        >
          继续阅读
        </button>
      </template>
      <template v-else>
        <p class="card-sub muted" data-test="reading-empty">去书架添加一本书</p>
        <button class="primary-btn" data-test="reading-go-books" @click.stop="go('/study/books')">去书架</button>
      </template>
    </article>

    <!-- 喝水 -->
    <article class="home-card" data-test="water-card" @click="go('/life/diet')">
      <h2>喝水</h2>
      <p class="card-main" data-test="water-text">
        {{ home.water.totalMl }} ml / 目标 {{ home.water.goalMl }} ml
      </p>
      <div class="water-actions">
        <button
          type="button"
          class="ghost-btn"
          data-test="water-minus"
          :disabled="home.water.totalMl <= 0"
          @click.stop="removeWater"
        >
          −1 杯
        </button>
        <button type="button" class="primary-btn" data-test="water-plus" @click.stop="addWater">
          +1 杯
        </button>
      </div>
    </article>

    <!-- 运动 -->
    <article class="home-card" data-test="workout-card" @click="go('/life/workout')">
      <h2>运动</h2>
      <template v-if="home.workout.isRest">
        <p class="card-main" data-test="workout-rest">今天休息</p>
      </template>
      <template v-else>
        <p class="card-main" data-test="workout-type">{{ home.workout.typeName }}</p>
        <p class="card-sub" data-test="workout-status">
          {{ home.workout.done ? '已完成' : '未完成' }}
        </p>
      </template>
      <button class="primary-btn" data-test="workout-go" @click.stop="go('/life/workout')">去训练</button>
    </article>

    <!-- 娱乐 -->
    <article class="home-card" data-test="play-card" @click="go('/life/play')">
      <h2>娱乐</h2>
      <p class="card-main" data-test="play-text">
        已用 {{ home.play.usedMin }} / {{ home.play.limitMin }} 分钟
      </p>
      <p class="card-sub" data-test="play-remaining">
        剩余 {{ home.play.remainingMin }} 分钟<span v-if="home.play.over" class="danger-text">（已超额度）</span>
      </p>
    </article>
  </div>
</template>

<style scoped>
/* v5：六块并成一张「各模块」纸——2px 外框 + 1px 内格，不再各自飘一张卡片 */
.home-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin-top: 22px;
  background: var(--panel);
  border: var(--line-w) solid var(--border-ink);
  box-shadow: var(--shadow);
}
.home-card {
  padding: 14px 16px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.home-card:nth-child(3n) {
  border-right: none;
}
.home-card:nth-last-child(-n + 3) {
  border-bottom: none;
}
.home-card:hover {
  background: var(--panel-2);
}
.home-card h2 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.card-main {
  margin: 0 0 6px;
  font-family: var(--font-mono);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.card-sub {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text);
}
.muted {
  color: var(--muted);
  font-size: 13px;
}
.danger-text {
  color: var(--danger);
}
.progress-track {
  height: 6px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  overflow: hidden;
  margin: 8px 0 12px;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}
.card-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  color: var(--muted);
  margin-bottom: 10px;
}
.water-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.water-actions .ghost-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* 卡片里的按钮降一档：一排黑按钮会抢走松绿场的主角 */
.home-card .primary-btn {
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow);
}
.home-card .primary-btn:hover {
  background: var(--panel-2);
  opacity: 1;
}
@media (max-width: 980px) {
  .home-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .home-card:nth-child(3n) {
    border-right: 1px solid var(--border);
  }
  .home-card:nth-child(2n) {
    border-right: none;
  }
  .home-card:nth-last-child(-n + 3) {
    border-bottom: 1px solid var(--border);
  }
  .home-card:nth-last-child(-n + 2) {
    border-bottom: none;
  }
}
</style>
