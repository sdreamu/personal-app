<script setup lang="ts">
import EmptyState from './EmptyState.vue';

defineProps<{ title: string }>();
</script>

<template>
  <section class="page">
    <h1 class="page-title">{{ title }}</h1>
    <EmptyState title="敬请期待" description="该模块将在后续阶段实现" icon="🚧" />
  </section>
</template>
