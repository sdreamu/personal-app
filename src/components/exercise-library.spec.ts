import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ExerciseLibrary from './ExerciseLibrary.vue';

function item(name: string) {
  return { id: 'ex-' + name, name };
}

describe('ExerciseLibrary 项目库区块', () => {
  it('按传入顺序渲染动作按钮', () => {
    const wrapper = mount(ExerciseLibrary, {
      props: { items: [item('飞鸟'), item('卧推'), item('深蹲')] },
    });
    const rows = wrapper.findAll('[data-test="library-item"]');
    expect(rows.map((row) => row.text())).toEqual(['飞鸟', '卧推', '深蹲']);
    expect(wrapper.find('[data-test="library-empty"]').exists()).toBe(false);
  });

  it('点按钮 emit select 携带动作名', async () => {
    const wrapper = mount(ExerciseLibrary, {
      props: { items: [item('飞鸟'), item('卧推')] },
    });
    await wrapper.findAll('[data-test="library-item"]')[1]!.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['卧推']);
  });

  it('为空显示自己的动作清单空状态提示且不报错', () => {
    const wrapper = mount(ExerciseLibrary, { props: { items: [] } });
    expect(wrapper.find('[data-test="library-item"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="library-empty"]').text()).toContain(
      '这里是你自己的动作清单，先写下来，练的时候点一下',
    );
  });

  it('顶部输入框 + 添加按钮：回车或点按钮都 emit add（trim 后为空不 emit）', async () => {
    const wrapper = mount(ExerciseLibrary, { props: { items: [] } });
    const input = wrapper.find('[data-test="library-add-input"]');
    expect(input.exists()).toBe(true);
    const button = wrapper.find('[data-test="library-add-btn"]');
    expect(button.text()).toBe('添加');

    await input.setValue('   ');
    await input.trigger('keyup.enter');
    await button.trigger('click');
    expect(wrapper.emitted('add')).toBeUndefined();

    await input.setValue(' 深蹲 ');
    await input.trigger('keyup.enter');
    expect(wrapper.emitted('add')?.[0]).toEqual(['深蹲']);
    expect((input.element as HTMLInputElement).value).toBe('');

    await input.setValue('卧推');
    await button.trigger('click');
    expect(wrapper.emitted('add')?.[1]).toEqual(['卧推']);
  });

  it('每条动作右侧一个 ✕：点它 emit remove 携带 id', async () => {
    const wrapper = mount(ExerciseLibrary, {
      props: { items: [item('飞鸟'), item('深蹲')] },
    });
    const removes = wrapper.findAll('[data-test="library-remove"]');
    expect(removes).toHaveLength(2);
    expect(removes[0]!.attributes('aria-label')).toBe('删除 飞鸟');

    await removes[1]!.trigger('click');
    expect(wrapper.emitted('remove')?.[0]).toEqual(['ex-深蹲']);
  });

  it('空白名字的条目被过滤掉（不渲染空按钮）', () => {
    const wrapper = mount(ExerciseLibrary, {
      props: { items: [item('   '), item('深蹲')] },
    });
    expect(wrapper.findAll('[data-test="library-item"]')).toHaveLength(1);
  });
});
