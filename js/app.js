import { CONFIG } from './config.js?v=20261111004802';
import { MENU_CSV } from './menu-data.js?v=20261111004802';
import { LAYERS } from './layers.js?v=20261111004802';
import { createExplode } from './explode.js?v=20261111004802';
import {
  parseCSV, rowsToMenu, indexItems, formatPrice, sanitizeCart,
  cartLines, cartTotal, cartCount, buildOrderText, waLink, freshUrl,
} from './core.js?v=20261111004802';

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } },
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NOIMG = '<div class="noimg"><svg viewBox="0 0 24 24"><path d="M3 11h18a9 9 0 0 1-18 0zm2-2a7 7 0 0 1 14 0zM2 13h20v1H2z" opacity=".9"/></svg></div>';

let menu = { categories: [] };
let items = {};
let cart = sanitizeCart(store.get('cart', {}));

/* ---------- шапка ---------- */
document.querySelectorAll('[data-cfg]').forEach(el => { el.textContent = CONFIG[el.dataset.cfg] ?? ''; });
$('#lnkCall').href = 'tel:' + CONFIG.phone;
$('#lnkWa').href = waLink(CONFIG.whatsapp, 'Здравствуйте!');
$('#lnkIg').href = CONFIG.instagram;

/* ---------- меню: таблица → кэш → вшитое ---------- */
function useMenu(m) {
  if (!m?.categories?.length) return false;
  menu = m;
  items = indexItems(m);
  render();
  return true;
}

async function loadMenu() {
  const cached = store.get('menuCache', null);
  useMenu(cached) || useMenu(rowsToMenu(parseCSV(MENU_CSV)));
  if (!CONFIG.sheetCsvUrl) return;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(freshUrl(CONFIG.sheetCsvUrl), { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error(res.status);
    const fresh = rowsToMenu(parseCSV(await res.text()));
    if (fresh.categories.length && JSON.stringify(fresh) !== JSON.stringify(menu)) {
      store.set('menuCache', fresh);
      useMenu(fresh);
    }
  } catch (e) {
    console.warn('Таблица недоступна, показываю сохранённое меню', e);
  }
}

/* ---------- отрисовка ---------- */
function img(src, alt) {
  return src
    ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.outerHTML=${esc(JSON.stringify(NOIMG))}">`
    : NOIMG;
}

function qtyHTML(id) {
  const q = cart[id] || 0;
  return q
    ? `<div class="qty"><button data-dec="${id}" aria-label="Убрать одну">−</button><span>${q}</span><button data-inc="${id}" aria-label="Добавить ещё">+</button></div>`
    : `<button class="add" data-inc="${id}" aria-label="В корзину">+</button>`;
}

function render() {
  $('#tabs').innerHTML = menu.categories.map((c, i) =>
    `<button class="tab${i ? '' : ' is-active'}" data-cat="${i}">${esc(c.name)}</button>`).join('');
  $('#menu').innerHTML = menu.categories.map((c, i) => `
    <section class="cat" id="cat-${i}" data-cat="${i}">
      <h2 class="cat__title">${esc(c.name)}</h2>
      <div class="grid">${c.items.map(it => `
        <article class="card" data-open="${it.id}">
          <div class="card__img">${img(it.photo, it.name)}${it.badge ? `<span class="badge">${esc(it.badge)}</span>` : ''}</div>
          <div class="card__body">
            <h3 class="card__name">${esc(it.name)}</h3>
            ${it.desc ? `<p class="card__desc">${esc(it.desc)}</p>` : ''}
            <div class="card__row"><span class="price">${formatPrice(it.price)}</span><span class="slot" data-slot="${it.id}">${qtyHTML(it.id)}</span></div>
          </div>
        </article>`).join('')}
      </div>
    </section>`).join('');
  watchCategories();
  renderHero();
  renderCart();
}

function refreshQty(id) {
  document.querySelectorAll(`[data-slot="${id}"]`).forEach(el => { el.innerHTML = qtyHTML(id); });
  if ($('#dish').dataset.id === id) $('#dishQty').innerHTML = qtyHTML(id).replace('class="add"', 'class="add add--big"');
  if (heroItem?.id === id) $('#heroAdd').textContent = cart[id] ? `В корзине: ${cart[id]} · добавить ещё` : `В корзину · ${formatPrice(heroItem.price)}`;
}

/* ---------- вкладки ---------- */
let catObserver;
function watchCategories() {
  catObserver?.disconnect();
  const tabs = [...document.querySelectorAll('.tab')];
  catObserver = new IntersectionObserver(entries => {
    const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!vis) return;
    const i = +vis.target.dataset.cat;
    if (tabs[i]?.classList.contains('is-active')) return;
    tabs.forEach((t, j) => t.classList.toggle('is-active', i === j));
    // Только горизонтальная прокрутка полосы вкладок: scrollIntoView обрывал инерционную прокрутку страницы на телефоне.
    const bar = $('#tabs'), t = tabs[i];
    if (t) bar.scrollTo({ left: t.offsetLeft - (bar.clientWidth - t.offsetWidth) / 2, behavior: 'smooth' });
  }, { rootMargin: '-70px 0px -65% 0px' });
  document.querySelectorAll('.cat').forEach(s => catObserver.observe(s));
}
$('#tabs').addEventListener('click', e => {
  const t = e.target.closest('[data-cat]');
  if (t) document.getElementById('cat-' + t.dataset.cat)?.scrollIntoView({ behavior: 'smooth' });
});

/* ---------- хит ---------- */
let heroItem = null, heroIdx = 0, explode = null, heroList = [];

function renderHero() {
  // только те блюда, что есть в меню (и не скрыты) и для которых есть слои
  heroList = (CONFIG.heroDishes || [])
    .map(h => ({ ...h, item: Object.values(items).find(it => it.name === h.dish) }))
    .filter(h => h.item && LAYERS[h.layers]);
  if (!heroList.length) { $('#hero').hidden = true; return; }
  $('#hero').hidden = false;
  explode ??= createExplode($('#stage'), setHint);
  $('#heroSwitch').hidden = heroList.length < 2;
  $('#heroSwitch').innerHTML = heroList.map((h, i) =>
    `<button role="tab" data-hero="${i}" aria-selected="${i === heroIdx}">${esc(h.label)}</button>`).join('');
  selectHero(Math.min(heroIdx, heroList.length - 1));
}

async function selectHero(i) {
  const h = heroList[i];
  heroIdx = i;
  heroItem = h.item;
  document.querySelectorAll('[data-hero]').forEach(b => b.setAttribute('aria-selected', +b.dataset.hero === i));
  $('#heroName').textContent = heroItem.name;
  $('#heroDesc').textContent = heroItem.desc;
  $('#stage').setAttribute('aria-label', `Показать «${heroItem.name}» по слоям`);
  refreshQty(heroItem.id);
  if (!await explode.show(LAYERS[h.layers]) && heroList.length === 1) $('#hero').hidden = true;
}
$('#heroSwitch').addEventListener('click', e => {
  const b = e.target.closest('[data-hero]');
  if (b && +b.dataset.hero !== heroIdx) selectHero(+b.dataset.hero);
});
$('#heroAdd').addEventListener('click', () => heroItem && change(heroItem.id, 1));

// кнопка под блюдом: «показать, из чего» / «собрать»; мигает, пока гость ни разу не нажал
let heroTried = false;
function setHint(open) {
  const b = $('#heroHint');
  if (open) heroTried = true;
  b.textContent = open ? 'Собрать обратно' : 'Нажмите — покажем, из чего он';
  b.classList.toggle('is-hint', !heroTried);
}
$('#heroHint').addEventListener('click', () => explode?.toggle());

/* ---------- корзина ---------- */
function change(id, d) {
  if (!items[id]) return;
  const q = Math.max(0, Math.min(99, (cart[id] || 0) + d));
  if (q) cart[id] = q; else delete cart[id];
  store.set('cart', cart);
  refreshQty(id);
  renderCart();
  if (d > 0) {
    toast(`${items[id].name} — в корзине`);
    const bar = $('#cartbar');
    bar.classList.remove('bump'); void bar.offsetWidth; bar.classList.add('bump');
    navigator.vibrate?.(10);
  }
}

function renderCart() {
  const n = cartCount(cart, items);
  const sum = formatPrice(cartTotal(cart, items));
  $('#cartbar').hidden = n === 0;
  $('#cartCount').textContent = n;
  $('#cartSum').textContent = sum;
  $('#total').textContent = sum;
  $('#lines').innerHTML = cartLines(cart, items).map(l => `
    <li class="line">
      ${l.item.photo ? `<img src="${esc(l.item.photo)}" alt="" onerror="this.outerHTML=${esc(JSON.stringify(NOIMG))}">` : NOIMG}
      <div class="line__info"><div class="line__name">${esc(l.item.name)}</div><div class="line__sum">${formatPrice(l.sum)}</div></div>
      <span data-slot="${l.item.id}">${qtyHTML(l.item.id)}</span>
    </li>`).join('');
  if (n === 0 && !$('#sheet').hidden) closeAll();
}

document.addEventListener('click', e => {
  const inc = e.target.closest('[data-inc]');
  const dec = e.target.closest('[data-dec]');
  if (inc) { e.stopPropagation(); change(inc.dataset.inc, 1); return; }
  if (dec) { e.stopPropagation(); change(dec.dataset.dec, -1); return; }
  const card = e.target.closest('[data-open]');
  if (card) openDish(card.dataset.open);
  if (e.target.closest('[data-close]')) closeAll();
});
$('#cartbar').addEventListener('click', () => open('#sheet'));

/* ---------- шторки ---------- */
let lastFocus = null;
function open(sel) {
  lastFocus = document.activeElement;
  $(sel).hidden = false;
  document.body.style.overflow = 'hidden';
  history.pushState({ sheet: sel }, '');
  $(sel).querySelector('[data-close].iconbtn')?.focus({ preventScroll: true });
}
function closeAll(fromHistory) {
  const wasOpen = !$('#sheet').hidden || !$('#dish').hidden;
  $('#sheet').hidden = true;
  $('#dish').hidden = true;
  $('#dish').dataset.id = '';
  document.body.style.overflow = '';
  lastFocus?.focus?.({ preventScroll: true });
  if (wasOpen && !fromHistory && history.state?.sheet) history.back();
}
addEventListener('popstate', () => closeAll(true));        // «назад» на телефоне закрывает шторку
addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

function openDish(id) {
  const it = items[id];
  if (!it) return;
  $('#dish').dataset.id = id;
  const im = $('#dishImg');
  im.parentElement.querySelector('.noimg')?.remove();
  im.hidden = !it.photo;
  im.src = it.photo || '';
  im.alt = it.name;
  im.onerror = () => { im.hidden = true; im.insertAdjacentHTML('afterend', NOIMG); };
  if (!it.photo) im.insertAdjacentHTML('afterend', NOIMG);
  $('#dishName').textContent = it.name;
  $('#dishDesc').textContent = it.desc;
  $('#dishPrice').textContent = formatPrice(it.price);
  refreshQty(id);
  open('#dish');
}

/* ---------- форма заказа ---------- */
const form = $('#orderForm');
const saved = store.get('form', {});
for (const k of ['address', 'name']) if (typeof saved[k] === 'string') form.elements[k].value = saved[k];
if (saved.mode === 'pickup') form.elements.mode.value = 'pickup';
const syncMode = () => { $('#addrField').hidden = form.elements.mode.value === 'pickup'; };
syncMode();
form.addEventListener('change', syncMode);
form.addEventListener('submit', e => {
  e.preventDefault();
  const data = {
    mode: form.elements.mode.value,
    address: form.elements.address.value,
    name: form.elements.name.value,
    comment: form.elements.comment.value,
  };
  if (data.mode === 'delivery' && !data.address.trim()) {
    form.elements.address.focus();
    toast('Укажите адрес доставки');
    return;
  }
  store.set('form', { mode: data.mode, address: data.address, name: data.name });
  location.href = waLink(CONFIG.whatsapp, buildOrderText(cart, items, data));
});

/* ---------- всплывашка ---------- */
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

loadMenu();
