import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ReviewHistory from './ReviewHistory.vue';
import ReviewMetrics from './ReviewMetrics.vue';
import ReviewMoodPicker from './ReviewMoodPicker.vue';
import type {
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

const TODAY = '2026-06-01';

const items: ReviewHistoryItem[] = [
  {
    date: '2026-06-01',
    rating: 5,
    mood: 4,
    energy: 3,
    summary: '状态不错',
    record_worthy: '跑完 5 公里',
    day_summary: '状态不错',
    good: '专注',
    improve: '早睡',
    mit: '读完一章',
  },
  {
    date: '2026-05-10',
    rating: null,
    mood: null,
    energy: null,
    summary: '',
    record_worthy: '',
    day_summary: '',
    good: '只写了做得好的',
    improve: '',
    mit: '',
  },
];

function mountHistory(list: ReviewHistoryItem[] = items) {
  return mount(ReviewHistory, { props: { items: list, today: TODAY } });
}

describe('ReviewHistory 区间历史列表', () => {
  it('默认近 30 天：只列有复盘的日期（倒序），摘要只显示 day_summary（为空则留空）', () => {
    const wrapper = mountHistory();
    const rows = wrapper.findAll('[data-test="history-item"]');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.attributes('data-date'))).toEqual(['2026-06-01', '2026-05-10']);
    expect(wrapper.find('[data-test="history-range-stats"]').text()).toBe('已写 2 / 30 天');

    const first = rows[0];
    expect(first?.text()).toContain('6月1日 周一');
    expect(first?.find('[data-test="history-rating"]').text()).toBe('★★★★★');
    expect(first?.find('[data-test="history-mood"]').text()).toBe('🙂');
    expect(first?.find('[data-test="history-energy"]').text()).toBe('▮▮▮▯▯');
    expect(first?.find('[data-test="history-summary"]').text()).toBe('状态不错');

    const noSummary = wrapper.find('[data-date="2026-05-10"]');
    expect(noSummary.find('[data-test="history-summary"]').text()).toBe('');
    expect(noSummary.text()).not.toContain('（无摘要）');
    expect(noSummary.text()).not.toContain('只写了做得好的');
  });

  it('快捷区间：近 7 天只留区间内的复盘，全部从最早一条起算', async () => {
    const wrapper = mountHistory();
    await wrapper.find('[data-test="history-preset-7"]').trigger('click');
    expect(wrapper.findAll('[data-test="history-item"]')).toHaveLength(1);
    expect(wrapper.find('[data-date="2026-05-10"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="history-range-stats"]').text()).toBe('已写 1 / 7 天');

    await wrapper.find('[data-test="history-preset-all"]').trigger('click');
    expect(wrapper.findAll('[data-test="history-item"]')).toHaveLength(2);
    expect(wrapper.find('[data-test="history-range-stats"]').text()).toBe('已写 2 / 23 天'); // 05-10 ~ 06-01
  });

  it('手动改起止日期：只显示区间内已写的日期，未填写日期不占行', async () => {
    const wrapper = mountHistory();
    await wrapper.find('[data-test="history-start"]').setValue('2026-05-09');
    await wrapper.find('[data-test="history-end"]').setValue('2026-05-11');
    const rows = wrapper.findAll('[data-test="history-item"]');
    expect(rows.map((row) => row.attributes('data-date'))).toEqual(['2026-05-10']);
    expect(wrapper.find('[data-test="history-range-stats"]').text()).toBe('已写 1 / 3 天');
    expect(wrapper.find('[data-test="history-supplement"]').exists()).toBe(false);
  });

  it('结束日期不会超过今天', async () => {
    const wrapper = mountHistory();
    await wrapper.find('[data-test="history-end"]').setValue('2026-06-30');
    const rows = wrapper.findAll('[data-test="history-item"]');
    expect(rows[0]?.attributes('data-date')).toBe('2026-06-01');
    expect(wrapper.find('[data-test="history-range-stats"]').text()).toBe('已写 2 / 30 天');
  });

  it('点有复盘的日期展开只读详情，不发 select-date；点「编辑这一天」才发', async () => {
    const wrapper = mountHistory();
    const row = wrapper.find('[data-date="2026-06-01"]');
    await row.find('[data-test="history-row"]').trigger('click');

    const detail = wrapper.find('[data-test="history-detail"]');
    expect(detail.exists()).toBe(true);
    expect(detail.find('[data-test="history-detail-record-worthy"]').text()).toBe('跑完 5 公里');
    expect(detail.find('[data-test="history-detail-day-summary"]').text()).toBe('状态不错');
    expect(detail.find('[data-test="history-detail-good"]').text()).toBe('专注');
    expect(detail.find('[data-test="history-detail-improve"]').text()).toBe('早睡');
    expect(detail.find('[data-test="history-detail-mit"]').text()).toBe('读完一章');
    expect(wrapper.emitted('select-date')).toBeUndefined();

    await detail.find('[data-test="history-edit-date"]').trigger('click');
    expect(wrapper.emitted('select-date')?.at(-1)).toEqual(['2026-06-01']);
  });

  it('区间内没有任何复盘时显示空提示，且不渲染任何行', () => {
    const wrapper = mountHistory([]);
    expect(wrapper.find('[data-test="history-empty"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-test="history-item"]')).toHaveLength(0);
    expect(wrapper.find('[data-test="history-range-stats"]').text()).toBe('已写 0 / 30 天');
  });
});
