<script setup lang="ts">
import { computed } from 'vue';
import { addDays, formatDateCNWeekday, logicalToday, parseDateKey } from '@/utils/date';
import { useSettingsStore } from '@/stores/settings';
import BaseModal from './BaseModal.vue';
import MonthCalendar from './MonthCalendar.vue';

/**
 * 顶栏日期跳转弹窗：顶部月历（MonthCalendar）+ 原生 <input type="date"> 选任意一天 + 常用快捷。
 * Esc 与点击遮罩关闭复用 BaseModal（注册进 modal store）→ App.vue 的
 * useEscToCloseModal 一次性监听，不另造一套 Esc 机制。
 */
const props = defineProps<{ selectedDate: string }>();
const emit = defineEmits<{ (e: 'select', date: string): void; (e: 'close'): void }>();

const settingsStore = useSettingsStore();

const today = computed(() => logicalToday(settingsStore.dayStartMin));
const currentLabel = computed(() => formatDateCNWeekday(props.selectedDate));

/** 快捷一律相对“今天”（与按钮名称的字面含义一致）。 */
const quickOptions = computed(() => [
  { test: 'quick-yesterday', label: '昨天', date: addDays(today.value, -1) },
  { test: 'quick-day-before', label: '前天', date: addDays(today.value, -2) },
  { test: 'quick-week-ago', label: '一周前', date: addDays(today.value, -7) },
]);

function pick(date: string): void {
  if (parseDateKey(date) === null) return;
  emit('select', date);
}

/**
 * 上一次由日期输入处理过的原始值。
 * 原生 <input type="date"> 改值时会先后触发 input 与 change（同一个值），
 * 不去重就会连跳两次——所以同一个值只认第一次。
 */
let lastInputValue: string | null = null;

/** 原生日期输入只在完整合法日期时给值；清空/半成品不触发跳转。 */
function onDateInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  if (value === lastInputValue) return;
  lastInputValue = value;
  pick(value);
}
</script>

<template>
  <BaseModal id="date-jump" title="跳转到某一天" @close="emit('close')">
    <div class="date-jump" data-test="date-jump-popover">
      <MonthCalendar :selected-date="selectedDate" @select="pick" />
      <p class="date-jump-current" data-test="popover-current">
        当前：<strong>{{ currentLabel }}</strong>
      </p>
      <label class="date-jump-field">
        <span>选择日期</span>
        <input
          type="date"
          class="date-jump-input"
          data-test="date-input"
          :value="selectedDate"
          @input="onDateInput"
          @change="onDateInput"
        />
      </label>
      <div class="date-jump-quick">
        <button class="primary-btn" data-test="popover-today" @click="pick(today)">今天</button>
        <button
          v-for="option in quickOptions"
          :key="option.test"
          class="ghost-btn"
          :data-test="option.test"
          :title="option.date"
          @click="pick(option.date)"
        >
          {{ option.label }}
        </button>
      </div>
      <p class="hint">快捷键：← / → 切换前后一天，T 或 Home 回到今天。</p>
    </div>
  </BaseModal>
</template>

<style scoped>
.date-jump { display: flex; flex-direction: column; gap: 12px; }
.date-jump-current { margin: 0; }
.date-jump-field { display: flex; align-items: center; gap: 10px; }
.date-jump-input {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  padding: 4px 8px;
}
.date-jump-quick { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
