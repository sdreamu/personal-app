import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import ClearDataModal from './ClearDataModal.vue';

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

describe('清空二次确认', () => {
  it('必须手动输入“清空”二字才能点击确认', async () => {
    const onConfirm = vi.fn(async () => undefined);
    const wrapper = mount(ClearDataModal, {
      props: { onConfirm },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });

    const button = wrapper.find('[data-test="confirm-clear"]');
    expect(button.attributes('disabled')).toBeDefined();

    await wrapper.find('[data-test="clear-input"]').setValue('清');
    expect(wrapper.find('[data-test="confirm-clear"]').attributes('disabled')).toBeDefined();
    expect(onConfirm).not.toHaveBeenCalled();

    await wrapper.find('[data-test="clear-input"]').setValue('清空');
    expect(wrapper.find('[data-test="confirm-clear"]').attributes('disabled')).toBeUndefined();

    await wrapper.find('[data-test="confirm-clear"]').trigger('click');
    await flushPromises();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('取消按钮触发 close 事件', async () => {
    const onConfirm = vi.fn(async () => undefined);
    const wrapper = mount(ClearDataModal, {
      props: { onConfirm },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    const buttons = wrapper.findAll('button');
    const cancel = buttons.find((b) => b.text() === '取消');
    expect(cancel).toBeDefined();
    await cancel?.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
