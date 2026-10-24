import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { listCategories, resetDbForTests } from '@/db';
import CategoryManager from './CategoryManager.vue';
import ToastStack from './ToastStack.vue';

const Host = defineComponent({
  components: { CategoryManager, ToastStack },
  template:
    '<div><CategoryManager kind="plan_categories" title="计划分类" /><ToastStack /></div>',
});

let pinia: Pinia;

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeEach(async () => {
  pinia = createPinia();
  setActivePinia(pinia);
  await resetDbForTests();
});

describe('分类管理组件', () => {
  it('内置分类不可删除/改名（无删除与改名按钮），自定义分类可增删且 5 秒内可撤销', async () => {
    const wrapper = mount(Host, { global: { plugins: [pinia] } });
    await flushPromises();
    await waitFor(() => wrapper.findAll('[data-test="category-row"]').length > 0);

    const builtinRow = wrapper
      .findAll('[data-test="category-row"]')
      .find((row) => row.text().includes('学习'));
    expect(builtinRow).toBeDefined();
    if (!builtinRow) throw new Error('缺少内置“学习”行');
    expect(builtinRow.text()).toContain('内置');
    expect(builtinRow.find('[data-test="delete"]').exists()).toBe(false);
    expect(builtinRow.find('[data-test="edit"]').exists()).toBe(false);

    await wrapper.find('input[data-test="new-name"]').setValue('摸鱼');
    await wrapper.find('button[data-test="add"]').trigger('click');
    await waitFor(() =>
      wrapper
        .findAll('[data-test="category-row"]')
        .some((row) => row.text().includes('摸鱼')),
    );

    const customRow = wrapper
      .findAll('[data-test="category-row"]')
      .find((row) => row.text().includes('摸鱼'));
    if (!customRow) throw new Error('自定义分类未出现');
    expect(customRow.find('[data-test="delete"]').exists()).toBe(true);
    expect(customRow.find('[data-test="edit"]').exists()).toBe(true);
    expect((await listCategories('plan_categories')).map((c) => c.name)).toContain('摸鱼');

    await customRow.find('[data-test="delete"]').trigger('click');
    await waitFor(() =>
      !wrapper
        .findAll('[data-test="category-row"]')
        .some((row) => row.text().includes('摸鱼')),
    );
    expect(
      wrapper.findAll('[data-test="category-row"]').some((row) => row.text().includes('摸鱼')),
    ).toBe(false);
    expect((await listCategories('plan_categories')).map((c) => c.name)).not.toContain('摸鱼');

    const undo = wrapper.find('[data-test="toast-undo"]');
    expect(undo.exists()).toBe(true);
    await undo.trigger('click');
    await waitFor(() =>
      wrapper
        .findAll('[data-test="category-row"]')
        .some((row) => row.text().includes('摸鱼')),
    );
    expect((await listCategories('plan_categories')).map((c) => c.name)).toContain('摸鱼');
  });
});
