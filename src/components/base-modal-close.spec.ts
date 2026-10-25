import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { useEscToCloseModal } from '@/composables/useEscToCloseModal';
import { useModalStore } from '@/stores/modal';
import BaseModal from './BaseModal.vue';

const PROJECT_ROOT = process.cwd();

/** 递归列出 src 下所有 .vue 文件（跳过 .spec.ts，那些文件里 <BaseModal> 是字符串不是用法）。 */
function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...vueFiles(full));
    else if (entry.name.endsWith('.vue')) out.push(full);
  }
  return out;
}

/** 从 '<BaseModal' 起，按引号配对跳到开始标签的 '>' 为止（属性值里的 > 不会截断）。 */
function openingTagAt(source: string, start: number): string {
  let index = start + '<BaseModal'.length;
  let quote: string | null = null;
  while (index < source.length) {
    const char = source[index] as string;
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === '\'') {
      quote = char;
    } else if (char === '>') {
      return source.slice(start, index + 1);
    }
    index += 1;
  }
  throw new Error('未闭合的 <BaseModal 标签');
}

/** 收集一段模板源码里所有 <BaseModal> 开始标签及所在行号。 */
function baseModalTags(source: string): { tag: string; line: number }[] {
  const tags: { tag: string; line: number }[] = [];
  let cursor = source.indexOf('<BaseModal');
  while (cursor !== -1) {
    tags.push({ tag: openingTagAt(source, cursor), line: source.slice(0, cursor).split('\n').length });
    cursor = source.indexOf('<BaseModal', cursor + 1);
  }
  return tags;
}

function hasCloseBinding(tag: string): boolean {
  return /@close\s*=/.test(tag) || /v-on:close\s*=/.test(tag);
}

/** 故意不绑 @close 的父组件：模拟"弹窗自己以为关了、父组件不理会"的场景。 */
const ForgetfulHost = defineComponent({
  components: { BaseModal },
  setup() {
    useEscToCloseModal();
    const open = ref(true);
    return { open };
  },
  template: '<BaseModal v-if="open" id="forgetful" title="测试弹窗">内容</BaseModal>',
});

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

describe('BaseModal 关闭契约（守卫）', () => {
  it('全库 <BaseModal> 用法都绑定了 @close', () => {
    const files = vueFiles(join(PROJECT_ROOT, 'src'));
    expect(files.length).toBeGreaterThan(20);

    const missing: string[] = [];
    let total = 0;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const { tag, line } of baseModalTags(source)) {
        total += 1;
        if (!hasCloseBinding(tag)) missing.push(`${relative(PROJECT_ROOT, file)}:${line}`);
      }
    }

    // 语料自检：确实扫到了弹窗（否则这个守卫会变成永真）。
    expect(total).toBeGreaterThanOrEqual(13);
    expect(missing).toEqual([]);
  });

  it('扫描器能识别漏绑（守卫自检）', () => {
    const forgot = '<template>\n  <BaseModal v-if="open" id="x" title="t">\n    内容\n  </BaseModal>\n</template>\n';
    const forgotTags = baseModalTags(forgot);
    expect(forgotTags).toHaveLength(1);
    expect(forgotTags[0]?.line).toBe(2);
    expect(hasCloseBinding(forgotTags[0]?.tag ?? '')).toBe(false);

    const bound = '<BaseModal\n  v-if="open"\n  :title="a > b ? 1 : 2"\n  @close="open = false"\n>';
    const boundTags = baseModalTags(bound);
    expect(boundTags).toHaveLength(1);
    expect(hasCloseBinding(boundTags[0]?.tag ?? '')).toBe(true);
    expect(boundTags[0]?.tag.endsWith('>')).toBe(true);
  });

  it('✕ 按钮：type=button + data-test=modal-close，点击 emit close', async () => {
    const wrapper = mount(BaseModal, {
      props: { id: 'm-close', title: '测试弹窗' },
      slots: { default: '内容' },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    const close = wrapper.find('[data-test="modal-close"]');
    expect(close.exists()).toBe(true);
    expect(close.attributes('type')).toBe('button');
    expect(close.attributes('aria-label')).toBe('关闭');

    await close.trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('点遮罩也 emit close', async () => {
    const wrapper = mount(BaseModal, {
      props: { id: 'm-overlay', title: '测试弹窗' },
      slots: { default: '内容' },
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    await wrapper.find('.modal-overlay').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('Esc：父组件没绑 @close 时 BaseModal 仍 emit close（否则弹窗会被弹出栈却留在屏幕上）', async () => {
    const wrapper = mount(ForgetfulHost, {
      global: { plugins: [pinia], stubs: { Teleport: true } },
    });
    const modalStore = useModalStore();
    expect(modalStore.isOpen('forgetful')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    await wrapper.vm.$nextTick();

    const modal = wrapper.findComponent(BaseModal);
    expect(modal.emitted('close')).toHaveLength(1);
    // 弹窗还在屏幕上（父组件没理会），但已经从弹窗栈里消失 —— 这就是必须绑 @close 的原因。
    expect(modalStore.isOpen('forgetful')).toBe(false);
    expect(wrapper.find('.modal').exists()).toBe(true);
  });
});
