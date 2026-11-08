import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { Plan, PlayRecord, SettingsRecord, StudyRecord, WorkoutRecord, WorkoutTemplate, Water } from '@/db';
import { useHomeStore } from '@/stores/home';
import { useSettingsStore } from '@/stores/settings';
import HomeTiles from './HomeTiles.vue';

const Stub = defineComponent({ template: '<div />' });
const TODAY = '2026-06-01';

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/home' },
      { path: '/home', component: Stub },
      { path: '/plan', component: Stub },
      { path: '/study/timer', component: Stub },
      { path: '/life/diet', component: Stub },
      { path: '/life/workout', component: Stub },
      { path: '/life/play', component: Stub },
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

function planFixture(title: string, done: boolean): Plan {
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
    done,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
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

let pinia: Pinia;
let router: Router;

function mountTiles() {
  return mount(HomeTiles, { global: { plugins: [pinia, router] } });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  router = makeRouter();
  useSettingsStore().$patch({ loaded: true, data: settingsRecord() });
});

describe('首页今日数据方块', () => {
  it('4 个方块的数据全部来自 home store 并格式化正确', () => {
    const home = useHomeStore();
    home.$patch({
      today: TODAY,
      plans: [planFixture('已完成', true), planFixture('未完成A', false), planFixture('未完成B', false)],
      studyRecords: [studyFixture(3600), studyFixture(1800)],
      waterRecords: [waterFixture(250), waterFixture(500)],
      playRecords: [playFixture(30), playFixture(45)],
    });

    const wrapper = mountTiles();
    expect(wrapper.findAll('[data-test="home-tiles"] > .home-tile')).toHaveLength(4);

    expect(wrapper.find('[data-test="tile-plan-label"]').text()).toBe('待办完成率');
    expect(wrapper.find('[data-test="tile-plan-main"]').text()).toBe('1/3');
    expect(wrapper.find('[data-test="tile-plan-sub"]').text()).toBe('完成率 33%');

    expect(wrapper.find('[data-test="tile-study-label"]').text()).toBe('学习时长');
    expect(wrapper.find('[data-test="tile-study-main"]').text()).toBe('01:30:00');
    expect(wrapper.find('[data-test="tile-study-sub"]').text()).toBe('目标 120 分钟');

    expect(wrapper.find('[data-test="tile-workout-label"]').text()).toBe('运动');
    expect(wrapper.find('[data-test="tile-workout-main"]').text()).toBe('休息日');
    expect(wrapper.find('[data-test="tile-water"]').exists()).toBe(false);

    expect(wrapper.find('[data-test="tile-play-label"]').text()).toBe('娱乐时长');
    expect(wrapper.find('[data-test="tile-play-main"]').text()).toBe('75 分钟');
    expect(wrapper.find('[data-test="tile-play-sub"]').text()).toBe('目标 60 分钟');
  });

  it('空态：无待办/无学习/无喝水/无娱乐时显示 0 值', () => {
    const home = useHomeStore();
    home.$patch({
      today: TODAY,
      plans: [],
      studyRecords: [],
      waterRecords: [],
      playRecords: [],
    });

    const wrapper = mountTiles();
    expect(wrapper.find('[data-test="tile-plan-main"]').text()).toBe('0/0');
    expect(wrapper.find('[data-test="tile-plan-sub"]').text()).toBe('完成率 0%');
    expect(wrapper.find('[data-test="tile-study-main"]').text()).toBe('00:00:00');
    expect(wrapper.find('[data-test="tile-workout-main"]').text()).toBe('休息日');
    expect(wrapper.find('[data-test="tile-play-main"]').text()).toBe('0 分钟');
  });

  it('运动计划从待训练变为已完成，休息计划保持休息日', async () => {
    const home=useHomeStore();
    home.$patch({ today: TODAY, todayWorkoutTemplate: { id:'t', weekday:1, type_name:'上肢力量', exercise_names:[], created_at:1, updated_at:1, deleted_at:null } as WorkoutTemplate });
    const wrapper=mountTiles();
    expect(wrapper.find('[data-test="tile-workout-main"]').text()).toBe('待训练');
    expect(wrapper.find('[data-test="tile-workout-sub"]').text()).toBe('今日计划：上肢力量');
    home.$patch({ todayWorkoutRecord: { id:'r', date:TODAY, type_name:'上肢力量', exercises:[], duration_min:30, done:true, created_at:1, updated_at:1, deleted_at:null } as WorkoutRecord });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="tile-workout-main"]').text()).toBe('已完成');
    home.$patch({ todayWorkoutTemplate: { ...home.todayWorkoutTemplate!, type_name:'休息' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="tile-workout-main"]').text()).toBe('休息日');
  });

  it('点击 4 个方块分别跳 /plan、/study/timer、/life/workout、/life/play', async () => {
    const cases: readonly (readonly [string, string])[] = [
      ['tile-plan', '/plan'],
      ['tile-study', '/study/timer'],
      ['tile-workout', '/life/workout'],
      ['tile-play', '/life/play'],
    ];

    for (const [selector, path] of cases) {
      router = makeRouter();
      await router.push('/home');
      await router.isReady();
      const wrapper = mountTiles();
      await wrapper.find(`[data-test="${selector}"]`).trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe(path);
      wrapper.unmount();
    }
  });
});
