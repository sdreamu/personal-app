<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
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
    /** AC-86：手机端要能直接调相机拍一张（相机输入不带 multiple）。 */
    camera?: boolean;
    /** 将文字输入与照片操作组合为同一个录入区。 */
    embedded?: boolean;
  }>(),
  { max: 4, testKey: 'default', label: '图片', camera: false, embedded: false },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void;
  (e: 'busy-change', value: boolean): void;
}>();

const busy = ref(false);
const error = ref('');
let disposed = false;
onBeforeUnmount(() => { disposed = true; });

const images = computed(() => props.modelValue ?? []);
const remaining = computed(() => Math.max(0, props.max - images.value.length));
const isFull = computed(() => remaining.value === 0);

function update(next: string[]): void {
  emit('update:modelValue', next);
}

async function onPick(event: Event): Promise<void> {
  if (busy.value) return;
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
  emit('busy-change', true);
  const picked: string[] = [];
  try {
    for (const file of files.slice(0, slots)) {
      picked.push(await compressImageToDataUrl(file, props.deps === undefined ? {} : { deps: props.deps }));
    }
    if (disposed) return;
    update([...images.value, ...picked]);
    if (files.length > slots) error.value = '最多 ' + props.max + ' 张，多选的没有加进来';
  } catch {
    error.value = '这张图读不出来，换一张再试';
  } finally {
    busy.value = false;
    if (!disposed) emit('busy-change', false);
  }
}

function removeAt(index: number): void {
  error.value = '';
  update(images.value.filter((_, cursor) => cursor !== index));
}
</script>

<template>
  <div class="image-input" :class="{ 'image-composer': embedded }" :aria-busy="busy" data-test="image-input">
    <div class="image-head">
      <span class="image-label">{{ label }}</span>
      <span class="image-count num" data-test="image-count">{{ images.length }} / {{ max }} 张</span>
    </div>

    <slot />

    <div class="image-sources">
      <label v-if="camera" class="image-camera" :class="{ disabled: busy || isFull }">
        <span class="image-camera-text"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5 6 8H3v12h18V8h-3l-2-3Z"/><circle cx="12" cy="13" r="4"/></svg>拍照</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          :aria-label="label + '：拍照'"
          :disabled="busy || isFull"
          :data-test="'image-camera-' + testKey"
          @change="onPick"
        />
      </label>
      <label class="image-pick" :class="{ disabled: busy || isFull }">
        <span class="image-pick-text"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg>{{ camera ? '上传照片' : '选择图片' }}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          :aria-label="label + '：上传照片'"
          :disabled="busy || isFull"
          :data-test="'image-file-' + testKey"
          @change="onPick"
        />
      </label>
    </div>

    <p v-if="busy" role="status" class="image-hint" :data-test="'image-busy-' + testKey">正在处理照片…</p>
    <p v-if="error" role="alert" class="image-error" :data-test="'image-error-' + testKey">{{ error }}</p>

    <ul v-if="images.length > 0" class="image-grid" :data-test="'image-grid-' + testKey">
      <li v-for="(src, index) in images" :key="'image-' + index" class="image-cell">
        <img :src="src" :alt="label + ' 第 ' + (index + 1) + ' 张'" data-test="image-thumb" />
        <button
          type="button"
          class="image-remove"
          :aria-label="'删除第 ' + (index + 1) + ' 张图片'"
          :data-test="'image-remove-' + testKey"
          :disabled="busy"
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
.image-sources {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
/* 原生 file 输入覆盖视觉按钮，保留系统相机及文件选择行为。 */
.image-camera,
.image-pick {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.image-camera input[type='file'],
.image-pick input[type='file'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  font-size: 0;
}
.image-camera-text,
.image-pick-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 8px 14px;
  font-size: 13px;
  color: var(--accent);
  background: var(--accent-soft);
}
.image-sources svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.image-sources label:focus-within { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: var(--radius-pill); }
.image-sources .disabled { opacity: 0.45; }
.image-composer { border: 1px solid var(--border); border-radius: var(--radius); background: var(--panel); padding: 14px; gap: 12px; }
.image-composer .image-head { justify-content: space-between; }
.image-composer .image-label { font-weight: 600; }
.image-composer .image-count { font-size: 12px; }
.image-composer :slotted(textarea) { width: 100%; box-sizing: border-box; min-height: 76px; resize: vertical; border: none; background: transparent; color: var(--text); font: inherit; padding: 4px 0; line-height: 1.6; }
.image-composer :slotted(textarea:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: var(--radius-small); }
.image-camera:hover .image-camera-text,
.image-pick:hover .image-pick-text {
  border-color: var(--accent);
}
/* 直接用的 file 输入（没有包在 label 里时）保留可见样式 */
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
  width: 88px;
  height: 88px;
  border-radius: var(--radius);
  border: var(--line-w) solid var(--border-ink);
  background: var(--panel);
}
.image-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius);
  display: block;
}
.image-remove {
  position: absolute;
  top: 0;
  right: 0;
  width: 44px;
  height: 44px;
  line-height: 1;
  padding: 0;
  border: var(--line-w) solid var(--border-ink);
  border-radius: 50%;
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
}
</style>
