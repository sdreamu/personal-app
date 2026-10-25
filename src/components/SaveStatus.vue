<script setup lang="ts">
import { useSaveStatusStore } from '@/stores/saveStatus';

const saveStatus = useSaveStatusStore();
</script>

<template>
  <span class="save-status num" :class="saveStatus.status" data-test="save-status">
    <template v-if="saveStatus.status === 'saving'">保存中...</template>
    <template v-else-if="saveStatus.status === 'error'">⚠ 保存失败</template>
    <template v-else>已自动保存 ✓</template>
  </span>
</template>
