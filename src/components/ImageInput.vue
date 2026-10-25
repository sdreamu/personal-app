<script setup lang="ts">
import { computed, ref } from 'vue';
import { compressImageToDataUrl, type ImageDeps } from '@/utils/image';

/**
 * 图片录入（P2 · 错题照片）：选图 → 压缩成 JPEG data URL（最长边 1400 / 质量 0.72）→ 存进数组。
 * 压缩逻辑不在这里重写，全部复用 `src/utils/image.ts`；`deps` 只给测试注入假实现用。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string[];
    /** 单组上限（Q6：题目 4 张 + 订正 4 张）。 */
    max?: number;
    /** 输入框/删除按钮的 data-test 后缀，方便同页多组区分。 */
    testKey?: string;
    label?: string;
    deps?: ImageDeps;
  }>(),
  { max: 4, testKey: 'default', label: '图片' },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: string[]): void }>();

const busy = ref(false);
const error = ref('');

const images = computed(() => props.modelValue ?? []);
const remaining = computed(() => Math.max(0, props.max - images.value.length));
const isFull = computed(() => remaining.value === 0);

function update(next: string[]): void {
  emit('update:modelValue', next);
}

async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length === 0) return;

  error.value = '';
  const slots = remaining.value;
  if (slots === 0) {
    error.value = '最多 ' + props.max + ' 张，先删一张再添加';
    return;
  }

  busy.value = true;
  const picked: string[] = [];
  try {
    for (const file of files.slice(0, slots)) {
      picked.push(await compressImageToDataUrl(file, props.deps === undefined ? {} : { deps: props.deps }));
    }
    update([...images.value, ...picked]);
    if (files.length > slots) error.value = '最多 ' + props.max + ' 张，多选的没有加进来';
  } catch {
    error.value = '这张图读不出来，换一张再试';
  } finally {
    busy.value = false;
  }
}

function removeAt(index: number): void {
  error.value = '';
  update(images.value.filter((_, cursor) => cursor !== index));
}
</script>

<template>
  <div class="image-input" data-test="image-input">
    <div class="image-head">
      <span class="image-label">{{ label }}</span>
      <span class="image-count num" data-test="image-count">{{ images.length }} / {{ max }} 张</span>
    </div>

    <input
      type="file"
      accept="image/*"
      multiple
      :disabled="busy || isFull"
      :data-test="'image-file-' + testKey"
      @change="onPick"
    />

    <p v-if="busy" class="image-hint" :data-test="'image-busy-' + testKey">正在压缩…</p>
    <p v-if="error" class="image-error" :data-test="'image-error-' + testKey">{{ error }}</p>

    <ul v-if="images.length > 0" class="image-grid" :data-test="'image-grid-' + testKey">
      <li v-for="(src, index) in images" :key="'image-' + index" class="image-cell">
        <img :src="src" :alt="label + ' 第 ' + (index + 1) + ' 张'" data-test="image-thumb" />
        <button
          type="button"
          class="image-remove"
          :aria-label="'删除第 ' + (index + 1) + ' 张图片'"
          :data-test="'image-remove-' + testKey"
          @click="removeAt(index)"
        >
          ✕
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.image-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.image-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--muted);
}
.image-label {
  color: var(--text);
}
.image-input input[type='file'] {
  font: inherit;
  font-size: 12px;
  color: var(--muted);
}
.image-hint {
  margin: 0;
  color: var(--muted);
}
.image-error {
  margin: 0;
  color: var(--danger);
}
.image-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.image-cell {
  position: relative;
  width: 72px;
  height: 72px;
  border: var(--line-w) solid var(--border-ink);
  background: var(--panel);
}
.image-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.image-remove {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  line-height: 1;
  padding: 0;
  border: var(--line-w) solid var(--border-ink);
  border-radius: 50%;
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
}
</style>
