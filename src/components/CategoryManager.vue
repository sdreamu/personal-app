<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import {
  addCategory,
  errorMessage,
  isBuiltinCategory,
  listCategories,
  removeCategory,
  renameCategory,
  undoDelete,
  type CategoryKind,
  type CategoryRecord,
} from '@/db';
import { useSaveStatusStore } from '@/stores/saveStatus';
import { useToastStore } from '@/stores/toast';

const props = defineProps<{ kind: CategoryKind; title: string; refreshKey?: number }>();

const items = ref<CategoryRecord[]>([]);
const newName = ref('');
const editingId = ref<string | null>(null);
const editingName = ref('');
const saveStatus = useSaveStatusStore();
const toast = useToastStore();

async function load(): Promise<void> {
  try {
    items.value = await listCategories(props.kind);
  } catch (err) {
    toast.error(`加载${props.title}失败：${errorMessage(err)}`);
  }
}
onMounted(load);
watch(
  () => props.refreshKey,
  () => {
    void load();
  },
);

async function handleAdd(): Promise<void> {
  const name = newName.value.trim();
  if (!name) return;
  try {
    saveStatus.begin();
    await addCategory(props.kind, name);
    newName.value = '';
    await load();
    saveStatus.idle();
    toast.success(`已添加${props.title}「${name}」`);
  } catch (err) {
    saveStatus.fail();
    toast.error(`添加失败：${errorMessage(err)}`);
  }
}

function startEdit(item: CategoryRecord): void {
  editingId.value = item.id;
  editingName.value = item.name;
}
function cancelEdit(): void {
  editingId.value = null;
  editingName.value = '';
}

async function saveEdit(): Promise<void> {
  const id = editingId.value;
  if (!id) return;
  const name = editingName.value.trim();
  if (!name) {
    toast.error('名称不能为空');
    return;
  }
  try {
    await renameCategory(props.kind, id, name);
    editingId.value = null;
    await load();
  } catch (err) {
    toast.error(`改名失败：${errorMessage(err)}`);
  }
}

async function handleRemove(item: CategoryRecord): Promise<void> {
  try {
    await removeCategory(props.kind, item.id);
    await load();
    toast.undoable(`已删除${props.title}「${item.name}」`, async () => {
      await undoDelete(props.kind, item.id);
      await load();
    });
  } catch (err) {
    toast.error(`删除失败：${errorMessage(err)}`);
  }
}
</script>

<template>
  <div class="category-manager" data-test="category-manager">
    <h3>{{ title }}</h3>
    <ul class="category-list">
      <li
        v-for="item in items"
        :key="item.id"
        class="category-row"
        :class="{ builtin: isBuiltinCategory(item) }"
        data-test="category-row"
      >
        <template v-if="editingId === item.id">
          <input v-model="editingName" class="text-input" data-test="edit-name" @keyup.enter="saveEdit" />
          <button class="ghost-btn" data-test="edit-save" @click="saveEdit">保存</button>
          <button class="ghost-btn" @click="cancelEdit">取消</button>
        </template>
        <template v-else>
          <span class="category-name">
            {{ item.name }}
            <span v-if="isBuiltinCategory(item)" class="badge" data-test="builtin-badge">内置</span>
          </span>
          <span v-if="!isBuiltinCategory(item)" class="category-ops">
            <button class="ghost-btn" data-test="edit" @click="startEdit(item)">改名</button>
            <button class="ghost-btn danger-text" data-test="delete" @click="handleRemove(item)">删除</button>
          </span>
        </template>
      </li>
    </ul>
    <div class="category-add">
      <input
        v-model="newName"
        class="text-input"
        data-test="new-name"
        placeholder="新增名称"
        @keyup.enter="handleAdd"
      />
      <button class="primary-btn" data-test="add" @click="handleAdd">添加</button>
    </div>
  </div>
</template>
