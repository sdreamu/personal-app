<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BaseModal from './BaseModal.vue';

const props = defineProps<{ onConfirm: () => Promise<void> }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const inputText = ref('');
const busy = ref(false);
const canConfirm = computed(() => inputText.value.trim() === '清空' && !busy.value);

onMounted(() => {
  inputText.value = '';
});

async function confirm(): Promise<void> {
  if (!canConfirm.value) return;
  busy.value = true;
  try {
    await props.onConfirm();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseModal id="clear-data-modal" title="清空所有数据" @close="emit('close')">
    <p class="danger-text">此操作将删除本机数据库中的全部数据，无法撤销。</p>
    <p class="hint">强烈建议先执行“导出备份”，再继续操作。</p>
    <p class="hint">请输入 <strong>清空</strong> 二字以启用确认按钮：</p>
    <input
      v-model="inputText"
      type="text"
      class="text-input"
      data-test="clear-input"
      placeholder="清空"
      :disabled="busy"
    />
    <template #footer>
      <button class="ghost-btn" @click="emit('close')">取消</button>
      <button class="danger-btn" data-test="confirm-clear" :disabled="!canConfirm" @click="confirm">
        确认清空
      </button>
    </template>
  </BaseModal>
</template>
