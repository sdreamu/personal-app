<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useHomeStore } from '@/stores/home';
import { formatDuration } from '@/utils/date';

/**
 * 今日四项摘要与进度来自 home store 的聚合 getter；点击进入对应模块。
 * 运动替代原来的顶部饮水摘要，下方饮水快捷记录独立保留。
 */
interface HomeTile {
  key: 'plan' | 'study' | 'workout' | 'play';
  label: string;
  main: string;
  sub: string;
  route: string;
  progress: number;
  icon: string;
}

const router = useRouter();
const home = useHomeStore();

const tiles = computed<HomeTile[]>(() => {
  const { done, total } = home.planSummary;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;
  return [
    { key: 'plan', label: '待办完成率', main: `${done}/${total}`, sub: `完成率 ${rate}%`, route: '/plan', progress: rate, icon: 'M9 12l2 2 4-5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0' },
    {
      key: 'study',
      label: '学习时长',
      main: formatDuration(home.study.totalSec),
      sub: `目标 ${home.study.goalMin} 分钟`,
      route: '/study/timer',
      progress: home.study.goalMin > 0 ? home.study.totalSec / (home.study.goalMin * 60) * 100 : 0,
      icon: 'M9 2h6m-3 7v4l3 2m5-2a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    },
    {
      key: 'workout',
      label: '运动',
      main: home.workout.isRest ? '休息日' : home.workout.done ? '已完成' : '待训练',
      sub: home.workout.isRest ? '今日无训练计划' : `今日计划：${home.workout.typeName}`,
      route: '/life/workout',
      progress: home.workout.done ? 100 : 0,
      icon: 'M3 9v6m3-9v12m0-6h12m0-6v12m3-9v6',
    },
    {
      key: 'play',
      label: '娱乐时长',
      main: `${home.play.usedMin} 分钟`,
      sub: `目标 ${home.play.limitMin} 分钟`,
      route: '/life/play',
      progress: home.play.limitMin > 0 ? home.play.usedMin / home.play.limitMin * 100 : 0,
      icon: 'M8 10v6m-3-3h6m5-2h.1m2 4h.1M7 6h10a4 4 0 0 1 4 4v7a3 3 0 0 1-5 2l-2-2h-4l-2 2a3 3 0 0 1-5-2v-7a4 4 0 0 1 4-4',
    },
  ];
});

function go(route: string): void {
  void router.push(route);
}
</script>

<template>
  <div class="home-tiles" data-test="home-tiles">
    <button
      v-for="tile in tiles"
      :key="tile.key"
      type="button"
      class="home-tile"
      :data-test="`tile-${tile.key}`"
      @click="go(tile.route)"
    >
      <span class="tile-label" :data-test="`tile-${tile.key}-label`"><svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="tile.icon" /></svg>{{ tile.label }}</span>
      <span class="tile-main num" :data-test="`tile-${tile.key}-main`">{{ tile.main }}</span>
      <span class="tile-sub" :data-test="`tile-${tile.key}-sub`">{{ tile.sub }}</span>
      <span class="tile-progress" aria-hidden="true"><i :style="{ width: `${Math.min(100, Math.max(0, tile.progress))}%` }" /></span>
    </button>
  </div>
</template>

<style scoped>
.home-tiles {
  display: flex;
  gap: 0;
  align-self: flex-end;
}
.home-tile {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 18px;
  min-width: 92px;
  text-align: left;
  background: none;
  border: none;
  border-left: 1px solid var(--field-tick);
  color: var(--hero-ink);
  cursor: pointer;
}
.home-tile:first-child {
  border-left: none;
}
.home-tile:hover .tile-main {
  color: var(--hero-sub);
}
.tile-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--hero-sub);
}
.tile-main {
  font-size: 17px;
  font-weight: 600;
  color: var(--hero-ink);
}
.tile-sub {
  font-size: 12px;
  color: var(--hero-sub);
}
@media (max-width: 980px) {
  .home-tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 0;
    align-self: stretch;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--field-tick);
  }
  .home-tile {
    padding: 4px 10px;
  }
  .home-tile:nth-child(odd) {
    padding-left: 0;
    border-left: none;
  }
}
</style>
