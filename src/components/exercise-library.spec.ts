import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ExerciseLibrary from './ExerciseLibrary.vue';

describe('ExerciseLibrary 项目库区块', () => {
  it('按传入顺序渲染动作按钮', () => {
    const wrapper = mount(ExerciseLibrary, {
      props: { names: ['飞鸟', '卧推', '深蹲'] },
    });
    const items = wrapper.findAll('[data-test="library-item"]');
    expect(items.map((i) => i.text())).toEqual(['飞鸟', '卧推', '深蹲']);
    expect(wrapper.find('[data-test="library-empty"]').exists()).toBe(false);
  });

  it('点按钮 emit select 携带动作名', async () => {
    const wrapper = mount(ExerciseLibrary, { props: { names: ['飞鸟', '卧推'] } });
    await wrapper.findAll('[data-test="library-item"]')[1]!.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['卧推']);
  });

  it('为空显示简短空状态提示且不报错', () => {
    const wrapper = mount(ExerciseLibrary, { props: { names: [] } });
    expect(wrapper.find('[data-test="library-item"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="library-empty"]').text()).toContain('还没有常用动作');
  });
});
