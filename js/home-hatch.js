/* The home teaser hatches once; explicit greetings replay only the final poses. */
(() => {
  'use strict';
  const teaser=document.querySelector('[data-hatch-greet]');
  if(!teaser)return;
  const section=teaser.closest('.pixel-invitation'), img=teaser.querySelector('img');
  const button=section.querySelector('[data-hatch-play]'), status=section.querySelector('.hatch-status');
  const home=document.querySelector('#homeView'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let visible=false, ready=false, loading=null, started=reduced.matches;
  let sequence=[0,1,2,3], index=reduced.matches?3:0, frame=reduced.matches?3:0, wantsPlay=false, timer=null;
  function paint(){
    img.style.left=`${frame%2*-100}%`;img.style.top=`${Math.floor(frame/2)*-100}%`;
    section.dataset.hatchFrame=String(frame);
    button.textContent=wantsPlay?'暂停破壳预告':(index>=sequence.length-1?'重播破壳预告':'播放破壳预告');
    teaser.setAttribute('aria-label',frame<2?'看看小蛇破壳':'让小蛇吐信打招呼');
  }
  function schedule(){
    clearTimeout(timer);
    const playing=ready&&wantsPlay&&visible&&!document.hidden&&!home.hidden&&!document.querySelector('dialog[open]');
    section.dataset.hatchPlaying=String(playing);
    if(!playing)return;
    timer=setTimeout(()=>{
      if(index>=sequence.length-1){wantsPlay=false;frame=3;}
      else frame=sequence[++index];
      paint();schedule();
    },sequence.length===4&&sequence[0]===0?850:300);
  }
  function load(){
    if(ready)return Promise.resolve(true);
    if(loading)return loading;
    loading=img.decode().then(()=>{ready=true;status.hidden=true;schedule();return true;}).catch(()=>{
      wantsPlay=false;status.hidden=false;status.textContent='预告暂未加载，点击播放重试。';paint();schedule();return false;
    }).finally(()=>{loading=null;});
    return loading;
  }
  function start(greet=false){
    started=true;sequence=greet?[2,3,2,3]:[0,1,2,3];index=0;frame=sequence[0];wantsPlay=true;
    if(img.complete&&!img.naturalWidth)img.src=img.getAttribute('src');
    paint();schedule();load();
  }
  teaser.addEventListener('click',()=>start(frame>=2));
  button.addEventListener('click',()=>{
    if(wantsPlay){wantsPlay=false;paint();schedule();}
    else if(index>=sequence.length-1||!started||!ready)start();
    else {wantsPlay=true;paint();schedule();}
  });
  new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;
    if(visible&&!started&&!reduced.matches)start();
    schedule();
  },{threshold:.4}).observe(teaser);
  document.addEventListener('visibilitychange',schedule);
  reduced.addEventListener('change',()=>{if(reduced.matches){wantsPlay=false;started=true;frame=3;index=sequence.length-1;}paint();schedule();});
  new MutationObserver(schedule).observe(home,{attributes:true,attributeFilter:['hidden']});
  const dialogs=new MutationObserver(schedule);
  document.querySelectorAll('dialog').forEach(d=>dialogs.observe(d,{attributes:true,attributeFilter:['open']}));
  paint();schedule();
})();
