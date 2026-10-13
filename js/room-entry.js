/* Room resources are private-workspace-only and loaded on first entry. */
(() => {
  let pending;
  const host = document.getElementById('workspaceRoom');
  const files = ['room-model', 'room-data', 'room-labels', 'room-scene', 'room-extras', 'room-workspace'];
  function script(name) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script'); el.src = `/js/${name}.js`;
      el.onload = resolve; el.onerror = () => { el.remove(); reject(Error('爬房资源加载失败，请重试。')); };
      document.body.append(el);
    });
  }
  async function render() {
    if (state.page !== 'room' || !currentUser) return;
    if (!canWrite()) { host.textContent = '仅授权编辑成员可查看与管理爬房。'; return; }
    if (window.SuohaRoomWorkspace) return window.SuohaRoomWorkspace.render();
    if (pending) return pending;
    host.innerHTML = '<div class="ws-panel" role="status">正在准备爬房工作台…</div>';
    pending = (async () => {
      if (!document.querySelector('[data-room-style]')) {
        const el = document.createElement('link'); el.rel = 'stylesheet'; el.href = '/assets/room-workspace.css'; el.dataset.roomStyle = ''; document.head.append(el);
        const forms = document.createElement('link'); forms.rel = 'stylesheet'; forms.href = '/assets/room-controls.css'; document.head.append(forms);
      }
      const globals = ['SuohaRoomModel', 'SuohaRoomData', 'SuohaRoomLabels', 'SuohaRoomScene', 'SuohaRoomExtras', 'SuohaRoomWorkspace'];
      for (let i = 0; i < files.length; i++) if (!window[globals[i]]) await script(files[i]);
      if (state.page === 'room' && currentUser) window.SuohaRoomWorkspace.render();
    })().catch(error => {
      host.innerHTML = '<div class="ws-alert" role="alert"></div><button class="ws-action" data-room-retry>重新加载</button>';
      host.querySelector('[role=alert]').textContent = error.message;
      host.querySelector('button').onclick = render;
    }).finally(() => { pending = null; });
    return pending;
  }
  window.SuohaRoomEntry = {render};
  addEventListener('suoha:page', render);
  addEventListener('suoha:data', render);
  render();
})();
