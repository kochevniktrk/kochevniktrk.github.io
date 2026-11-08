// Разлёт блюда на слои. Телефон: по прокрутке (блок «прилипает» и блюдо разъезжается).
// Компьютер: при наведении. Нажатие на блюдо — собрать/разобрать в любой момент.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const loadImg = src => new Promise(res => {
  const im = new Image();
  im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(true));
  im.onerror = () => res(false);
  im.src = src;
});

/**
 * @param {HTMLElement} section  секция .hero (высокая, со sticky-сценой внутри)
 * @param {HTMLElement} stage    .stage
 * @returns {{show(layers): Promise<boolean>}}  layers: [{src, w, y0, y1, x1?, r1?, z, bit?}] — в cqw/cqh
 */
export function createExplode(section, stage) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (hover || reduce) section.classList.add('hero--static');

  let p = 0, target = 0, manual = null, manualScrollY = 0, raf = 0, visible = true;

  const scrollTarget = () => {
    if (hover || reduce) return 0;
    const r = section.getBoundingClientRect();
    const range = r.height - innerHeight;
    if (range <= 0) return 0;
    return clamp((clamp(-r.top / range) - 0.08) / 0.5);   // 8%…58% прокрутки — разлёт, дальше держим
  };
  const apply = () => {
    const e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // easeInOutCubic
    stage.style.setProperty('--p', e.toFixed(4));
    stage.classList.toggle('is-open', p > .92);
  };
  const tick = () => {
    const goal = manual ?? target;
    p += (goal - p) * (reduce ? 1 : 0.2);
    if (Math.abs(goal - p) < 0.002) p = goal;
    apply();
    raf = p === goal ? 0 : requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  // пока блок за экраном — не трогаем его вообще
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { target = scrollTarget(); kick(); } })
    .observe(section);
  addEventListener('scroll', () => {
    if (!visible) return;
    if (manual !== null && Math.abs(scrollY - manualScrollY) > 80) manual = null;
    target = scrollTarget();
    kick();
  }, { passive: true });
  addEventListener('resize', () => { target = scrollTarget(); kick(); });

  if (hover) {
    stage.addEventListener('pointerenter', () => { manual = null; target = 1; kick(); });
    stage.addEventListener('pointerleave', () => { manual = null; target = 0; kick(); });
  }
  const toggle = () => { manual = (manual ?? target) > .5 ? 0 : 1; manualScrollY = scrollY; kick(); };
  stage.addEventListener('click', toggle);
  stage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

  let token = 0;
  return {
    async show(layers) {
      const my = ++token;
      const ok = await Promise.all(layers.map(l => loadImg(l.src)));
      if (my !== token) return true;                                   // уже переключили на другое блюдо
      if (ok.filter(Boolean).length < layers.filter(l => !l.bit).length) return false;
      stage.classList.add('is-swapping');
      if (stage.children.length) await new Promise(r => setTimeout(r, 160));
      stage.innerHTML = '<div class="stage__shadow"></div>' + layers.map((l, i) => ok[i] ? `
        <div class="layer${l.bit ? ' layer--bit' : ''}" style="--w:${l.w}cqw;--y0:${l.y0}cqh;--y1:${l.y1}cqh;--x1:${l.x1 || 0}cqw;--r1:${l.r1 || 0}deg;--z:${l.z};--d:${(i * 0.37) % 1.6}s;--wob:${i % 2 ? -1.5 : 1.5}deg">
          <img src="${l.src}" alt="" draggable="false">
        </div>` : '').join('');
      p = 0; apply();                       // новое блюдо появляется собранным и разлетается заново
      requestAnimationFrame(() => stage.classList.remove('is-swapping'));
      target = scrollTarget();
      kick();
      return true;
    },
  };
}
