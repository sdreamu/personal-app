<script setup lang="ts">
const props = defineProps<{
  title?: string;
  description?: string;
  actionLabel?: string;
  icon?: string;
}>();
const emit = defineEmits<{ (e: 'action'): void }>();
</script>

<template>
  <div class="empty-state" data-test="empty-state">
    <div class="empty-icon" aria-hidden="true">{{ props.icon ?? '🗂' }}</div>
    <h3 v-if="props.title" class="empty-title">{{ props.title }}</h3>
    <p v-if="props.description" class="empty-desc">{{ props.description }}</p>
    <button v-if="props.actionLabel" class="primary-btn" data-test="empty-action" @click="emit('action')">
      {{ props.actionLabel }}
    </button>
    <slot />
  </div>
</template>
