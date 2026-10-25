import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ImageInput from './ImageInput.vue';
import type { ImageDeps } from '@/utils/image';

/** 假的压缩依赖：不碰 canvas，直接把原尺寸原样"画"成固定 dataURL。 */
function fakeDeps(size = { width: 3000, height: 2000 }): ImageDeps {
  return {
    async load() {
      return size;
    },
    createCanvas() {
      return {
        draw() {
          /* 记录用不着 */
        },
        toDataURL() {
          return 'data:image/jpeg;base64,FAKE';
        },
      };
    },
  };
}

function mountInput(props: Record<string, unknown> = {}) {
  return mount(ImageInput, {
    props: { modelValue: [], deps: fakeDeps(), ...props },
  });
}

function fileList(count: number): File[] {
  return Array.from({ length: count }, (_, index) => new File(['x'], 'p' + index + '.png', { type: 'image/png' }));
}

async function pick(wrapper: ReturnType<typeof mountInput>, count: number, testKey = 'default'): Promise<void> {
  const input = wrapper.find('[data-test="image-file-' + testKey + '"]');
  Object.defineProperty(input.element, 'files', { value: fileList(count), writable: false });
  await input.trigger('change');
  // 压缩是逐个 await 的异步链，多刷几轮微任务再断言
  await flushPromises();
  await wrapper.vm.$nextTick();
}

describe('图片录入（P2）', () => {
  it('选一张图：压缩后 emit update:modelValue，张数计数更新', async () => {
    const wrapper = mountInput();
    expect(wrapper.find('[data-test="image-count"]').text()).toBe('0 / 4 张');

    await pick(wrapper, 1);
    const emitted = wrapper.emitted('update:modelValue')?.[0]?.[0] as string[];
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toBe('data:image/jpeg;base64,FAKE');
  });

  it('单组上限 4 张：一次选 6 张只收 4 张，并提示超出的没有加进来', async () => {
    const wrapper = mountInput();
    await pick(wrapper, 6);
    const emitted = wrapper.emitted('update:modelValue')?.[0]?.[0] as string[];
    expect(emitted).toHaveLength(4);
    expect(wrapper.text()).toContain('最多 4 张');
  });

  it('已经满了：输入框 disabled，张数显示 4 / 4', async () => {
    const wrapper = mountInput({ modelValue: ['a', 'b', 'c', 'd'] });
    expect(wrapper.find('[data-test="image-count"]').text()).toBe('4 / 4 张');
    expect((wrapper.find('[data-test="image-file-default"]').element as HTMLInputElement).disabled).toBe(true);
  });

  it('删掉某一张：按位置移除后 emit', async () => {
    const wrapper = mountInput({ modelValue: ['a', 'b', 'c'] });
    await wrapper.findAll('[data-test="image-remove-default"]')[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual(['a', 'c']);
  });

  it('压缩失败：给中文错误提示，不写空图', async () => {
    const wrapper = mount(ImageInput, {
      props: {
        modelValue: [],
        deps: {
          async load() {
            throw new Error('boom');
          },
          createCanvas() {
            return { draw() {}, toDataURL: () => '' };
          },
        },
      },
    });
    await pick(wrapper, 1);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.find('[data-test="image-error-default"]').text()).toContain('读不出来');
  });

  it('多组同页用 testKey 区分，互不影响', async () => {
    const wrapper = mountInput({ testKey: 'question' });
    await pick(wrapper, 2, 'question');
    const emitted = wrapper.emitted('update:modelValue')?.[0]?.[0] as string[];
    expect(emitted).toHaveLength(2);

    // 受控组件：把 emit 出去的值回灌，缩略图与删除按钮就在 question 这组里
    await wrapper.setProps({ modelValue: emitted });
    expect(wrapper.find('[data-test="image-grid-question"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="image-thumb"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-test="image-remove-question"]')).toHaveLength(2);
  });
});
