<script setup lang="ts">
import { errorMessage } from '@/db';
import { useToastStore, type ToastItem } from '@/stores/toast';

const toast = useToastStore();

function doUndo(item: ToastItem): void {
  toast.remove(item.id);
  if (!item.undo) return;
  try {
    void Promise.resolve(item.undo.action()).catch((err: unknown) => {
      toast.error(`撤销失败：${errorMessage(err)}`);
    });
  } catch (err) {
    toast.error(`撤销失败：${errorMessage(err)}`);
  }
}
</script>

<template>
  <div class="toast-stack" data-test="toast-stack">
    <TransitionGroup name="toast">
      <div v-for="item in toast.items" :key="item.id" class="toast" :class="`toast-${item.type}`">
        <span class="toast-message">{{ item.message }}</span>
        <button v-if="item.undo" class="toast-undo" data-test="toast-undo" @click="doUndo(item)">
          {{ item.undo.label }}
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
