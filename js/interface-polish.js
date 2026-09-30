/* Small interactions stay independent of authentication and record persistence. */
(() => {
  const toggle=document.getElementById('gatePasswordToggle'),password=document.getElementById('gatePassword');
  toggle?.addEventListener('click',()=>{
    const visible=password.type==='password';password.type=visible?'text':'password';
    toggle.textContent=visible?'隐藏':'显示';toggle.setAttribute('aria-label',visible?'隐藏密码':'显示密码');toggle.setAttribute('aria-pressed',String(visible));
  });
  const messages=document.getElementById('aiChatMessages');
  const latest=document.createElement('button');latest.type='button';latest.id='aiChatLatest';latest.className='ws-action aiChatLatest';latest.textContent='查看最新消息 ↓';latest.hidden=true;messages?.after(latest);
  latest.addEventListener('click',()=>{messages.scrollTop=messages.scrollHeight;latest.hidden=true;});
  messages?.addEventListener('scroll',()=>{if(messages.scrollHeight-messages.clientHeight-messages.scrollTop<48)latest.hidden=true;},{passive:true});
  // Restore masking whenever the private workspace is closed.
  addEventListener('suoha:logout',()=>{password.type='password';toggle.textContent='显示';toggle.setAttribute('aria-label','显示密码');toggle.setAttribute('aria-pressed','false');});
})();
