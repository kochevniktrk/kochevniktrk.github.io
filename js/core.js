// Чистая логика меню и корзины: без DOM, работает и в браузере, и в Node (тесты).

/** CSV по RFC 4180: кавычки, "" внутри кавычек, запятые и переносы строк в полях. */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function parsePrice(s) {
  const digits = String(s ?? '').replace(/[\s ₸тг.,]/gi, '');
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n > 0 ? n : null;
}

export function formatPrice(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸';
}

const COLS = {
  category: ['категория', 'category'],
  name: ['название', 'name'],
  desc: ['описание', 'description'],
  price: ['цена', 'price'],
  photo: ['фото', 'photo'],
  available: ['есть', 'available'],
  order: ['порядок', 'order'],
  badge: ['метка', 'badge'],
};
const HIDDEN = new Set(['нет', 'no', '0', 'false', '-', 'жоқ']);

/** Ссылка из таблицы → адрес картинки. Ссылки «Поделиться» Google Диска сами картинкой не являются. */
export function photoUrl(s) {
  const v = String(s ?? '').trim();
  if (!/drive\.google\.com/.test(v)) return v;
  const id = (v.match(/\/d\/([\w-]+)/) || v.match(/[?&]id=([\w-]+)/) || [])[1];
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : v;
}

function slug(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return 'd' + h.toString(36);
}

/** Строки таблицы → {categories:[{name, items:[{id,name,desc,price,photo,badge}]}]}. */
export function rowsToMenu(rows) {
  const [head = [], ...body] = rows || [];
  const idx = {};
  const norm = head.map(h => String(h).trim().toLowerCase());
  for (const [key, names] of Object.entries(COLS)) idx[key] = norm.findIndex(h => names.includes(h));
  const get = (r, key) => (idx[key] >= 0 ? String(r[idx[key]] ?? '').trim() : '');

  const cats = new Map();
  const seen = new Set();
  body.forEach((r, rowNo) => {
    const category = get(r, 'category');
    const name = get(r, 'name');
    const price = parsePrice(get(r, 'price'));
    if (!category || !name || price == null) return;
    if (HIDDEN.has(get(r, 'available').toLowerCase())) return;
    let id = slug(category + '|' + name);
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const order = Number(get(r, 'order'));
    if (!cats.has(category)) cats.set(category, []);
    cats.get(category).push({
      id, name, price,
      desc: get(r, 'desc'),
      photo: photoUrl(get(r, 'photo')),
      badge: get(r, 'badge'),
      _order: Number.isFinite(order) && get(r, 'order') !== '' ? order : 1e6 + rowNo,
    });
  });
  return {
    categories: [...cats].map(([name, items]) => ({
      name,
      items: items.sort((a, b) => a._order - b._order).map(({ _order, ...it }) => it),
    })),
  };
}

export function indexItems(menu) {
  const byId = {};
  for (const c of menu.categories) for (const it of c.items) byId[it.id] = it;
  return byId;
}

/** Корзина из localStorage: только целые 1..99, всё остальное выбрасывается. */
export function sanitizeCart(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const n = Math.min(99, Math.floor(v));
    if (n >= 1) out[k] = n;
  }
  return out;
}

export function cartLines(cart, itemsById) {
  return Object.entries(cart)
    .filter(([id, q]) => itemsById[id] && q > 0)
    .map(([id, qty]) => ({ item: itemsById[id], qty, sum: itemsById[id].price * qty }));
}

export function cartTotal(cart, itemsById) {
  return cartLines(cart, itemsById).reduce((s, l) => s + l.sum, 0);
}

export function cartCount(cart, itemsById) {
  return cartLines(cart, itemsById).reduce((s, l) => s + l.qty, 0);
}

export function buildOrderText(cart, itemsById, { mode, address, name, comment } = {}) {
  const lines = ['Здравствуйте! Заказ с сайта:'];
  for (const l of cartLines(cart, itemsById)) {
    lines.push(`• ${l.item.name} ×${l.qty} — ${formatPrice(l.sum)}`);
  }
  lines.push(`Итого: ${formatPrice(cartTotal(cart, itemsById))}`);
  lines.push(`Получение: ${mode === 'pickup' ? 'самовывоз' : 'доставка'}`);
  if (mode !== 'pickup' && address?.trim()) lines.push(`Адрес: ${address.trim()}`);
  if (name?.trim()) lines.push(`Имя: ${name.trim()}`);
  if (comment?.trim()) lines.push(`Комментарий: ${comment.trim()}`);
  return lines.join('\n');
}

export function waLink(phone, text) {
  return `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
