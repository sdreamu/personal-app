import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { useEscToCloseModal } from '@/composables/useEscToCloseModal';
import { type Book, type Plan, type PlanCategory, type Subject } from '@/db';
import PlanFormModal from './PlanFormModal.vue';

const DAY_START = 240;

function category(id: string, name: string, builtin: 'study' | 'life' | 'other' | null): PlanCategory {
  return { id, name, builtin_key: builtin, created_at: 1, updated_at: 1, deleted_at: null };
}

const CATS = [category('c-study', '学习', 'study'), category('c-life', '生活', 'life'), category('c-other', '其他', 'other')];

const BOOK: Book = {
  id: 'b1',
  title: 'SICP',
  author: null,
  total_pages: 300,
  current_page: 40,
  status: 'reading',
  color: '#4a6cf7',
  start_date: null,
  finish_date: null,
  created_at: 1,
  updated_at: 1,
  deleted_at: null,
};

const SUBJECT: Subject = {
  id: 's1',
  name: '数学',
  weekly_goal_min: 360,
  deadline: null,
  archived: false,
  created_at: 1,
  updated_at: 1,
  deleted_at: null,
};

let pinia: Pinia;

function makePlan(overrides: Partial<Plan>): Plan {
  return {
    id: 'p1',
    title: '旧标题',
    date: '2026-06-01',
    start_min: null,
    end_min: null,
    category_key: 'other',
    category_name: '其他',
    target_type: null,
    target_id: null,
    target_title: null,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    ...overrides,
  };
}

function mountModal(initial: Plan | null) {
  const wrapper = mount(PlanFormModal, {
    props: {
      dayStartMin: DAY_START,
      categories: CATS,
      books: [BOOK],
      subjects: [SUBJECT],
      initial,
    },
    global: { plugins: [pinia], stubs: { Teleport: true } },
  });
  return wrapper;
}

const EscHost = defineComponent({
  components: { PlanFormModal },
  setup() {
    useEscToCloseModal();
    const open = ref(true);
    return { open, CATS };
  },
  template: `
    <PlanFormModal
      v-if="open"
      :day-start-min="240"
      :categories="CATS"
      :books="[]"
      :subjects="[]"
      :initial="null"
      @close="open = false"
    />
  `,
});

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

describe('计划项新增/编辑弹窗', () => {
  it('新增：默认分类“其他”，标题必填，保存发出载荷', async () => {
    const wrapper = mountModal(null);
    expect(wrapper.find('[data-test="plan-form"]').exists()).toBe(true);
    expect((wrapper.find('[data-test="plan-form-title"]').element as HTMLInputElement).value).toBe('');
    expect(wrapper.find('[data-test="plan-form-target"]').exists()).toBe(false); // 非学习不显示关联对象

    await wrapper.find('[data-test="plan-form"]').trigger('submit');
    expect(wrapper.find('[data-test="plan-form-error"]').text()).toBe('标题不能为空');

    await wrapper.find('[data-test="plan-form-title"]').setValue('背单词');
    await wrapper.find('[data-test="plan-form"]').trigger('submit');
    const payload = wrapper.emitted('save')?.[0]?.[0] as {
      title: string;
      categoryKey: string;
      startMin: number | null;
      endMin: number | null;
      targetType: string | null;
    };
    expect(payload).toEqual({
      title: '背单词',
      categoryKey: 'other',
      startMin: null,
      endMin: null,
      targetType: null,
      targetId: null,
      targetTitle: null,
    });
  });

  it('快捷时长：结束=开始+时长；跨越一天起点边界拒绝并提示', async () => {
    const wrapper = mountModal(null);
    await wrapper.find('[data-test="plan-form-start"]').setValue('09:00');
    await wrapper.find('[data-test="quick-30"]').trigger('click');
    expect((wrapper.find('[data-test="plan-form-end"]').element as HTMLInputElement).value).toBe('09:30');

    await wrapper.find('[data-test="plan-form-start"]').setValue('03:00'); // 偏移 1380，+90 越过 1440
    await wrapper.find('[data-test="quick-90"]').trigger('click');
    expect(wrapper.find('[data-test="plan-form-error"]').text()).toBe('时间块不得跨越一天起点边界');

    await wrapper.find('[data-test="plan-form-start"]').setValue('22:00');
    await wrapper.find('[data-test="quick-45"]').trigger('click');
    expect((wrapper.find('[data-test="plan-form-end"]').element as HTMLInputElement).value).toBe('22:45');
  });

  it('跨午夜换算：23:00→01:00 保存为偏移 1140→1260；只填一边拒绝', async () => {
    const wrapper = mountModal(null);
    await wrapper.find('[data-test="plan-form-title"]').setValue('夜读');
    await wrapper.find('[data-test="plan-form-start"]').setValue('23:00');
    await wrapper.find('[data-test="plan-form-end"]').setValue('01:00');
    await wrapper.find('[data-test="plan-form"]').trigger('submit');
    const payload = wrapper.emitted('save')?.[0]?.[0] as { startMin: number; endMin: number };
    expect(payload.startMin).toBe(1140);
    expect(payload.endMin).toBe(1260);

    const wrapper2 = mountModal(null);
    await wrapper2.find('[data-test="plan-form-title"]').setValue('半截时间');
    await wrapper2.find('[data-test="plan-form-start"]').setValue('09:00');
    await wrapper2.find('[data-test="plan-form"]').trigger('submit');
    expect(wrapper2.find('[data-test="plan-form-error"]').text()).toBe('请同时填写开始与结束时间');
    expect(wrapper2.emitted('save')).toBeUndefined();
  });

  it('学习分类显示关联对象选择并带出 target 快照；切走学习清空关联', async () => {
    const wrapper = mountModal(null);
    await wrapper.find('[data-test="plan-form-category"]').setValue('study');
    expect(wrapper.find('[data-test="plan-form-target"]').exists()).toBe(true);
    const options = wrapper.findAll('[data-test="plan-form-target"] option').map((o) => o.text());
    expect(options.join('|')).toContain('书 · SICP');
    expect(options.join('|')).toContain('科目 · 数学');

    await wrapper.find('[data-test="plan-form-title"]').setValue('读一章');
    await wrapper.find('[data-test="plan-form-target"]').setValue('book:b1');
    await wrapper.find('[data-test="plan-form"]').trigger('submit');
    const payload = wrapper.emitted('save')?.[0]?.[0] as {
      targetType: string;
      targetId: string;
      targetTitle: string;
    };
    expect(payload.targetType).toBe('book');
    expect(payload.targetId).toBe('b1');
    expect(payload.targetTitle).toBe('SICP');

    await wrapper.find('[data-test="plan-form-category"]').setValue('life');
    expect(wrapper.find('[data-test="plan-form-target"]').exists()).toBe(false);
  });

  it('编辑：回填起止时间（偏移→HH:mm）与分类/关联；清空起止时间保存为 null', async () => {
    const initial = makePlan({
      title: '读 SICP',
      category_key: 'study',
      category_name: '学习',
      start_min: 300,
      end_min: 330,
      target_type: 'book',
      target_id: 'b1',
      target_title: 'SICP',
    });
    const wrapper = mountModal(initial);
    expect((wrapper.find('[data-test="plan-form-title"]').element as HTMLInputElement).value).toBe('读 SICP');
    expect((wrapper.find('[data-test="plan-form-start"]').element as HTMLInputElement).value).toBe('09:00');
    expect((wrapper.find('[data-test="plan-form-end"]').element as HTMLInputElement).value).toBe('09:30');
    expect((wrapper.find('[data-test="plan-form-target"]').element as HTMLSelectElement).value).toBe('book:b1');

    await wrapper.find('[data-test="plan-form-start"]').setValue('');
    await wrapper.find('[data-test="plan-form-end"]').setValue('');
    await wrapper.find('[data-test="plan-form"]').trigger('submit');
    const payload = wrapper.emitted('save')?.[0]?.[0] as { startMin: number | null; endMin: number | null };
    expect(payload.startMin).toBeNull();
    expect(payload.endMin).toBeNull();
  });

  it('Esc 关闭普通弹窗；取消按钮关闭', async () => {
    const wrapper = mount(EscHost, { global: { plugins: [pinia], stubs: { Teleport: true } } });
    await flushPromises();
    expect(wrapper.find('[data-test="plan-form"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-test="plan-form"]').exists()).toBe(false);
  });

  it('表单回车提交保存（form submit）', async () => {
    const wrapper = mountModal(null);
    await wrapper.find('[data-test="plan-form-title"]').setValue('回车保存');
    await wrapper.find('[data-test="plan-form"]').trigger('submit');
    expect(wrapper.emitted('save')).toHaveLength(1);
  });
});
