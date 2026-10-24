<script setup lang="ts">
import { computed } from 'vue';
import { useDateStore } from '@/stores/date';
import { formatDateCNWeekday } from '@/utils/date';
import SaveStatus from './SaveStatus.vue';
import TimerCapsule from './TimerCapsule.vue';

const dateStore = useDateStore();
const dateLabel = computed(() => formatDateCNWeekday(dateStore.selectedDate));
</script>

<template>
  <div class="topbar">
    <div class="brand">Evan的专属APP</div>
    <div class="date-switch">
      <button class="icon-btn" data-test="prev-day" title="前一天" @click="dateStore.prevDay()">◀</button>
      <span class="date-label" data-test="date-label">{{ dateLabel }}</span>
      <button class="icon-btn" data-test="next-day" title="后一天" @click="dateStore.nextDay()">▶</button>
      <button v-if="!dateStore.isToday" class="today-btn" data-test="go-today" @click="dateStore.goToday()">
        回到今天
      </button>
    </div>
    <div class="spacer"></div>
    <TimerCapsule />
    <SaveStatus />
  </div>
</template>
