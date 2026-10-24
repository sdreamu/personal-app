import { onMounted, onUnmounted } from 'vue';
import { useModalStore } from '@/stores/modal';

/**
 * 全局 Esc 关闭普通弹窗（栈顶）。
 * 在 App.vue 中调用一次；第 2 阶段的计时结算弹窗按 PRD 规定不可被 Esc 关闭，
 * 届时用独立机制豁免（不注册进 modal store 即可）。
 */
export function useEscToCloseModal(): void {
  const modalStore = useModalStore();
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && modalStore.top !== null) {
      modalStore.closeTop();
    }
  }
  onMounted(() => window.addEventListener('keydown', onKeydown));
  onUnmounted(() => window.removeEventListener('keydown', onKeydown));
}
