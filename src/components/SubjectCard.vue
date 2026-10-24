<script setup lang="ts">
import { computed } from 'vue';
import type { Subject } from '@/db';
import { useDateStore } from '@/stores/date';
import { daysUntil, type SubjectWeekStats } from '@/stores/library';
import SubjectWeekChart from './SubjectWeekChart.vue';

const props = defineProps<{ subject: Subject; stats: SubjectWeekStats | undefined }>();
const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'archive'): void;
  (e: 'restore'): void;
  (e: 'timer'): void;
  (e: 'manual'): void;
  (e: 'history'): void;
}>();

const dateStore = useDateStore();

const weekSec = computed(() => props.stats?.weekSec ?? 0);
const bars = computed(() => props.stats?.bars ?? [0, 0, 0, 0, 0, 0, 0]);

function formatMinCN(totalMin: number): string {
  if (totalMin <= 0) return '0';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m === 0) return `${h}h`;
  if (h > 0) return `${h}小时${m}分`;
  return `${m}分钟`;
}

const deadlineText = computed(() => {
  const deadline = props.subject.deadline;
  if (!deadline) return '无截止日期';
  try {
    const days = daysUntil(deadline, dateStore.selectedDate);
    if (days < 0) return '已过期';
    return `还剩 ${days} 天`;
  } catch {
    return '截止日期无效';
  }
});
</script>

<template>
  <article class="subject-card" :class="{ archived: subject.archived }" data-test="subject-card">
    <header class="subject-head">
      <h3 class="subject-name" data-test="subject-name">{{ subject.name }}</h3>
      <span v-if="subject.archived" class="badge">已归档</span>
      <span class="subject-deadline" data-test="subject-deadline">{{ deadlineText }}</span>
    </header>
    <p class="subject-week" data-test="subject-week">
      本周已学 <strong>{{ formatMinCN(Math.floor(weekSec / 60)) }}</strong>
      / 目标 <strong>{{ formatMinCN(subject.weekly_goal_min) }}</strong>
    </p>
    <SubjectWeekChart :bars="bars" />
    <div class="subject-ops">
      <button class="primary-btn" data-test="subject-timer" @click="emit('timer')">开始计时</button>
      <button class="ghost-btn" data-test="subject-manual" @click="emit('manual')">手动补记</button>
      <button class="ghost-btn" data-test="subject-history" @click="emit('history')">历史记录</button>
      <button class="ghost-btn" data-test="subject-edit" @click="emit('edit')">编辑</button>
      <button v-if="!subject.archived" class="ghost-btn" data-test="subject-archive" @click="emit('archive')">归档</button>
      <button v-else class="ghost-btn" data-test="subject-restore" @click="emit('restore')">取消归档</button>
      <button class="danger-btn" data-test="subject-delete" @click="emit('delete')">删除</button>
    </div>
  </article>
</template>

<style scoped>
.subject-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 14px 16px;
  margin-bottom: 12px;
}
.subject-card.archived { opacity: 0.72; }
.subject-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.subject-name { margin: 0; font-size: 16px; }
.subject-deadline { color: var(--warning); font-size: 13px; margin-left: auto; }
.subject-week { margin: 8px 0 0; color: var(--muted); }
.subject-week strong { color: var(--text); }
.subject-ops { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.subject-ops button { padding: 5px 12px; font-size: 13px; }
</style>
