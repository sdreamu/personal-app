import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { type Plan } from '@/db';
import PlanTimeline from './PlanTimeline.vue';

let pinia: Pinia;

function makePlan(title: string, startMin: number | null, endMin: number | null, overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p-' + title,
    title,
    date: '2026-06-01',
    start_min: startMin,
    end_min: endMin,
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

function mountTimeline(plans: Plan[]) {
  return mount(PlanTimeline, {
    props: { plans, dayStartMin: 240 },
    global: { plugins: [pinia] },
  });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

describe('计划时间轴', () => {
  it('从一天起点覆盖 24 小时；时间块按偏移排序渲染并过滤无时间待办', () => {
    const wrapper = mountTimeline([
      makePlan('B', 600, 660),
      makePlan('无时间待办', null, null),
      makePlan('A', 120, 180),
    ]);
    expect(wrapper.findAll('[data-test="hour-labels"] .hour-label')).toHaveLength(24);
    const labels = wrapper.findAll('[data-test="hour-labels"] .hour-label').map((l) => l.text());
    expect(labels[0]).toBe('04:00'); // 一天起点
    expect(labels[23]).toBe('03:00');

    const blocks = wrapper.findAll('[data-test="timeline-block"]');
    const blockText = blocks.map((b) => b.text()).join('');
    expect(blockText).toContain('A');
    expect(blockText).toContain('B');
    expect(blocks.map((b) => b.attributes('data-start'))).toEqual(['120', '600']);
    expect(wrapper.findAll('[data-test="timeline-block"]').map((b) => b.text()).join()).not.toContain('无时间待办');
  });

  it('两个重叠时间块并排显示（不同泳道）并给出重叠提示图标', () => {
    const wrapper = mountTimeline([
      makePlan('A', 300, 420),
      makePlan('B', 330, 390),
    ]);
    const blocks = wrapper.findAll('[data-test="timeline-block"]');
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.attributes('data-lane')).sort()).toEqual(['0', '1']);
    expect(blocks[0]?.find('[data-test="overlap-icon"]').exists()).toBe(true);
    expect(blocks[1]?.find('[data-test="overlap-icon"]').exists()).toBe(true);
    expect(blocks[0]?.attributes('style')).toContain('left: 0%');
    expect(blocks[1]?.attributes('style')).toContain('left: 50%');
  });

  it('互不重叠（含首尾相接）不显示重叠提示', () => {
    const wrapper = mountTimeline([
      makePlan('A', 300, 360),
      makePlan('B', 360, 420),
      makePlan('C', 500, 560),
    ]);
    const blocks = wrapper.findAll('[data-test="timeline-block"]');
    expect(blocks).toHaveLength(3);
    expect(wrapper.findAll('[data-test="overlap-icon"]')).toHaveLength(0);
    expect(blocks.every((b) => b.attributes('data-lane') === '0')).toBe(true);
  });

  it('带关联对象的时间块显示“开始”，点击发出该计划；无关联/已完成不显示', async () => {
    const withTarget = makePlan('读 SICP', 300, 360, {
      target_type: 'book',
      target_id: 'b1',
      target_title: 'SICP',
    });
    const doneWithTarget = makePlan('已完成块', 400, 460, {
      done: true,
      done_at: 1,
      target_type: 'book',
      target_id: 'b1',
      target_title: 'SICP',
    });
    const noTarget = makePlan('无关联块', 500, 560);
    const wrapper = mountTimeline([withTarget, doneWithTarget, noTarget]);

    const blocks = wrapper.findAll('[data-test="timeline-block"]');
    expect(blocks[0]?.find('[data-test="timeline-start"]').exists()).toBe(true);
    expect(blocks[1]?.classes()).toContain('done');
    expect(blocks[1]?.find('[data-test="timeline-start"]').exists()).toBe(false);
    expect(blocks[2]?.find('[data-test="timeline-start"]').exists()).toBe(false);

    await blocks[0]?.find('[data-test="timeline-start"]').trigger('click');
    const emitted = wrapper.emitted('start');
    expect(emitted?.[0]?.[0]).toEqual(withTarget);
  });

  it('无时间块时显示引导提示', () => {
    const wrapper = mountTimeline([makePlan('无时间待办', null, null)]);
    expect(wrapper.find('[data-test="timeline-empty"]').exists()).toBe(true);
  });
});
