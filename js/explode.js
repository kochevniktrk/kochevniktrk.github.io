// Разлёт блюда на слои по нажатию (на компьютере ещё и при наведении).
// Прокрутка страницы на блюдо не влияет: блок обычной высоты, ничего не «прилипает».

const loadImg = src => new Promise(res => {
  const im = new Image();
  im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(true));
  im.onerror = () => res(false);
  im.src = src;
});
const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic

/**
 * @param {HTMLElement} stage  .stage
 * @param {(open:boolean)=>void} [onChange]  вызывается, когда блюдо собирается/разлетается
 * @returns {{show(layers): Promise<boolean>, toggle(): void}}  layers: [{src, w, y0, y1, x1?, r1?, z, bit?, whole?}]
 */
export function createExplode(stage, onChange = () => {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const DUR = reduce ? 1 : 750;
  let p = 0, from = 0, to = 0, t0 = 0, raf = 0;

  const apply = () => {
    stage.style.setProperty('--p', ease(p).toFixed(4));
    stage.classList.toggle('is-open', p > .92);
  };
  const tick = now => {
    const k = Math.min(1, (now - t0) / DUR);
    p = from + (to - from) * k;
    apply();
    raf = k < 1 ? requestAnimationFrame(tick) : 0;
  };
  const go = goal => {
    if (goal === to && (raf || p === goal)) return;
    from = p; to = goal; t0 = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    onChange(goal === 1);
  };
  const toggle = () => go(to > .5 ? 0 : 1);

  stage.addEventListener('click', toggle);
  stage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  if (hover) {
    stage.addEventListener('pointerenter', () => go(1));
    stage.addEventListener('pointerleave', () => go(0));
  }

  let token = 0;
  return {
    toggle,
    async show(layers) {
      const my = ++token;
      const ok = await Promise.all(layers.map(l => loadImg(l.src)));
      if (my !== token) return true;                                   // уже переключили на другое блюдо
      if (ok.filter(Boolean).length < layers.filter(l => !l.bit).length) return false;
      stage.classList.add('is-swapping');
      if (stage.children.length) await new Promise(r => setTimeout(r, 160));
      stage.innerHTML = '<div class="stage__shadow"></div>' + layers.map((l, i) => ok[i] ? `
        <div class="layer${l.bit ? ' layer--bit' : ''}${l.whole ? ' layer--whole' : ''}" style="--w:${l.w}cqw;--y0:${l.y0}cqh;--y1:${l.y1}cqh;--x1:${l.x1 || 0}cqw;--r1:${l.r1 || 0}deg;--z:${l.z};--d:${(i * 0.37) % 1.6}s;--wob:${i % 2 ? -1.5 : 1.5}deg">
          <img src="${l.src}" alt="" draggable="false">
        </div>` : '').join('');
      cancelAnimationFrame(raf); raf = 0;
      p = from = to = 0; apply();          // новое блюдо появляется собранным
      onChange(false);
      requestAnimationFrame(() => stage.classList.remove('is-swapping'));
      return true;
    },
  };
}
