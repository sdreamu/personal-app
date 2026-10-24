import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ReviewHistory from './ReviewHistory.vue';
import ReviewMetrics from './ReviewMetrics.vue';
import ReviewMoodPicker from './ReviewMoodPicker.vue';
import type {
  ReviewDateDot,
  ReviewHistoryItem,
  ReviewMetrics as ReviewMetricsModel,
} from '@/stores/review';

const metrics: ReviewMetricsModel = {
  planDone: 2,
  planTotal: 5,
  planText: '2/5',
  studySeconds: 5400,
  studyGoalMin: 120,
  studyText: '01:30:00 / 02:00:00',
  pagesRead: 45,
  pagesText: '45 页',
  waterMl: 1250,
  waterGoalMl: 2000,
  waterText: '1250 ml / 2000 ml',
  workoutDone: true,
  workoutText: '背 40 分钟',
  playMinutes: 30,
  playLimitMin: 60,
  playText: '30 分钟 / 60 分钟',
  plannedStudyMinutes: 60,
  actualStudyMinutes: 90,
  diffMinutes: 30,
  diffText: '+30 分钟（超额完成）',
};

describe('ReviewMetrics 指标渲染', () => {
  it('渲染 7 项指标标签与格式化数值', () => {
    const wrapper = mount(ReviewMetrics, { props: { metrics } });
    expect(wrapper.find('[data-test="review-metrics"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="metrics-grid"] > .metric-item')).toHaveLength(7);

    expect(wrapper.find('[data-test="metric-plan-value"]').text()).toBe('2/5');
    expect(wrapper.find('[data-test="metric-study-value"]').text()).toBe('01:30:00 / 02:00:00');
    expect(wrapper.find('[data-test="metric-pages-value"]').text()).toBe('45 页');
    expect(wrapper.find('[data-test="metric-water-value"]').text()).toBe('1250 ml / 2000 ml');
    expect(wrapper.find('[data-test="metric-workout-value"]').text()).toBe('背 40 分钟');
    expect(wrapper.find('[data-test="metric-play-value"]').text()).toBe('30 分钟 / 60 分钟');
    expect(wrapper.find('[data-test="metric-diff-value"]').text()).toBe('+30 分钟（超额完成）');
  });

  it('未运动时显示“未运动”', () => {
    const wrapper = mount(ReviewMetrics, {
      props: { metrics: { ...metrics, workoutDone: false, workoutText: '未运动' } },
    });
    expect(wrapper.find('[data-test="metric-workout-value"]').text()).toBe('未运动');
  });
});

function mountPicker(props: { rating?: number | null; mood?: number | null; energy?: number | null } = {}) {
  return mount(ReviewMoodPicker, {
    props: { rating: null, mood: null, energy: null, ...props },
  });
}

function lastEmit(wrapper: ReturnType<typeof mountPicker>, event: string): unknown[] | undefined {
  const emitted = wrapper.emitted(event);
  return emitted?.[emitted.length - 1];
}

describe('ReviewMoodPicker 三项打分', () => {
  it('星级：点击选中，再次点击已选中项取消', async () => {
    const wrapper = mountPicker();
    const stars = wrapper.findAll('[data-test="rating-star"]');
    expect(stars).toHaveLength(5);

    await stars[2]?.trigger('click');
    expect(lastEmit(wrapper, 'update:rating')).toEqual([3]);

    await wrapper.setProps({ rating: 3 });
    await wrapper.findAll('[data-test="rating-star"]')[2]?.trigger('click');
    expect(lastEmit(wrapper, 'update:rating')).toEqual([null]);
  });

  it('星级：点击未选中项切换到新值，不取消', async () => {
    const wrapper = mountPicker({ rating: 3 });
    await wrapper.findAll('[data-test="rating-star"]')[4]?.trigger('click');
    expect(lastEmit(wrapper, 'update:rating')).toEqual([5]);
  });

  it('心情：😞😕😐🙂😄 点击选中，再次点击取消', async () => {
    const wrapper = mountPicker();
    const buttons = wrapper.findAll('[data-test="mood-btn"]');
    expect(buttons).toHaveLength(5);
    expect(buttons.map((b) => b.text())).toEqual(['😞', '😕', '😐', '🙂', '😄']);

    await buttons[3]?.trigger('click');
    expect(lastEmit(wrapper, 'update:mood')).toEqual([4]);

    await wrapper.setProps({ mood: 4 });
    await wrapper.findAll('[data-test="mood-btn"]')[3]?.trigger('click');
    expect(lastEmit(wrapper, 'update:mood')).toEqual([null]);
  });

  it('精力：能量格点击选中，再次点击取消', async () => {
    const wrapper = mountPicker();
    const bars = wrapper.findAll('[data-test="energy-bar"]');
    expect(bars).toHaveLength(5);

    await bars[4]?.trigger('click');
    expect(lastEmit(wrapper, 'update:energy')).toEqual([5]);

    await wrapper.setProps({ energy: 5 });
    await wrapper.findAll('[data-test="energy-bar"]')[4]?.trigger('click');
    expect(lastEmit(wrapper, 'update:energy')).toEqual([null]);
  });

  it('三项互相独立：取消评分不影响心情与精力', async () => {
    const wrapper = mountPicker({ rating: 3, mood: 2, energy: 4 });
    await wrapper.findAll('[data-test="rating-star"]')[2]?.trigger('click');
    expect(lastEmit(wrapper, 'update:rating')).toEqual([null]);
    expect(wrapper.emitted('update:mood')).toBeUndefined();
    expect(wrapper.emitted('update:energy')).toBeUndefined();
  });
});

const items: ReviewHistoryItem[] = [
  { date: '2026-06-01', rating: 5, mood: 4, energy: 3, summary: '晨跑' },
  { date: '2026-05-30', rating: null, mood: null, energy: null, summary: '' },
];

const dots: ReviewDateDot[] = [
  { date: '2026-05-18', filled: false },
  { date: '2026-05-19', filled: false },
  { date: '2026-05-20', filled: false },
  { date: '2026-05-21', filled: false },
  { date: '2026-05-22', filled: false },
  { date: '2026-05-23', filled: false },
  { date: '2026-05-24', filled: false },
  { date: '2026-05-25', filled: false },
  { date: '2026-05-26', filled: false },
  { date: '2026-05-27', filled: false },
  { date: '2026-05-28', filled: false },
  { date: '2026-05-29', filled: false },
  { date: '2026-05-30', filled: false },
  { date: '2026-05-31', filled: true },
];

describe('ReviewHistory 历史列表与灰点', () => {
  it('历史列表按传入顺序渲染日期、星级、心情、精力与摘要', () => {
    const wrapper = mount(ReviewHistory, { props: { items, dots } });
    const rows = wrapper.findAll('[data-test="history-item"]');
    expect(rows).toHaveLength(2);

    const first = rows[0];
    expect(first?.attributes('data-date')).toBe('2026-06-01');
    expect(first?.text()).toContain('6月1日 周一');
    expect(first?.find('[data-test="history-rating"]').text()).toBe('★★★★★');
    expect(first?.find('[data-test="history-mood"]').text()).toBe('🙂');
    expect(first?.find('[data-test="history-energy"]').text()).toBe('▮▮▮▯▯');
    expect(first?.find('[data-test="history-summary"]').text()).toBe('晨跑');

    const second = rows[1];
    expect(second?.find('[data-test="history-rating"]').text()).toBe('—');
    expect(second?.find('[data-test="history-mood"]').text()).toBe('—');
    expect(second?.find('[data-test="history-energy"]').text()).toBe('—');
    expect(second?.find('[data-test="history-summary"]').text()).toBe('（无摘要）');
  });

  it('最近 14 天灰点：未填写日期标 missing，已填写标 filled', () => {
    const wrapper = mount(ReviewHistory, { props: { items, dots } });
    const dotButtons = wrapper.findAll('[data-test="history-dot"]');
    expect(dotButtons).toHaveLength(14);

    const filled = wrapper.find('[data-date="2026-05-31"]');
    expect(filled.exists()).toBe(true);
    expect(filled.classes()).toContain('filled');
    expect(filled.attributes('data-filled')).toBe('yes');

    const missing = wrapper.find('[data-date="2026-05-30"]');
    expect(missing.exists()).toBe(true);
    expect(missing.classes()).toContain('missing');
    expect(missing.attributes('data-filled')).toBe('no');
  });

  it('点击灰点发出 select-date 事件', async () => {
    const wrapper = mount(ReviewHistory, { props: { items, dots } });
    await wrapper.find('[data-date="2026-05-30"]').trigger('click');
    expect(wrapper.emitted('select-date')?.at(-1)).toEqual(['2026-05-30']);
  });

  it('历史为空时显示空提示', () => {
    const wrapper = mount(ReviewHistory, { props: { items: [], dots } });
    expect(wrapper.find('[data-test="history-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="history-list"]').exists()).toBe(false);
  });
});
