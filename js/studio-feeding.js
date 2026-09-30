/* Decorative pixel scenes loop while visible, pausing offscreen and behind dialogs. */
(() => {
  'use strict';
  const home = document.querySelector('#homeView');
  if (!home) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-decoration]').forEach(scene => {
    const feeding = scene.dataset.decoration === 'feeding';
    const poster = scene.querySelector('img');
    const durations = feeding ? [220,300,380,320,800,200,200,260,320,850,220,220] : [650,650,650,650];
    let frame = 0, visible = false, ready = false, loading = false, failed = false, timer;
    const film = feeding ? document.createElement('div') : poster;
    if (feeding) {
      film.className = 'studio-film'; film.hidden = true;
      scene.querySelector('.studio-viewport').append(film);
    }
    function paint() {
      if (feeding) film.style.backgroundPosition = `${frame % 4 / 3 * 100}% ${Math.floor(frame / 4) * 50}%`;
      else { film.style.left = `${frame % 2 * -100}%`; film.style.top = `${Math.floor(frame / 2) * -100}%`; }
      scene.dataset.frame = String(frame);
    }
    function sync() {
      clearTimeout(timer);
      if (reduced.matches) { if (!feeding) frame = 3; paint(); }
      const playing = ready && !failed && visible && !reduced.matches && !document.hidden && !home.hidden && !document.querySelector('dialog[open]');
      scene.dataset.playing = String(playing);
      if (playing) timer = setTimeout(() => {
        frame = (frame + 1) % durations.length;
        paint(); sync();
      }, durations[frame]);
    }
    async function load() {
      if (loading || ready || failed) return;
      loading = true;
      try {
        if (feeding) {
          const sprite = new Image(); sprite.src = scene.dataset.sprite || '/assets/sprites/keeper-feeding-mini.webp';
          await sprite.decode(); film.style.backgroundImage = `url("${sprite.src}")`; film.hidden = false;
        } else await poster.decode();
        ready = true; scene.dataset.loaded = 'true'; paint();
      } catch {
        failed = true; scene.dataset.loaded = 'error';
        if (!feeding && !poster.naturalWidth) scene.hidden = true;
      } finally { loading = false; sync(); }
    }
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) poster.loading = 'eager';
      if (visible && !reduced.matches && !home.hidden) load();
      sync();
    }, {threshold:.3}).observe(scene);
    document.addEventListener('visibilitychange', sync);
    function resume() { if (visible && !reduced.matches && !home.hidden) load(); sync(); }
    reduced.addEventListener('change', resume);
    new MutationObserver(resume).observe(home, {attributes:true, attributeFilter:['hidden']});
    const dialogs = new MutationObserver(sync);
    document.querySelectorAll('dialog').forEach(dialog => dialogs.observe(dialog, {attributes:true, attributeFilter:['open']}));
    poster.addEventListener('error', () => { if (!ready) scene.hidden = true; });
    paint(); sync();
  });
})();
