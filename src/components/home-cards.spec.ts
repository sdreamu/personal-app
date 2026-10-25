import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { listAliveByDate, resetDbForTests, type Book, type Plan, type PlayRecord, type SettingsRecord, type StudyRecord, type Water, type WorkoutRecord, type WorkoutTemplate } from '@/db';
import { useHomeStore } from '@/stores/home';
import { useSettingsStore } from '@/stores/settings';
import { useTimerStore } from '@/stores/timer';
import HomeCards from './HomeCards.vue';

const Stub = defineComponent({ template: '<div />' });
const TODAY = '2026-06-01';

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/plan' },
      { path: '/plan', component: Stub },
      { path: '/study/timer', component: Stub },
      { path: '/study/books', component: Stub },
      { path: '/study/books/:id', component: Stub },
      { path: '/life/diet', component: Stub },
      { path: '/life/workout', component: Stub },
      { path: '/life/play', component: Stub },
      { path: '/settings', component: Stub },
      { path: '/:pathMatch(.*)*', redirect: '/plan' },
    ],
  });
}

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

function planFixture(title: string, overrides: Partial<Plan> = {}): Plan {
  return {
    id: `plan-${title}`,
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    title,
    date: TODAY,
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
    ...overrides,
  } as Plan;
}

function studyFixture(durationSec: number): StudyRecord {
  return {
    id: `study-${durationSec}`,
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    target_type: 'book',
    target_id: null,
    target_title: '读书',
    start_at: 1,
    end_at: 1 + durationSec * 1000,
    duration_sec: durationSec,
    note: null,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'manual',
    date: TODAY,
  } as StudyRecord;
}

function bookFixture(title: string, currentPage: number, totalPages: number): Book {
  return {
    id: `book-${title}`,
    created_at: 1,
    updated_at: 2,
    deleted_at: null,
    title,
    author: null,
    total_pages: totalPages,
    current_page: currentPage,
    status: 'reading',
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
  } as Book;
}

function waterFixture(ml: number): Water {
  return {
    id: `water-${ml}`,
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    date: TODAY,
    ml,
    at: 1,
  } as Water;
}

function playFixture(minutes: number): PlayRecord {
  return {
    id: `play-${minutes}`,
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    date: TODAY,
    content: '游戏',
    minutes,
    source: 'manual',
  } as PlayRecord;
}

function templateFixture(typeName: string): WorkoutTemplate {
  return {
    id: 'template-1',
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    weekday: 1,
    type_name: typeName,
    exercise_names: [],
  };
}

function workoutRecordFixture(done: boolean): WorkoutRecord {
  return {
    id: 'workout-today',
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    date: TODAY,
    type_name: '胸',
    exercises: [],
    duration_min: 45,
    done,
  };
}

let pinia: Pinia;
let router: Router;

function mountCards() {
  return mount(HomeCards, { global: { plugins: [pinia, router] } });
}

beforeEach(async () => {
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  router = makeRouter();
  const settings = useSettingsStore();
  settings.$patch({ loaded: true, data: settingsRecord() });
});

describe('首页六张卡片渲染', () => {
  it('渲染六张卡片的数据与空态（学习/喝水/娱乐/计划/阅读/运动休息）', () => {
    const home = useHomeStore();
    home.$patch({
      today: TODAY,
      plans: [
        planFixture('已完成待办', { done: true }),
        planFixture('未完成待办'),
        planFixture('读书时间块', { start_min: 400, end_min: 460 }),
      ],
      studyRecords: [studyFixture(5400)],
      books: [bookFixture('新书', 100, 200)],
      waterRecords: [waterFixture(250), waterFixture(500)],
      todayWorkoutTemplate: templateFixture('胸'),
      todayWorkoutRecord: workoutRecordFixture(true),
      playRecords: [playFixture(30), playFixture(45)],
    });

    const wrapper = mountCards();
    expect(wrapper.findAll('[data-test="home-cards"] > .home-card')).toHaveLength(6);

    expect(wrapper.find('[data-test="plan-progress"]').text()).toContain('已完成 1 / 3');
    expect(wrapper.find('[data-test="plan-next"]').text()).toContain('读书时间块');
    expect(wrapper.find('[data-test="study-text"]').text()).toContain('01:30:00');
    expect(wrapper.find('[data-test="study-text"]').text()).toContain('120 分钟');
    expect(wrapper.find('[data-test="study-progress"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="reading-title"]').text()).toBe('新书');
    expect(wrapper.find('[data-test="reading-progress"]').text()).toContain('100 / 200 页');
    expect(wrapper.find('[data-test="water-text"]').text()).toContain('750 ml');
    expect(wrapper.find('[data-test="water-text"]').text()).toContain('2000 ml');
    expect(wrapper.find('[data-test="workout-type"]').text()).toBe('胸');
    expect(wrapper.find('[data-test="workout-status"]').text()).toContain('已完成');
    expect(wrapper.find('[data-test="play-text"]').text()).toContain('已用 75 / 60 分钟');
    expect(wrapper.find('[data-test="play-remaining"]').text()).toContain('剩余 0 分钟');
  });

  it('空态：无在读书籍、无未完成时间块、运动休息日', () => {
    const home = useHomeStore();
    home.$patch({
      today: TODAY,
      plans: [planFixture('已完成待办', { done: true })],
      studyRecords: [],
      books: [],
      waterRecords: [],
      todayWorkoutTemplate: templateFixture('休息'),
      todayWorkoutRecord: null,
      playRecords: [],
    });

    const wrapper = mountCards();
    expect(wrapper.find('[data-test="reading-empty"]').text()).toContain('去书架添加一本书');
    expect(wrapper.find('[data-test="plan-empty"]').text()).toContain('今日无未完成时间块');
    expect(wrapper.find('[data-test="workout-rest"]').text()).toBe('今天休息');
  });

  it('新用户目标缺失时计划卡片显示去设置引导', () => {
    const settings = useSettingsStore();
    settings.$patch({ loaded: false, data: null });
    const home = useHomeStore();
    home.$patch({ today: TODAY, plans: [] });

    const wrapper = mountCards();
    expect(wrapper.find('[data-test="plan-guide"]').text()).toContain('先去设置里定今日目标');
  });

  it('+1 杯按钮调用 home.addWater（复用 diet store）', async () => {
    const home = useHomeStore();
    home.$patch({ today: TODAY, waterRecords: [] });
    const addWater = vi.spyOn(home, 'addWater').mockResolvedValue(null);

    const wrapper = mountCards();
    await wrapper.find('[data-test="water-plus"]').trigger('click');
    expect(addWater).toHaveBeenCalledTimes(1);
  });

  it('开始计时与继续阅读按钮跳转参数正确', async () => {
    const home = useHomeStore();
    home.$patch({
      today: TODAY,
      studyRecords: [],
      books: [bookFixture('新书', 100, 200)],
      plans: [],
      waterRecords: [],
      todayWorkoutTemplate: null,
      todayWorkoutRecord: null,
      playRecords: [],
    });

    const wrapper = mountCards();
    await wrapper.find('[data-test="study-start"]').trigger('click');
    // 点了就直接开计时（写库要走几轮微任务），所以等导航落定再断言
    await vi.waitFor(() => {
      if (router.currentRoute.value.path !== '/study/timer') throw new Error('还没跳到计时页');
    });
    expect(useTimerStore().timer?.target_title).toBe('新书');

    await wrapper.find('[data-test="reading-continue"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/study/timer');
    expect(router.currentRoute.value.query).toEqual({ type: 'book', id: 'book-新书' });
  });

  it('卡片点击跳转对应页面', async () => {
    const home = useHomeStore();
    home.$patch({
      today: TODAY,
      plans: [planFixture('读书时间块', { start_min: 400, end_min: 460 })],
      studyRecords: [],
      books: [],
      waterRecords: [],
      todayWorkoutTemplate: null,
      todayWorkoutRecord: null,
      playRecords: [],
    });

    const wrapper = mountCards();
    await wrapper.find('[data-test="plan-card"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/plan');

    await wrapper.find('[data-test="water-card"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/life/diet');

    await wrapper.find('[data-test="play-card"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/life/play');
  });
  it('已经有计时在跑时，「开始计时」只跳过去不重复开一条', async () => {
    const home = useHomeStore();
    home.$patch({
      today: TODAY,
      studyRecords: [],
      books: [bookFixture('新书', 100, 200)],
      plans: [],
      waterRecords: [],
      todayWorkoutTemplate: null,
      todayWorkoutRecord: null,
      playRecords: [],
    });
    const timer = useTimerStore();
    await timer.startTimer({ type: 'book', targetId: 'book-新书', targetTitle: '新书', mode: 'stopwatch' });
    const startedAt = timer.timer?.started_at;

    const wrapper = mountCards();
    await wrapper.find('[data-test="study-start"]').trigger('click');
    await vi.waitFor(() => {
      if (router.currentRoute.value.path !== '/study/timer') throw new Error('还没跳到计时页');
    });
    expect(timer.timer?.started_at).toBe(startedAt);
  });
});

describe('首页喝水可加可减（AC-72）', () => {
  it('喝水卡同时有「−1 杯」和「+1 杯」，减号在左', () => {
    const home = useHomeStore();
    home.$patch({ today: TODAY, waterRecords: [waterFixture(250)] });
    const wrapper = mountCards();

    const buttons = wrapper.find('[data-test="water-card"]').findAll('button');
    expect(buttons.map((node) => node.attributes('data-test'))).toEqual(['water-minus', 'water-plus']);
    expect(wrapper.find('[data-test="water-minus"]').text()).toBe('−1 杯');
    expect(wrapper.find('[data-test="water-plus"]').text()).toBe('+1 杯');
    expect(wrapper.find('[data-test="water-minus"]').attributes('disabled')).toBeUndefined();
  });

  it('点「−1 杯」调用一次 removeWater（不跳页）', async () => {
    const home = useHomeStore();
    home.$patch({ today: TODAY, waterRecords: [waterFixture(250)] });
    const removeWater = vi.spyOn(home, 'removeWater').mockResolvedValue(null);

    const wrapper = mountCards();
    await wrapper.find('[data-test="water-minus"]').trigger('click');

    expect(removeWater).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).not.toBe('/life/diet');
  });

  it('0 ml 时减号 disabled，点它不写库', async () => {
    const home = useHomeStore();
    home.$patch({ today: TODAY, waterRecords: [] });
    const wrapper = mountCards();

    const minus = wrapper.find('[data-test="water-minus"]');
    expect(minus.attributes('disabled')).toBeDefined();

    await minus.trigger('click');
    await flushPromises();
    expect(await listAliveByDate('water', TODAY)).toHaveLength(0);
    expect(home.water.totalMl).toBe(0);
  });
});
