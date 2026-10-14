/* Compact profile beside the workspace, with an explicit accessible close action. */
(() => {
  const panel=document.getElementById('drawer'),main=document.querySelector('.main'),content=main?.querySelector('.content');
  if(!panel||!main)return;
  const close=document.getElementById('drawerClose');
  const heading=document.createElement('div');heading.className='profile-panel-head';heading.innerHTML='<strong>简略档案</strong>';
  close.type='button';close.textContent='关闭 ×';close.setAttribute('aria-label','关闭简略档案');heading.append(close);panel.prepend(heading);
  panel.setAttribute('role','complementary');panel.setAttribute('aria-label','简略档案');main.insertBefore(panel,content||null);
  let origin=null,wasOpen=false;
  const sync=()=>{const open=panel.classList.contains('open');main.classList.toggle('has-profile',open);panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));if(open&&!wasOpen){origin=document.activeElement;close.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)panel.scrollIntoView({block:'start',behavior:'instant'});}wasOpen=open;};
  const shut=()=>{panel.classList.remove('open');sync();if(origin?.isConnected&&!panel.contains(origin))origin.focus({preventScroll:true});};
  close.onclick=shut;
  new MutationObserver(sync).observe(panel,{attributes:true,attributeFilter:['class']});sync();
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.classList.contains('open')&&!document.querySelector('.modalBackdrop.open,dialog[open]'))shut();});
  addEventListener('hashchange',shut);addEventListener('suoha:logout',shut);
  document.addEventListener('click',e=>{if(e.target.closest('[data-page]'))shut();});
})();
