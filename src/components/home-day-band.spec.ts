import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { Plan } from '@/db';
import { useHomeStore } from '@/stores/home';
import type { SettingsRecord } from '@/db';
import { useSettingsStore } from '@/stores/settings';
import HomeDayBand from './HomeDayBand.vue';

/** 一天起点固定 04:00，则 offset 0 = 04:00、offset 1440 = 次日 04:00。 */
function plan(partial: Partial<Plan> & { id: string; title: string }): Plan {
  return {
    key: partial.id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    date: '2026-10-24',
    start_min: 120,
    end_min: 180,
    category_key: 'study',
    category_name: '学习',
    target_type: null,
    target_id: null,
    target_title: null,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
    ...partial,
  } as Plan;
}

/** 一天起点 04:00 的设置记录（settings store 的 dayStartMin 是派生 getter）。 */
function settingsRecord(): SettingsRecord {
  return {
    key: 'app',
    id: 'settings-1',
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    daily_study_min: 120,
    daily_water_ml: 2000,
    cup_ml: 250,
    daily_play_min: 60,
    day_start: '04:00',
    theme: 'light',
    last_backup_at: null,
  };
}

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  useSettingsStore().$patch({ loaded: true, data: settingsRecord() });
});

function mountBand(plans: Plan[]) {
  useHomeStore().$patch({ plans });
  return mount(HomeDayBand, { global: { plugins: [pinia] } });
}

describe('首页粗时间带', () => {
  it('只画带时间的事，标题与起点时间都在块里', () => {
    const wrapper = mountBand([
      plan({ id: 'a', title: '微积分习题', start_min: 330, end_min: 420 }),
      plan({ id: 'b', title: '买牛奶', start_min: null, end_min: null }),
    ]);
    const blocks = wrapper.findAll('.ev');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text()).toContain('微积分习题');
    expect(blocks[0].text()).toContain('09:30');
  });

  it('状态语法：已完成实块 / 逾期朱砂写「没做」/ 之后只描边', () => {
    const wrapper = mountBand([
      plan({ id: 'done', title: '晨读', start_min: 60, end_min: 120, done: true }),
      plan({ id: 'miss', title: '英语听力', start_min: 300, end_min: 360 }),
      plan({ id: 'later', title: '睡前拉伸', start_min: 1400, end_min: 1440 }),
    ]);
    expect(wrapper.find('[data-test="band-event-done"]').classes()).toContain('done');
    const miss = wrapper.find('[data-test="band-event-miss"]');
    expect(miss.classes()).toContain('miss');
    expect(miss.text()).toContain('没做');
    expect(wrapper.find('[data-test="band-event-later"]').classes()).toContain('next');
  });

  it('重叠的两件事分两排，互不压字', () => {
    const wrapper = mountBand([
      plan({ id: 'p1', title: 'A', start_min: 600, end_min: 720 }),
      plan({ id: 'p2', title: 'B', start_min: 630, end_min: 690 }),
    ]);
    expect(wrapper.find('[data-test="band-event-p1"]').classes()).toContain('lane-a');
    expect(wrapper.find('[data-test="band-event-p2"]').classes()).toContain('lane-b');
    expect(wrapper.find('.band-lanes').classes()).toContain('two');
  });

  it('刻度跟着一天起点走：04:00 起的第一格就是 04:00', () => {
    const wrapper = mountBand([]);
    const labels = wrapper.findAll('.band-tick').map((tick) => tick.text());
    expect(labels[0]).toBe('04:00');
    expect(labels).toContain('12:00');
    expect(wrapper.find('.band-empty').text()).toBe('今天还没有排事');
  });

  it('空的一天不报错：没有块、只留空态文案', () => {
    const wrapper = mountBand([]);
    expect(wrapper.findAll('.ev')).toHaveLength(0);
    expect(wrapper.find('.band-empty').exists()).toBe(true);
  });
});
