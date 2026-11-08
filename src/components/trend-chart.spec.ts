import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TrendChart from './TrendChart.vue';

const DATES = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'];

describe('心情 / 精力曲线（P3）', () => {
  it('只有一天或间断记录也显示数据点，重合的两组记录均保留', () => {
    const wrapper = mount(TrendChart, {
      props: {
        dates: DATES,
        series: [
          { key: 'mood', label: '心情', values: [null, 3, null, 5] },
          { key: 'energy', label: '精力', values: [null, 3, null, null] },
        ],
      },
    });
    expect(wrapper.findAll('[data-test="trend-point-mood"]')).toHaveLength(2);
    const energy = wrapper.get('[data-test="trend-point-energy"]');
    const mood = wrapper.get('[data-test="trend-point-mood"]');
    expect(energy.attributes('cx')).toBe(mood.attributes('cx'));
    expect(energy.attributes('cy')).toBe(mood.attributes('cy'));
    expect(Number(energy.attributes('r'))).toBeGreaterThan(0);
    expect(Number(energy.attributes('r'))).toBeLessThan(Number(mood.attributes('r')));
  });
  it('两条线分别渲染 polylines，点数与记录天数一致', () => {
    const wrapper = mount(TrendChart, {
      props: {
        dates: DATES,
        series: [
          { key: 'mood', label: '心情', values: [3, 4, 5, 4] },
          { key: 'energy', label: '精力', values: [2, 2, 3, 5] },
        ],
      },
    });
    expect(wrapper.findAll('[data-test="trend-line-mood"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-test="trend-line-energy"]')).toHaveLength(1);
    const moodPoints = wrapper.find('[data-test="trend-line-mood"]').attributes('points') ?? '';
    expect(moodPoints.split(' ')).toHaveLength(4);
    // 心情最高 5 分那天的 y 比最低 3 分那天的 y 小（越靠上）
    const [x1y1, , x3y3] = moodPoints.split(' ');
    const yOf = (token: string): number => Number(token.split(',')[1]);
    expect(yOf(x3y3!)).toBeLessThan(yOf(x1y1!));
  });

  it('缺的日期断线：分段渲染，不连假线', () => {
    const wrapper = mount(TrendChart, {
      props: {
        dates: DATES,
        series: [
          { key: 'mood', label: '心情', values: [4, null, null, 2] },
          { key: 'energy', label: '精力', values: [3, 3, 3, 3] },
        ],
      },
    });
    expect(wrapper.findAll('[data-test="trend-line-mood"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-test="trend-line-energy"]')).toHaveLength(1);
  });

  it('图例给出「已记录 n 天 · 平均 x」；没有记录显示空态而不是空坐标轴', () => {
    const filled = mount(TrendChart, {
      props: {
        dates: DATES,
        series: [
          { key: 'mood', label: '心情', values: [4, 3, null, null] },
          { key: 'energy', label: '精力', values: [null, null, null, null] },
        ],
      },
    });
    expect(filled.find('[data-test="trend-stat-mood"]').text()).toBe('2 天 · 平均 3.5');
    expect(filled.find('[data-test="trend-stat-energy"]').text()).toBe('还没记录');
    expect(filled.find('[data-test="trend-empty"]').exists()).toBe(false);

    const empty = mount(TrendChart, {
      props: {
        dates: DATES,
        series: [
          { key: 'mood', label: '心情', values: [null, null, null, null] },
          { key: 'energy', label: '精力', values: [null, null, null, null] },
        ],
      },
    });
    expect(empty.find('[data-test="trend-empty"]').exists()).toBe(true);
    expect(empty.find('[data-test="trend-svg"]').exists()).toBe(false);
  });

  it('纯 SVG、无外部依赖：没有 img / script / iframe，线条颜色走 CSS 变量', () => {
    const wrapper = mount(TrendChart, {
      props: {
        dates: DATES,
        series: [
          { key: 'mood', label: '心情', values: [1, 2, 3, 4] },
          { key: 'energy', label: '精力', values: [4, 3, 2, 1] },
        ],
      },
    });
    expect(wrapper.findAll('img')).toHaveLength(0);
    expect(wrapper.findAll('script')).toHaveLength(0);
    expect(wrapper.findAll('iframe')).toHaveLength(0);
    expect(wrapper.find('[data-test="trend-svg"]').attributes('role')).toBe('img');
    // 线宽 2 由样式类给，颜色只来自 CSS 变量（不在标签上写死颜色）
    const line = wrapper.find('[data-test="trend-line-mood"]');
    expect(line.attributes('fill')).toBe('none');
    expect(line.attributes('stroke')).toBeUndefined();
    expect(line.classes()).toContain('series-mood');
  });

  it('刻度与起止日期：x 轴首尾是最近 14 天的边界', () => {
    const wrapper = mount(TrendChart, {
      props: {
        dates: ['2026-05-20', '2026-06-02'],
        series: [{ key: 'mood', label: '心情', values: [3, 4] }],
      },
    });
    const axis = wrapper.findAll('.trend-axis span').map((node) => node.text());
    expect(axis).toEqual(['05-20', '06-02']);
    expect(wrapper.findAll('.trend-grid')).toHaveLength(3);
  });
});
