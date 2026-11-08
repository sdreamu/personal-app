import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root=dirname(fileURLToPath(import.meta.url));
const destination=join(root,'screenshots','glass-pages');
await mkdir(destination,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const page=await context.newPage();
const base=pathToFileURL(join(root,'index.html')).href;
const url=id=>`index.html?material=glass&theme=light&page=${id}`;
const errors=[],requests=[],evidence=[],results=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
const goto=async(id,theme,sheet='')=>{
  await page.goto(base+`?material=glass&theme=${theme}&page=${id}${sheet?'&sheet='+sheet:''}`);
  await page.evaluate(()=>document.fonts.ready);
};
async function layout(label){
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': horizontal overflow');
  const undersized=await page.locator('button,input,select').evaluateAll(elements=>elements.filter(el=>el.checkVisibility()&&getComputedStyle(el).pointerEvents!=='none'&&el.getBoundingClientRect().height<44).map(el=>el.getAttribute('aria-label')||el.textContent));
  assert.deepEqual(undersized,[],label+': touch targets below 44px height');
  const unlabeled=await page.locator('input,textarea').evaluateAll(elements=>elements.filter(el=>!el.getAttribute('aria-label')&&!el.labels?.length).map(el=>el.outerHTML));
  assert.deepEqual(unlabeled,[],label+': form labels missing');
}
async function demoDialog(){
  await page.getByRole('button',{name:'＋ 记一笔',exact:true}).click();
  assert.equal(await page.locator('dialog').evaluate(el=>el.open),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').evaluate(el=>el.open),false);
}
try{
  await goto('home','light');
  const pages=await page.evaluate(()=>window.conceptPages);
  const forms=await page.evaluate(()=>window.conceptForms);
  const router=await readFile(join(root,'../../../src/router/index.ts'),'utf8');
  const productRoutes=[...router.split('export const appRoutePaths')[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(pages.map(p=>p.route).sort(),productRoutes.sort(),'Cover every existing product route');
  const texts=new Map();
  for(const theme of ['light','dark']){
    for(const concept of pages){
      await page.setViewportSize({width:390,height:844});
      await goto(concept.id,theme);
      assert.equal(await page.locator('body').getAttribute('data-page'),concept.id);
      const text=await page.locator('main').innerText();
      if(theme==='light')texts.set(concept.id,text);else assert.equal(text,texts.get(concept.id),'Light/dark contents must match');
      const active=await page.locator('.tab.active').allTextContents();
      assert.deepEqual(active,concept.group==='设置'?[]:[concept.group]);
      if(concept.id==='home'){
        assert.match(await page.locator('.goal:nth-child(3)').innerText(),/运动[\s\S]*待训练[\s\S]*上肢力量/);
        assert.match(await page.locator('.module').nth(3).innerText(),/喝水[\s\S]*1,250 ml/);
      }
      for(const width of [320,390,430]){
        await page.setViewportSize({width,height:844});
        await layout(`${concept.id}-${theme}-${width}`);
      }
      await page.setViewportSize({width:390,height:844});
      await demoDialog();
      await page.evaluate(()=>{document.activeElement.blur();scrollTo(0,0);});
      const artifact=`screenshots/glass-pages/${concept.id}-${theme}.png`;
      await page.screenshot({path:join(root,artifact)});
      evidence.push({viewport:'390x844',artifact,observation:`${concept.name}, ${theme}: screenshot of fixed demo content using the selected glass direction.`});
      const height=await page.locator('main').evaluate(el=>Math.max(844,Math.ceil(el.getBoundingClientRect().bottom)));
      await page.setViewportSize({width:390,height});
      await page.screenshot({path:join(destination,`${concept.id}-${theme}-full.png`)});
      results.push({id:concept.id,theme,kind:'page',viewports:[320,390,430],status:'pass'});
    }
    for(const form of forms){
      await page.setViewportSize({width:390,height:844});
      await goto(form.base,theme,form.id);
      await layout(`${form.id}-${theme}`);
      assert.equal(await page.locator('#sheet-heading').innerText(),form.name);
      const overflow=await page.locator('.form-sheet').evaluate(el=>el.scrollWidth>el.clientWidth);
      assert.equal(overflow,false,form.id+': form horizontal overflow');
      if(form.id==='settlement'){
        assert.equal(await page.locator('.sheet-title button').count(),0,'Settlement must offer save/discard, not an escape close');
        assert.match(await page.locator('.sheet-actions').innerText(),/丢弃[\s\S]*保存记录/);
      }
      const artifact=`screenshots/glass-pages/${form.id}-${theme}.png`;
      await page.screenshot({path:join(root,artifact)});
      evidence.push({viewport:'390x844',artifact,observation:`${form.name}, ${theme}: static form composition; actual persistence and modal lifecycle are not implemented.`});
      await page.getByRole('button',{name:form.id==='settlement'?'保存记录':'保存',exact:true}).click();
      assert.equal(await page.locator('dialog').evaluate(el=>el.open),true,'Static forms must explain their demo behavior');
      await page.getByRole('button',{name:'知道了',exact:true}).click();
      results.push({id:form.id,theme,kind:'form',status:'pass'});
    }
    await goto('home',theme);
    await page.setViewportSize({width:390,height:2700});
    await page.locator('.bottom-wrap').evaluate(el=>el.style.visibility='hidden');
    for(const section of ['goals','timeline','hint','mit','next','week','seven','modules']){
      await page.locator(`[data-section="${section}"]`).screenshot({path:join(destination,`home-${section}-${theme}.png`)});
    }
  }
  // Keep narrow and wide rendered evidence, and inspect large content at both limits.
  await goto('workout','dark');
  for(const [width,height] of [[320,844],[1440,900]]){
    await page.setViewportSize({width,height});
    await layout(`workout-dark-${width}`);
    const artifact=`screenshots/glass-pages/workout-dark-${width}.png`;
    await page.screenshot({path:join(root,artifact)});
    evidence.push({viewport:`${width}x${height}`,artifact,observation:'Additional narrow/wide viewport capture of the densest exercise-set form. Wider screens intentionally center the mobile concept.'});
  }
  await goto('settings','light');
  await page.setViewportSize({width:430,height:844});
  const artifact='screenshots/glass-pages/settings-light-430.png';
  await page.screenshot({path:join(root,artifact)});
  evidence.push({viewport:'430x844',artifact,observation:'430px grouped settings with labels and editable numeric controls.'});
  await page.setViewportSize({width:390,height:844});
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.add').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  assert.deepEqual(errors,[],'No script errors');assert.deepEqual(requests,[],'No network requests');

  const groups=[
    {id:'daily',name:'日常总览',caption:'首页 / 日程 / 复盘 / 设置',ids:['home','plan','review','settings']},
    {id:'study',name:'学习与阅读',caption:'读书 / 书籍详情 / 科目 / 错题本',ids:['books','book-detail','subjects','mistakes']},
    {id:'life',name:'计时与生活',caption:'计时器 / 饮食 / 健身 / 娱乐',ids:['timer','diet','workout','play']},
    {id:'forms',name:'记录表单',caption:'新增计划 / 学习结算 / 添加书籍 / 添加科目 / 错题 / 饮食',ids:forms.map(f=>f.id)},
  ];
  const catalog=[...pages,...forms];
  const gallery=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>通透 UI · 全模块设计预览</title><style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f0f2f6;color:#202735;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif}header{padding:44px 4vw 26px;max-width:1600px;margin:auto}h1{font-size:34px;letter-spacing:-1px;margin:0 0 12px}p{font-size:13px;line-height:1.8;color:#626978;margin:0}.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:20px}button,.toolbar a{min-height:44px;padding:11px 17px;border:0;border-radius:13px;background:#fff;color:#0065d1;font:inherit;font-size:13px;cursor:pointer;text-decoration:none}button[aria-pressed=true]{background:#0065d1;color:#fff}button:focus-visible,a:focus-visible{outline:3px solid #0065d1;outline-offset:3px}main{max-width:1600px;margin:auto;padding:0 4vw 50px}section{margin-top:30px;scroll-margin-top:20px}h2{font-size:22px;margin:0 0 8px}h3{font-size:14px;margin:0}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-top:18px}.item{min-width:0}.label{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.label a{color:#0065d1;font-size:12px;text-decoration:none;padding:12px 0}.item img{width:100%;display:block;border-radius:24px;border:1px solid #dce1e9}.links{display:flex;gap:16px;margin-top:8px}.links a{font-size:12px;color:#0065d1;text-decoration:none;min-height:44px;display:flex;align-items:center}.parts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;align-items:start;margin-top:20px}.part img{width:100%;height:auto;border-radius:20px;display:block}.part h3{margin-bottom:12px}.note{margin-top:20px;font-size:11px}.caption{margin-bottom:12px}.top-link{display:block;font-size:13px;color:#0065d1;margin-top:22px}@media(max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.parts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:540px){h1{font-size:27px}.grid,.parts{grid-template-columns:1fr}.item{max-width:390px}header{padding-top:28px}.toolbar{gap:6px}.toolbar a{padding:10px 12px}.grid{gap:25px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}</style><header id="top"><h1>通透风格，贯穿每一页。</h1><p>苹果蓝 · 手机优先 · 12 个页面 + 6 个表单，均含浅色与深色。<br>首页大卡片的喝水已换为运动；下方喝水模块保留。所有内容均为演示，未接入真实记录。</p><div class="toolbar"><button data-theme="light" aria-pressed="true">浅色示例</button><button data-theme="dark" aria-pressed="false">深色示例</button>${groups.map(g=>`<a href="#${g.id}">${g.name}</a>`).join('')}<a href="#home-parts">首页各区块</a></div></header><main>${groups.map(g=>`<section id="${g.id}"><h2>${g.name}</h2><p class="caption">${g.caption}</p><div class="grid">${g.ids.map(id=>{const c=catalog.find(c=>c.id===id);return `<article class="item"><div class="label"><h3>${c.name}</h3><a data-preview="${id}" href="${url(c.base||id)}${c.base?'&sheet='+id:''}" target="_blank">打开示例 ↗</a></div><a data-full="${id}" href="screenshots/glass-pages/${id}-light${c.base?'':'-full'}.png" target="_blank"><img loading="lazy" data-image="${id}" src="screenshots/glass-pages/${id}-light.png" alt="${c.name}浅色通透示例"></a><div class="links"><a data-full="${id}" href="screenshots/glass-pages/${id}-light${c.base?'':'-full'}.png" target="_blank">${c.base?'查看表单大图':'查看完整长图'} ↗</a></div></article>`;}).join('')}</div></section>`).join('')}<section id="home-parts"><h2>首页各区块</h2><p>大卡片 / 时间带 / 提示 / 昨日事项 / 接下来 / 本周学习 / 未来七天 / 模块汇总</p><div class="parts">${[['goals','四项目标 · 运动替换喝水'],['timeline','今日时间带'],['hint','昨日复盘提醒'],['mit','昨日最重要的一件事'],['next','接下来'],['week','本周学习'],['seven','未来七天'],['modules','六个模块汇总']].map(([id,name])=>`<article class="part"><h3>${name}</h3><a data-part="${id}" href="screenshots/glass-pages/home-${id}-light.png" target="_blank"><img loading="lazy" data-part-image="${id}" src="screenshots/glass-pages/home-${id}-light.png" alt="${name}浅色"></a></article>`).join('')}</div></section><p class="note">静态 UI 设计预览。计时、保存、导入与删除仅展示控件样式；实际功能与状态将在正式实现时接入。</p><a class="top-link" href="#top">回到顶部 ↑</a></main><script>const forms=${JSON.stringify(forms)};const catalog=${JSON.stringify(catalog)};document.querySelectorAll('button[data-theme]').forEach(button=>button.addEventListener('click',()=>{const theme=button.dataset.theme;document.querySelectorAll('button[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('[data-image]').forEach(img=>{img.src='screenshots/glass-pages/'+img.dataset.image+'-'+theme+'.png';img.alt=img.dataset.image+' '+theme+'通透示例'});document.querySelectorAll('[data-full]').forEach(a=>{const id=a.dataset.full;a.href='screenshots/glass-pages/'+id+'-'+theme+(forms.some(f=>f.id===id)?'':'-full')+'.png'});document.querySelectorAll('[data-preview]').forEach(a=>{const id=a.dataset.preview;const c=catalog.find(c=>c.id===id);a.href='index.html?material=glass&theme='+theme+'&page='+(c.base||id)+(c.base?'&sheet='+id:'')});document.querySelectorAll('[data-part-image]').forEach(img=>img.src='screenshots/glass-pages/home-'+img.dataset.partImage+'-'+theme+'.png');document.querySelectorAll('[data-part]').forEach(a=>a.href='screenshots/glass-pages/home-'+a.dataset.part+'-'+theme+'.png')}));</script></html>`;
  await writeFile(join(root,'gallery.html'),gallery);

  // Compact contact sheets, with direct full-size pages retained in the gallery.
  const sheets=[];
  await context.close();
  const reviewPage=await browser.newPage({viewport:{width:1712,height:2000},deviceScaleFactor:1});
  for(const group of groups){
    const columns=group.id==='forms'?3:4;
    const width=columns*390+(columns-1)*24+80;
    for(const theme of ['light','dark']){
      const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:${theme==='dark'?'#121821':'#e9edf3'};color:${theme==='dark'?'#f2f4f7':'#1e2735'};font-family:'Segoe UI','Microsoft YaHei',sans-serif;padding:36px 40px}h1{margin:0;font-size:26px;letter-spacing:-.5px}p{margin:8px 0 24px;font-size:12px;color:${theme==='dark'?'#b1bbc8':'#616c7d'}}.grid{display:grid;grid-template-columns:repeat(${columns},390px);gap:24px}h2{font-size:14px;margin:0 0 12px;font-weight:600}img{width:390px;height:844px;display:block;border-radius:28px}footer{font-size:11px;margin-top:20px;color:${theme==='dark'?'#b1bbc8':'#616c7d'}}</style><h1>${group.name} · ${theme==='dark'?'深色':'浅色'}通透</h1><p>个人生活助手 / ${group.caption} / 同一套苹果蓝与通透材质</p><div class="grid">${group.ids.map(id=>`<article><h2>${catalog.find(c=>c.id===id).name}</h2><img src="${id}-${theme}.png" alt="${id}"></article>`).join('')}</div><footer>视觉概念 · 演示数据 · 完整页面及首页各区块见 gallery.html</footer></html>`;
      const filename=`${group.id}-${theme}-overview.html`;
      await writeFile(join(destination,filename),html);
      await reviewPage.setViewportSize({width,height:1100});
      await reviewPage.goto(pathToFileURL(join(destination,filename)).href);
      await reviewPage.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
      const artifact=`screenshots/glass-pages/${group.id}-${theme}-overview.png`;
      await reviewPage.screenshot({path:join(root,artifact),fullPage:true});
      sheets.push(artifact);
    }
  }
  await reviewPage.setViewportSize({width:1440,height:900});
  await reviewPage.goto(pathToFileURL(join(root,'gallery.html')).href);
  await reviewPage.getByRole('button',{name:'深色示例'}).click();
  assert.equal(await reviewPage.getByRole('button',{name:'深色示例'}).getAttribute('aria-pressed'),'true');
  assert.match(await reviewPage.locator('[data-image="home"]').getAttribute('src'),/home-dark/);
  assert.match(await reviewPage.locator('[data-part-image="goals"]').getAttribute('src'),/goals-dark/);
  assert.match(await reviewPage.locator('[data-full="plan"]').first().getAttribute('href'),/plan-dark-full/);
  assert.match(await reviewPage.locator('[data-preview="plan-form"]').getAttribute('href'),/page=plan&sheet=plan-form/);
  for(const width of [390,1440]){
    await reviewPage.setViewportSize({width,height:900});
    assert.ok(await reviewPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Gallery must fit viewport');
  }
  await reviewPage.close();
  await writeFile(join(root,'pages-capture-log.json'),JSON.stringify({status:'pass',pages,forms,results,renderedEvidence:evidence,contactSheets:sheets},null,2)+'\n');
  console.log(`PASS: ${pages.length} pages in light/dark, ${forms.length} forms in light/dark; all existing routes covered; 320/390/430px layouts, labels, touch targets, keyboard focus, reduced motion, demo feedback and offline checks; gallery theme switching. 8 home block crops per theme and 8 contact sheets saved.`);
}finally{await browser.close();}
