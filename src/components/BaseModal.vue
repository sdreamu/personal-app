<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useModalStore } from '@/stores/modal';

const props = defineProps<{ id: string; title: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const modalStore = useModalStore();
onMounted(() => modalStore.open(props.id));
onUnmounted(() => modalStore.close(props.id));

// 全局 Esc 把本弹窗从栈中弹出时，同步通知父组件关闭自身（普通弹窗，Esc 即时关闭）。
watch(
  () => modalStore.stack.includes(props.id),
  (open) => {
    if (!open) emit('close');
  },
  { flush: 'sync' },
);
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal" role="dialog" :aria-label="title">
        <header>
          <h3>{{ title }}</h3>
          <button type="button" class="icon-btn" aria-label="关闭" data-test="modal-close" @click="emit('close')">
            ✕
          </button>
        </header>
        <div class="modal-body">
          <slot />
        </div>
        <footer v-if="$slots.footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
