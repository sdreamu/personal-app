import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { useEscToCloseModal } from '@/composables/useEscToCloseModal';
import BaseModal from './BaseModal.vue';

let pinia: Pinia;

const Host = defineComponent({
  components: { BaseModal },
  setup() {
    useEscToCloseModal();
    const open = ref(true);
    return { open };
  },
  template: '<BaseModal v-if="open" id="m1" title="测试弹窗" @close="open = false">内容</BaseModal>',
});

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

describe('全局 Esc 与弹窗', () => {
  it('Esc 关闭普通弹窗（栈顶）', async () => {
    const wrapper = mount(Host, {
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    expect(wrapper.find('.modal').exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.modal').exists()).toBe(false);
  });

  it('点击遮罩关闭普通弹窗', async () => {
    const wrapper = mount(Host, {
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    await wrapper.find('.modal-overlay').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.modal').exists()).toBe(false);
  });
});
