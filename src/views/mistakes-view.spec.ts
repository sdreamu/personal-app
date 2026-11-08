import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, listAliveByDate, resetDbForTests, type Mistake } from '@/db';
import { useDateStore } from '@/stores/date';
import { useToastStore } from '@/stores/toast';
import { useMistakesStore } from '@/stores/mistakes';
import { useLibraryStore } from '@/stores/library';
import MistakesView from './MistakesView.vue';

const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const TOMORROW = '2026-06-02';
const WAIT_OPTS = { timeout: 5000 } as const;

let pinia: Pinia;
let wrapper: VueWrapper;

/** jsdom 没有 canvas，压缩跑不起来：真压缩在 image-input.spec 与 e2e 里验，这里替换成"点一下就加一张假图"。 */
const FakeImageInput = defineComponent({
  props: {
    modelValue: { type: Array, default: () => [] },
    testKey: { type: String, default: 'default' },
    label: { type: String, default: '图片' },
    max: { type: Number, default: 4 },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          class: 'fake-image-add',
          'data-test': 'fake-image-add-' + String(props.testKey),
          onClick: () => emit('update:modelValue', [...(props.modelValue as string[]), 'data:image/jpeg;base64,FAKE']),
        },
        [String(props.label), slots.default?.()],
      );
  },
});

async function mountPage(): Promise<VueWrapper> {
  const w = mount(MistakesView, {
    global: { plugins: [pinia], stubs: { Teleport: true, ImageInput: FakeImageInput } },
  });
  await vi.waitFor(() => {
    if (w.findAll('[data-test="mistake-card"]').length === 0 && !w.find('[data-test="mistakes-empty"]').exists()) {
      throw new Error('错题本尚未加载完成');
    }
  }, { timeout: 3000, interval: 10 });
  await flushPromises();
  return w;
}

/** 走一遍「记一道错题」表单：题目 + 原因 + 难度。 */
async function fillCreateForm(title: string, reason = '概念不清', level = 4): Promise<void> {
  const library = useLibraryStore();
  await library.createMistakeSubject('数学');
  await library.loadSubjects();
  await wrapper.find('[data-test="add-mistake-btn"]').trigger('click');
  await flushPromises();
  await wrapper.find('[data-test="mistake-form-question"]').setValue(title);
  await wrapper.find('[data-test="mistake-form-correction"]').setValue(title + ' 的订正');
  await wrapper.findAll('[data-test="mistake-form-subject"] button').find(button => button.text() === '数学')!.trigger('click');
  await wrapper.find('[data-test="mistake-reason-' + reason + '"]').trigger('click');
  await wrapper.find('[data-test="mistake-difficulty-' + level + '"]').trigger('click');
  await wrapper.find('[data-test="mistake-form-save"]').trigger('click');
  await flushPromises();
}

beforeEach(async () => {
  vi.useRealTimers();
  window.localStorage.clear();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
  useDateStore().$patch({ selectedDate: TODAY });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

enableAutoUnmount(afterEach);

describe('错题本页 #/mistakes（M9）', () => {
  it('加载失败保留重试入口，重试后显示空态', async () => {
    vi.spyOn(useMistakesStore(), 'load').mockRejectedValueOnce(new Error('read failed'));
    wrapper = mount(MistakesView, { global: { plugins: [pinia], stubs: { Teleport: true, ImageInput: FakeImageInput } } });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain('错题未能加载');
    await wrapper.find('[role="alert"] button').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('[data-test="mistakes-empty"]').exists()).toBe(true), WAIT_OPTS);
  });

  it('分类保存失败显示原因，保留输入以便重试', async () => {
    wrapper = await mountPage();
    const failure = vi.spyOn(useLibraryStore(), 'createMistakeSubject').mockRejectedValueOnce(new Error('write failed'));
    await wrapper.find('[data-test="add-mistake-subject"]').trigger('click');
    await wrapper.find('[data-test="category-subject"]').setValue('数学');
    await wrapper.find('#mistake-category-form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain('保存分类失败');
    expect((wrapper.find('[data-test="category-subject"]').element as HTMLInputElement).value).toBe('数学');
    failure.mockRestore();
    await wrapper.find('#mistake-category-form').trigger('submit');
    await vi.waitFor(() => expect(wrapper.find('#mistake-category-form').exists()).toBe(false), WAIT_OPTS);
    expect(wrapper.find('[data-test="mistakes-subject-filter"]').text()).toContain('数学');
  });

  it('空态给出引导；新增一道错题后落库 1 行、卡片显示题目/订正/原因/难度', async () => {
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="mistakes-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="mistakes-progress"]').text()).toContain('共 0 条');

    await fillCreateForm('求导漏掉链式法则', '概念不清', 4);

    await vi.waitFor(async () => {
      const rows = await listAliveByDate('mistakes', TODAY);
      if (rows.length !== 1) throw new Error('错题未落库');
    }, WAIT_OPTS);

    const row = (await listAliveByDate('mistakes', TODAY))[0] as Mistake;
    expect(row.date).toBe(TODAY);
    expect(row.subject_name).toBe('数学');
    expect(row.question_text).toBe('求导漏掉链式法则');
    expect(row.reasons).toEqual(['概念不清']);
    expect(row.difficulty).toBe(4);
    expect(row.mastered).toBe(false);

    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="mistake-card"]').length !== 1) throw new Error('卡片未出现');
    }, WAIT_OPTS);
    const card = wrapper.find('[data-test="mistake-card"]');
    expect(card.find('[data-test="mistake-question"]').text()).toBe('求导漏掉链式法则');
    expect(card.find('[data-test="mistake-correction"]').text()).toContain('的订正');
    expect(card.find('[data-test="mistake-reasons"]').text()).toContain('概念不清');
    expect(card.find('[data-test="mistake-difficulty"]').text()).toBe('★★★★☆');
    expect(wrapper.find('[data-test="mistakes-progress"]').text()).toContain('共 1 条');
  });

  it('自定义错误原因：回车追加标签，随保存落库', async () => {
    wrapper = await mountPage();
    await wrapper.find('[data-test="add-mistake-btn"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="mistake-form-question"]').setValue('单位换算错了');
    await wrapper.find('[data-test="mistake-form-custom-reason"]').setValue('单位没统一');
    await wrapper.find('[data-test="mistake-form-add-reason"]').trigger('click');
    await wrapper.find('[data-test="mistake-form-save"]').trigger('click');

    await vi.waitFor(async () => {
      const rows = await listAliveByDate('mistakes', TODAY);
      if (rows[0]?.reasons.join(',') !== '单位没统一') throw new Error('自定义原因未保存');
    }, WAIT_OPTS);
  });

  it('编辑：改题目/难度后落库，卡片同步', async () => {
    wrapper = await mountPage();
    await fillCreateForm('原题干');
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="mistake-card"]').length !== 1) throw new Error('卡片未出现');
    }, WAIT_OPTS);

    await wrapper.find('[data-test="mistake-edit"]').trigger('click');
    await flushPromises();
    expect((wrapper.find('[data-test="mistake-form-question"]').element as HTMLTextAreaElement).value).toBe('原题干');
    await wrapper.find('[data-test="mistake-form-question"]').setValue('改后题干');
    await wrapper.find('[data-test="mistake-difficulty-2"]').trigger('click');
    await wrapper.find('[data-test="mistake-form-save"]').trigger('click');

    await vi.waitFor(async () => {
      const rows = await listAliveByDate('mistakes', TODAY);
      if (rows[0]?.question_text !== '改后题干') throw new Error('编辑未落库');
      if (rows[0]?.difficulty !== 2) throw new Error('难度未落库');
    }, WAIT_OPTS);
    await vi.waitFor(() => {
      if (!wrapper.find('[data-test="mistake-question"]').text().includes('改后题干')) throw new Error('卡片未同步');
    }, WAIT_OPTS);
  });

  it('标记已掌握 / 取消掌握：mastered 翻转 + 徽标出现消失，「未掌握」筛选跟着变', async () => {
    wrapper = await mountPage();
    await fillCreateForm('待掌握的一题');
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="mistake-card"]').length !== 1) throw new Error('卡片未出现');
    }, WAIT_OPTS);

    await wrapper.find('[data-test="mistake-toggle-mastered"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('mistakes', TODAY);
      if (rows[0]?.mastered !== true) throw new Error('未标记已掌握');
    }, WAIT_OPTS);
    await vi.waitFor(() => {
      if (!wrapper.find('[data-test="mistake-mastered-badge"]').exists()) throw new Error('没有已掌握徽标');
    }, WAIT_OPTS);
    expect(wrapper.find('[data-test="mistakes-progress"]').text()).toContain('已掌握 1 条');

    // 只看未掌握：这张卡被筛掉
    await wrapper.find('[data-test="mistakes-filter-unmastered"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-test="mistake-card"]')).toHaveLength(0);

    // 回到全部再取消掌握
    await wrapper.find('[data-test="mistakes-filter-all"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="mistake-toggle-mastered"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('mistakes', TODAY);
      if (rows[0]?.mastered !== false) throw new Error('未取消掌握');
    }, WAIT_OPTS);
  });

  it('删除：卡片消失、软删除落库，5 秒内撤销能恢复', async () => {
    wrapper = await mountPage();
    await fillCreateForm('要删掉的一题');
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="mistake-card"]').length !== 1) throw new Error('卡片未出现');
    }, WAIT_OPTS);

    await wrapper.find('[data-test="mistake-delete"]').trigger('click');
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="mistake-card"]').length !== 0) throw new Error('卡片未消失');
    }, WAIT_OPTS);
    expect(await listAliveByDate('mistakes', TODAY)).toHaveLength(0);

    const toast = useToastStore();
    const item = toast.items[toast.items.length - 1];
    await item?.undo?.action();
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="mistake-card"]').length !== 1) throw new Error('撤销未恢复');
    }, WAIT_OPTS);
  });

  it('独立于全局日期：切换日期后仍显示全部错题', async () => {
    wrapper = await mountPage();
    await fillCreateForm('今天的一题');
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="mistake-card"]').length !== 1) throw new Error('卡片未出现');
    }, WAIT_OPTS);

    useDateStore().$patch({ selectedDate: TOMORROW });
    await flushPromises();
    expect(wrapper.findAll('[data-test="mistake-card"]')).toHaveLength(1);
    expect(wrapper.find('[data-test="mistakes-progress"]').text()).not.toContain(TOMORROW);

    await fillCreateForm('明天的一题');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('mistakes', TODAY);
      if (rows.length !== 2) throw new Error('新增应使用今天，不使用日程所选日期');
    }, WAIT_OPTS);
  });

  it('弹窗：点 ✕ 关闭且不写库（B1 纪律）', async () => {
    wrapper = await mountPage();
    await wrapper.find('[data-test="add-mistake-btn"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="mistake-form-question"]').setValue('写了但不想存');
    await wrapper.find('[data-test="modal-close"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-test="mistake-form"]').exists()).toBe(false);
    expect(await listAliveByDate('mistakes', TODAY)).toHaveLength(0);
  });
});

describe('错题照片录入（P2 · AC-78）', () => {
  it('题目/订正各加一张图后保存：落库带 dataURL，卡片出缩略图', async () => {
    wrapper = await mountPage();
    await wrapper.find('[data-test="add-mistake-btn"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="mistake-form-question"]').setValue('带照片的一题');
    await wrapper.find('[data-test="fake-image-add-question"]').trigger('click');
    await wrapper.find('[data-test="fake-image-add-correction"]').trigger('click');
    await wrapper.find('[data-test="mistake-form-save"]').trigger('click');

    await vi.waitFor(async () => {
      const rows = await listAliveByDate('mistakes', TODAY);
      if (rows[0]?.question_images.length !== 1) throw new Error('题目图片未落库');
      if (rows[0]?.correction_images.length !== 1) throw new Error('订正图片未落库');
    }, WAIT_OPTS);
    expect((await listAliveByDate('mistakes', TODAY))[0]?.question_images[0]).toBe('data:image/jpeg;base64,FAKE');

    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="mistake-photo-question"]').length !== 1) throw new Error('题目缩略图未出现');
      if (wrapper.findAll('[data-test="mistake-photo-correction"]').length !== 1) throw new Error('订正缩略图未出现');
    }, WAIT_OPTS);
  });

  it('编辑时删掉图：数组少一张并落库，卡片缩略图跟着消失', async () => {
    await createRecord('mistakes', {
      date: TODAY,
      subject_name: '数学',
      question_text: '两道照片',
      question_images: ['data:image/jpeg;base64,ONE', 'data:image/jpeg;base64,TWO'],
      correction_text: null,
      correction_images: [],
      reasons: [],
      note: null,
      difficulty: 3,
      mastered: false,
    });
    wrapper = await mountPage();
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="mistake-photo-question"]').length !== 2) throw new Error('缩略图未出现');
    }, WAIT_OPTS);

    await wrapper.find('[data-test="mistake-edit"]').trigger('click');
    await flushPromises();
    // 弹窗里给的是真 ImageInput（被替换成假组件），所以这里直接改表单：用假组件"再加一张"不会误删
    // 真实的删图交互在 image-input.spec 覆盖；这里验证「保存后卡片与库里都只剩 1 张」
    const store = useMistakesStore();
    const id = store.items[0]!.id;
    await store.save(id, {
      date: TODAY,
      subjectName: '数学',
      questionText: '两道照片',
      correctionText: '',
      reasons: [],
      note: '',
      difficulty: 3,
      mastered: false,
      questionImages: ['data:image/jpeg;base64,TWO'],
      correctionImages: [],
    });

    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="mistake-photo-question"]').length !== 1) throw new Error('缩略图未更新');
    }, WAIT_OPTS);
    const rows = await listAliveByDate('mistakes', TODAY);
    expect(rows[0]?.question_images).toEqual(['data:image/jpeg;base64,TWO']);
  });
});
