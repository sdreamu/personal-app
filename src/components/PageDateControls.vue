<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { showsDateSwitch } from '@/config/nav';
import { useDateStore } from '@/stores/date';
import { formatDateCNWeekday } from '@/utils/date';
import DateJumpPopover from './DateJumpPopover.vue';
const route = useRoute();
const dateStore = useDateStore();
const dateLabel = computed(() => formatDateCNWeekday(dateStore.selectedDate));
const showDateControls = computed(() => showsDateSwitch(route.path));
const jumpOpen = ref(false);
watch(() => route.path, () => { jumpOpen.value = false; });
function onJumpSelect(date: string): void {
  dateStore.setSelected(date);
  jumpOpen.value = false;
}
</script>
<template>
  <div v-if="showDateControls" class="page-date-controls" data-test="page-date-controls">
    <div class="date-switch" data-test="date-switch">
      <button class="icon-btn" data-test="prev-day" title="前一天" @click="dateStore.prevDay()">◀</button>
      <button
        type="button"
        class="date-label"
        data-test="date-label"
        title="点击跳转到指定日期"
        aria-haspopup="dialog"
        :aria-expanded="jumpOpen"
        @click="jumpOpen = true"
      >
        {{ dateLabel }}
      </button>
      <button class="icon-btn" data-test="next-day" title="后一天" @click="dateStore.nextDay()">▶</button>
      <button v-if="!dateStore.isToday" class="today-btn" data-test="go-today" title="回到今天" @click="dateStore.goToday()">
        回到今天
      </button>
    </div>
    <DateJumpPopover
      v-if="jumpOpen"
      :selected-date="dateStore.selectedDate"
      @select="onJumpSelect"
      @close="jumpOpen = false"
    />
  </div>
</template>
<style scoped>
.page-date-controls { margin-bottom: 16px; }
.date-switch { flex-wrap: wrap; }
.date-label { border-radius: var(--radius-pill); border: 1px solid var(--border); background: var(--panel); padding: 8px; min-height: 44px; cursor: pointer; }
</style>
