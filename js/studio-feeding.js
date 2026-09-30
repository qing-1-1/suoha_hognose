/* Two sizes of the same 12-frame story. Each visible player owns one timer. */
(() => {
  'use strict';
  const home = document.querySelector('#homeView');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const frames = [
    {text:'巡柜开始，先看看这边。', duration:260},
    {text:'握住把手，慢慢拉开。', duration:350},
    {text:'停下脚步，拉开一格抽屉。', duration:450},
    {text:'准备好镊子，等它靠近。', duration:380},
    {text:'用小镊子，送上一口晚餐。', duration:950},
    {text:'收好抽屉，继续往前走。', duration:240},
    {text:'再去另一组爬柜。', duration:240},
    {text:'走近一点，看看下一位。', duration:300},
    {text:'轻轻开柜，准备下一餐。', duration:380},
    {text:'轮到你啦，今天也认真照顾。', duration:1100},
    {text:'继续巡视，日常还有下一站。', duration:260},
    {text:'一步一步，把日常照顾好。', duration:260}
  ];
  function createPlayer(scene, mini) {
    const viewport = scene?.querySelector('.studio-viewport');
    if (!viewport) return;
    const film = document.createElement('div');
    film.className = 'studio-film';film.hidden = true;
    film.setAttribute('role', 'img');viewport.append(film);
    let controls;
    if (mini) controls = scene;
    else {
      controls = document.createElement('div');controls.className = 'studio-playback';
      controls.innerHTML = `<div class="studio-film-heading"><span>PIXEL DIARY / 喂食时间</span><span data-studio-count>01 / 12</span></div><p data-studio-caption></p><div class="studio-film-actions"><button type="button" data-studio-play>播放喂食动画</button><button type="button" data-studio-replay>重播</button><div class="studio-film-frames" role="group" aria-label="选择喂食动画画面">${frames.map((_,i)=>`<button type="button" data-studio-frame="${i}" aria-label="喂食动画第 ${i+1} 帧" aria-pressed="${i===0}"><span aria-hidden="true"></span></button>`).join('')}</div></div><p class="studio-load-status" role="status" hidden></p>`;
      scene.insertBefore(controls, scene.querySelector('figcaption'));
    }
    const playButton = controls.querySelector(mini ? '[data-mini-play]' : '[data-studio-play]');
    const loadStatus = controls.querySelector('.studio-load-status');
    let frame=0, visible=false, ready=false, loading=null, wantsPlay=!motion.matches, timer=null;
    function paint() {
      film.style.backgroundPosition = `${frame%4/3*100}% ${Math.floor(frame/4)*50}%`;
      film.setAttribute('aria-label', `男生在爬房喂食，第 ${frame+1} 帧：${frames[frame].text}`);
      if (!mini) {
        controls.querySelector('[data-studio-caption]').textContent = frames[frame].text;
        controls.querySelector('[data-studio-count]').textContent = `${String(frame+1).padStart(2,'0')} / 12`;
        controls.querySelectorAll('[data-studio-frame]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.studioFrame)===frame)));
      }
      playButton.textContent = mini ? (wantsPlay?'暂停':'播放') : (wantsPlay?'暂停喂食动画':'播放喂食动画');
      if (mini) playButton.setAttribute('aria-label', wantsPlay?'暂停首屏爬房动画':'播放首屏爬房动画');
      scene.dataset.frame = String(frame);
    }
    function schedule() {
      clearTimeout(timer);
      const playing = ready && wantsPlay && visible && !document.hidden && !home.hidden && !document.querySelector('dialog[open]');
      scene.dataset.playing = String(playing);
      if (playing) timer=setTimeout(()=>{frame=(frame+1)%frames.length;paint();schedule();},frames[frame].duration);
    }
    function load() {
      if (ready) return Promise.resolve(true);
      if (loading) return loading;
      scene.dataset.loaded='loading';loadStatus.hidden=false;loadStatus.textContent='正在准备像素动画…';
      const sprite=new Image();
      sprite.src=mini ? '/assets/sprites/keeper-feeding-mini.webp' : '/assets/sprites/keeper-feeding-v2.webp';
      loading=sprite.decode().then(()=>{
        ready=true;film.style.backgroundImage=`url("${sprite.src}")`;film.hidden=false;
        viewport.querySelector('img').setAttribute('aria-hidden','true');
        scene.dataset.loaded='true';loadStatus.hidden=true;paint();schedule();return true;
      }).catch(()=>{
        wantsPlay=false;scene.dataset.loaded='error';loadStatus.textContent='动画暂未加载，点击播放重试。';
        paint();schedule();return false;
      }).finally(()=>{loading=null;});
      return loading;
    }
    controls.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button===playButton)wantsPlay=!wantsPlay;
      if(button.hasAttribute('data-studio-replay')){frame=0;wantsPlay=true;}
      if(button.hasAttribute('data-studio-frame')){frame=Number(button.dataset.studioFrame);wantsPlay=false;}
      paint();schedule();load();
    });
    new IntersectionObserver(entries=>{
      visible=entries[0].isIntersecting;
      // Reduced-motion visitors need only the poster until they explicitly play.
      if(visible&&!motion.matches)load();
      schedule();
    },{threshold:.1}).observe(viewport);
    document.addEventListener('visibilitychange',schedule);
    motion.addEventListener('change',()=>{if(motion.matches)wantsPlay=false;paint();schedule();});
    new MutationObserver(schedule).observe(home,{attributes:true,attributeFilter:['hidden']});
    const dialogs=new MutationObserver(schedule);
    document.querySelectorAll('dialog').forEach(d=>dialogs.observe(d,{attributes:true,attributeFilter:['open']}));
    paint();schedule();
  }
  createPlayer(document.querySelector('#heroStudio'),true);
  createPlayer(document.querySelector('#studioScene'),false);
})();
