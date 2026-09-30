/* Original, code-native room illustration. No business data or telemetry. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 901px) and (hover: hover)');
  const room = () => {
    const drawers = (x, y, cols, rows, width, height) => Array.from({length: rows}, (_, row) =>
      Array.from({length: cols}, (_, col) => {
        const left = x + col * width, top = y + row * height;
        return `<g><rect x="${left}" y="${top}" width="${width-5}" height="${height-6}" rx="2" fill="#223c32" stroke="#839c7b"/>
          <path d="M${left+6} ${top+height-14}h${width-18}" stroke="#506b50"/>
          <rect x="${left+8}" y="${top+5}" width="15" height="4" rx="1" fill="#c9d6aa" stroke="none"/>
          <path d="M${left+width-26} ${top+8}h12" stroke="#9eb38a"/></g>`;
      }).join('')).join('');
    return `<svg viewBox="0 0 640 440" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g stroke-linecap="round" stroke-linejoin="round">
        <path d="M50 337 267 421 608 310 382 243Z" fill="#b7ad7910" stroke="#9dab7940"/>
        <path d="M50 337V109L289 40 608 105v205M289 40v217L50 337m239-80 319 53" stroke="#819d724d"/>
        <g stroke="#859e7550"><path d="m103 357 288-94m-230 116 289-95m-228 118 294-97m-219 105 270-88"/></g>
        <path d="M350 79 532 111v130l-182-27Z" fill="#b6d8a60b" stroke="#91ad87"/>
        <path d="m358 89 166 29v112l-166-24Zm82 15v115m-80-80 164 27" stroke="#78996e"/>
        <path class="room-daylight" d="m358 152 165 28v50l-165-24ZM353 220l176 24 54 68-181-32Z" fill="#d2e6a40a"/>
        <path d="m347 215 188 29v9l-188-29Z" fill="#536b4a" stroke="#9cb18b"/>
        <g transform="translate(117 116) skewY(-8)">
          <path d="M-19 0 0-13h143v250l-19 12H-19Z" fill="#1a3027" stroke="#819876"/>
          <path d="M-19 0h143v249M0-13v237l124 25" stroke="#77946e"/>
          ${drawers(5, 7, 2, 6, 59, 36)}
          <path d="M0 0h124M0 223h124M0 230h124" stroke="#c1cba6" stroke-width="3"/>
          <circle cx="7" cy="240" r="6" fill="#172c24" stroke="#b2c29c"/><circle cx="117" cy="259" r="6" fill="#172c24" stroke="#b2c29c"/>
          <rect x="28" y="-34" width="48" height="20" rx="2" fill="#344c39" stroke="#a2b48a"/>
          <path d="M35-29h22v9H35z" stroke="#829c6c"/><circle class="room-light" cx="66" cy="-24" r="2" fill="#d4e7a8" stroke="none"/>
        </g>
        <g transform="translate(334 271) skewY(8)">
          <path d="M-12-10 0-18h210v111l-15 13H-12Z" fill="#1b3027" stroke="#819876"/>
          <path d="M-12-10h207v116" stroke="#abc09b" stroke-width="2"/>
          ${drawers(0, 0, 3, 3, 63, 29)}
          <path d="M0 91h195" stroke="#c1cba6" stroke-width="3"/>
          <circle cx="7" cy="107" r="6" fill="#172c24" stroke="#b2c29c"/><circle cx="189" cy="119" r="6" fill="#172c24" stroke="#b2c29c"/>
          <path d="M19-20v-24h52v24M16-44h58v-5H16zM23-40h45m-45 5h45m-45 5h45" stroke="#a7b78b"/>
          <path d="m108-25 21-10 35 5-19 11Z" fill="#b1bd8b" stroke="#c2cda4"/><path d="m130-30 21 4m-27 0 21 4" stroke="#3b553c"/>
        </g>
        <g transform="translate(285 335)">
          <ellipse cx="3" cy="37" rx="45" ry="9" fill="#18281e"/>
          <path d="M-21 28c-30-13-16-37 3-30 14 5 12 26-3 26-17 0-19-20-4-20 17 0 25 26 43 22l10-6" stroke="#c7d7a1" stroke-width="7"/>
          <path d="M20 19c7-11 20-7 24-10l5-5 4 3-1 9c-4 9-14 14-24 10Z" fill="#bed49c" stroke="#dbe7b6"/>
          <circle cx="39" cy="17" r="2.8" fill="#243d2e"/><path d="m28 22 12 1 7-5" stroke="#506c42"/>
          <path class="room-tongue" d="m51 15 10-3 4-4m-4 4 5 1" stroke="#d3b084" stroke-width="1.5"/>
          <path d="m-28 1 2 6m8-6-1 6m8 1-4 5m9 2-4 4m12 3-3 5" stroke="#667e50" stroke-width="2"/>
        </g>
        <g stroke="#adc28d" stroke-width="1"><path d="M89 89v12m-6-6h12M559 246v10m-5-5h10"/><circle cx="302" cy="132" r="2"/><circle cx="81" cy="298" r="1.5"/></g>
      </g>
    </svg>`;
  };
  document.querySelectorAll('[data-room-art]').forEach(el => {el.innerHTML = room();});
  // Animate only visible artwork; the login scene also stops after authentication.
  const scenes = [...document.querySelectorAll('[data-room-art], [data-pixel-snake]')];
  const visibility = new Map();
  function syncScenes() {
    scenes.forEach(el => {el.dataset.motion = visibility.get(el) && !document.hidden && !reduced.matches ? 'running' : 'paused';});
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {entries.forEach(e => visibility.set(e.target,e.isIntersecting));syncScenes();});
    scenes.forEach(el => observer.observe(el));
  }
  const story = document.querySelector('.room-story');
  let visibleStory = false, frame = 0;
  function updateStory() {
    frame = 0;
    if (!story || !visibleStory || document.hidden || reduced.matches || !desktop.matches) return;
    const box = story.getBoundingClientRect();
    const progress = Math.max(0,Math.min(1,-box.top / (box.height-innerHeight || 1)));
    story.style.setProperty('--room-scale',String(1 + progress * .055));
    story.style.setProperty('--room-caption-opacity',String(Math.max(0,1-progress*4)));
  }
  function scheduleStory() {if(!frame && visibleStory && !document.hidden && desktop.matches && !reduced.matches) frame=requestAnimationFrame(updateStory);}
  if (story && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => {visibleStory=entries[0].isIntersecting;scheduleStory();}).observe(story);
    addEventListener('scroll',scheduleStory,{passive:true});
    addEventListener('resize',scheduleStory,{passive:true});
  }
  function resetMotion() {syncScenes();story?.style.removeProperty('--room-scale');story?.style.removeProperty('--room-caption-opacity');scheduleStory();}
  reduced.addEventListener('change',resetMotion);
  desktop.addEventListener('change',resetMotion);
  document.addEventListener('visibilitychange',() => {syncScenes();scheduleStory();});
  // A one-time entrance never hides content while waiting for JavaScript.
  if ('IntersectionObserver' in window) {
    const entrance = new IntersectionObserver(entries => entries.forEach(e => {
      if(!e.isIntersecting)return;
      if(!reduced.matches)e.target.classList.add('field-arrive');
      entrance.unobserve(e.target);
    }),{threshold:.12});
    document.querySelectorAll('[data-field-reveal]').forEach(el=>entrance.observe(el));
  }
})();
