<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useHomeStore } from '@/stores/home';
import { useSettingsStore } from '@/stores/settings';
import { formatDuration, offsetToTime } from '@/utils/date';

/**
 * 首页六张汇总卡片（4a）：只读渲染 home store 的聚合结果；
 * 直接操作按钮复用 home store 动作（内部再复用各模块 store），卡片点击跳对应页面。
 */
const router = useRouter();
const home = useHomeStore();
const settings = useSettingsStore();

function go(path: string): void {
  void router.push(path);
}

function timeRange(startMin: number, endMin: number): string {
  return `${offsetToTime(startMin, settings.dayStartMin)}–${offsetToTime(endMin, settings.dayStartMin)}`;
}

async function addWater(): Promise<void> {
  try {
    await home.addWater();
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
      <button class="primary-btn" data-test="study-start" @click.stop="go('/study/timer')">开始计时</button>
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
      <button class="primary-btn" data-test="water-plus" @click.stop="addWater">+1 杯</button>
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
.home-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}
.home-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 18px;
  box-shadow: var(--shadow);
  cursor: pointer;
}
.home-card:hover {
  border-color: var(--accent);
}
.home-card h2 {
  margin: 0 0 10px;
  font-size: 16px;
}
.card-main {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.card-sub {
  margin: 0 0 10px;
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
  height: 8px;
  border-radius: 999px;
  background: var(--panel-2);
  overflow: hidden;
  margin: 8px 0 12px;
}
.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
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
</style>
