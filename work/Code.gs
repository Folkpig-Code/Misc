/**
 * Commande groupée Pokémon Japon : pilot web app (server side).
 *
 * - Buyers only ever see this web app. They never get access to the spreadsheet.
 * - Orders are written to their own tab ("Commandes WebApp"). The original
 *   order grid and its formulas are never modified.
 * - The supplier price sheet is never referenced here.
 */

const CONFIG = {
  // Working copy of "Commandes groupées Pokemon Japonais"
  SPREADSHEET_ID: '1ddnKYMn5L2Us58MPkhPPlVgo7ddRA9MXjaJMBxVbu40',
  ORDERS_SHEET: 'Commandes WebApp',

  TARGET_BOXES: 20,          // trigger: order is confirmed when 20 booster boxes are reached
  CURRENCY: 'CHF',
  MAX_QTY_PER_LINE: 20,
  MAX_LINES_PER_ORDER: 13,   // abuse cap: rows written per submission
  MIN_SECONDS_ON_PAGE: 3,    // abuse cap: faster than this is a bot
  MAX_ORDERS_PER_CONTACT_PER_HOUR: 5,
  MAX_ORDERS_PER_HOUR: 100,  // global brake against flooding the sheet
  CACHE_SECONDS: 30,

  // Visibility: show the per-product breakdown to buyers? (false = total only)
  SHOW_PRODUCT_BREAKDOWN: false,

  // Fill in once the WhatsApp group exists, e.g. 'https://chat.whatsapp.com/...'
  WHATSAPP_URL: '',

  PAYMENT_NOTE:
    'Paiement par virement bancaire. Les coordonnées bancaires vous seront envoyées après confirmation de votre commande.'
};

/**
 * Products offered to buyers. Prices are CHF, per display box.
 * active: false means the product is hidden from buyers (e.g. price not yet confirmed).
 * tracked: true means it counts toward the 20-box trigger.
 */
const PRODUCTS = [
  { id: 'P01', name: '30th Anniversary',            price: 167,  tracked: true, active: true },
  { id: 'P02', name: '30th Anniversary no shrink',  price: 165,  tracked: true, active: true },
  { id: 'P03', name: 'Storm Emeralda M6',           price: 79,   tracked: true, active: true },
  { id: 'P04', name: 'Storm Emeralda M6 No shrink', price: 74,   tracked: true, active: true },
  { id: 'P05', name: 'Abyss Eye M5',                price: 76,   tracked: true, active: true },
  { id: 'P06', name: 'Abyss Eye M5 no shrink',      price: 67,   tracked: true, active: true },
  { id: 'P07', name: 'Ninja Spinner',               price: 78,   tracked: true, active: true },
  { id: 'P08', name: 'Ninja Spinner no shrink',     price: 72,   tracked: true, active: true },
  { id: 'P09', name: 'Nihil Zero M3',               price: null, tracked: true, active: false },
  { id: 'P10', name: 'Nihil Zero no shrink M3',     price: null, tracked: true, active: false },
  { id: 'P11', name: 'Mega Dream M2a',              price: null, tracked: true, active: false },
  { id: 'P12', name: 'Mega Dream no shrink M2a',    price: null, tracked: true, active: false },
  { id: 'P13', name: 'Inferno X M2',                price: null, tracked: true, active: false }
];

const CACHE_KEY_TALLY = 'tally_v1';

// Zero width and line separator characters, built from code points to keep this file ASCII safe.
const INVISIBLE_CHARS = new RegExp('[' + [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0xfeff]
  .map(function (c) { return String.fromCharCode(c); }).join('') + ']', 'g');

const ORDER_HEADERS = [
  'Date', 'Référence', 'Nom', 'Contact', 'ID produit', 'Produit',
  'Quantité', 'Prix unitaire (CHF)', 'Total (CHF)', 'Boîtes suivies', 'Note'
];

/** Serves the page. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Commande groupée Pokémon Japon')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Data for the page: tracker, products, links. Buyer-safe only. */
function getAppData() {
  return buildAppData_(getTally_(false));
}

function buildAppData_(tally) {
  const boxes = tally.boxes;
  const products = PRODUCTS.filter(p => p.active).map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    ordered: CONFIG.SHOW_PRODUCT_BREAKDOWN ? (tally.perProduct[p.id] || 0) : null
  }));

  return {
    currency: CONFIG.CURRENCY,
    target: CONFIG.TARGET_BOXES,
    boxes: boxes,
    remaining: Math.max(0, CONFIG.TARGET_BOXES - boxes),
    reached: boxes >= CONFIG.TARGET_BOXES,
    maxPerLine: CONFIG.MAX_QTY_PER_LINE,
    showBreakdown: CONFIG.SHOW_PRODUCT_BREAKDOWN,
    products: products,
    whatsappUrl: CONFIG.WHATSAPP_URL,
    paymentNote: CONFIG.PAYMENT_NOTE
  };
}

/**
 * Receives an order from the page.
 * form = { name, contact, note, acceptedPayment, website (honeypot), elapsed (seconds on page),
 *          items: [{ id, qty }] }
 * Returns { ok: true, ... } or { ok: false, error } so that no raw server error reaches the buyer.
 */
function submitOrder(form) {
  try {
    return placeOrder_(form || {});
  } catch (e) {
    if (e && e.userMessage) return { ok: false, error: e.userMessage };
    console.error('submitOrder failed: ' + (e && e.message));
    return { ok: false, error: 'Une erreur est survenue. Réessayez dans un instant.' };
  }
}

function placeOrder_(form) {
  // Honeypot and minimum time on page: silently pretend success to bots.
  if (form.website || Number(form.elapsed) < CONFIG.MIN_SECONDS_ON_PAGE) {
    return fakeSuccess_();
  }

  const name = clean_(form.name, 80);
  const contact = clean_(form.contact, 120);
  const note = clean_(form.note, 300);

  if (name.length < 2) fail_('Merci de renseigner votre nom.');
  if (!validContact_(contact)) fail_('Merci de renseigner un e-mail ou un numéro WhatsApp valide.');
  if (form.acceptedPayment !== true) fail_('Merci de confirmer les modalités de paiement.');

  // One line per product: duplicates are merged, so the row cap cannot be dodged.
  const items = Array.isArray(form.items) ? form.items : [];
  if (items.length > CONFIG.MAX_LINES_PER_ORDER * 2) fail_('Commande invalide.');
  const qtyById = {};
  items.forEach(function (it) {
    if (!it || typeof it.id !== 'string') return;
    const q = Number(it.qty);
    if (!isFinite(q)) return;
    const qty = Math.floor(q);
    if (qty < 1) return;
    qtyById[it.id] = Math.min((qtyById[it.id] || 0) + qty, 100000);
  });

  const lines = [];
  Object.keys(qtyById).forEach(function (id) {
    const product = PRODUCTS.find(p => p.id === id && p.active);
    if (!product) fail_('Un produit n\'est plus disponible. Merci de rafraîchir la page.');
    if (qtyById[id] > CONFIG.MAX_QTY_PER_LINE) {
      fail_('Quantité maximale par produit : ' + CONFIG.MAX_QTY_PER_LINE + '. Pour plus, écrivez-nous.');
    }
    lines.push({ product: product, qty: qtyById[id] });
  });
  if (!lines.length) fail_('Veuillez choisir au moins une boîte.');
  if (lines.length > CONFIG.MAX_LINES_PER_ORDER) fail_('Commande invalide.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    fail_('Beaucoup de commandes en même temps. Réessayez dans un instant.');
  }
  try {
    checkRate_(contact);

    const sheet = getOrdersSheet_(true);
    const ref = 'PKM-' + Utilities.getUuid().slice(0, 6).toUpperCase();
    const now = new Date();
    let total = 0;

    const rows = lines.map(function (l) {
      const lineTotal = l.product.price * l.qty;
      total += lineTotal;
      return [
        now, ref, name, contact, l.product.id, l.product.name,
        l.qty, l.product.price, lineTotal,
        l.product.tracked ? l.qty : 0,
        note
      ];
    });

    const start = sheet.getLastRow() + 1;
    const range = sheet.getRange(start, 1, rows.length, ORDER_HEADERS.length);
    // Free text columns (Nom, Contact, Note) are plain text so nothing is ever evaluated as a formula.
    [3, 4, 11].forEach(function (c) { sheet.getRange(start, c, rows.length, 1).setNumberFormat('@'); });
    sheet.getRange(start, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    range.setValues(rows);
    SpreadsheetApp.flush();

    // Recount from the sheet inside the lock so the tracker is exact, then refresh the cache.
    const data = buildAppData_(getTally_(true));
    return {
      ok: true,
      ref: ref,
      total: total,
      currency: CONFIG.CURRENCY,
      boxes: data.boxes,
      remaining: data.remaining,
      reached: data.reached,
      whatsappUrl: CONFIG.WHATSAPP_URL,
      paymentNote: CONFIG.PAYMENT_NOTE
    };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- helpers ---------- */

function fail_(msg) {
  const e = new Error(msg);
  e.userMessage = msg;
  throw e;
}

function fakeSuccess_() {
  return {
    ok: true, ref: 'PKM-' + Utilities.getUuid().slice(0, 6).toUpperCase(), total: 0,
    currency: CONFIG.CURRENCY, boxes: 0, remaining: CONFIG.TARGET_BOXES, reached: false,
    whatsappUrl: CONFIG.WHATSAPP_URL, paymentNote: CONFIG.PAYMENT_NOTE
  };
}

/** Accepts an e-mail address or a phone number (8 to 15 digits). */
function validContact_(c) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) return true;
  const digits = c.replace(/^'/, '').replace(/[\s.\-()+\/]/g, '');
  return /^\d{8,15}$/.test(digits);
}

/** Per contact and global rate limit. Must be called inside the lock. */
function checkRate_(contact) {
  const cache = CacheService.getScriptCache();
  const hour = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  const digest = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, contact.toLowerCase()));
  const keys = ['rc_' + hour + '_' + digest.slice(0, 20), 'rg_' + hour];
  const limits = [CONFIG.MAX_ORDERS_PER_CONTACT_PER_HOUR, CONFIG.MAX_ORDERS_PER_HOUR];
  const counts = keys.map(function (k) { return Number(cache.get(k)) || 0; });
  if (counts[0] >= limits[0]) fail_('Vous avez passé plusieurs commandes à la suite. Réessayez plus tard ou écrivez-nous.');
  if (counts[1] >= limits[1]) fail_('Trop de commandes en ce moment. Réessayez plus tard.');
  keys.forEach(function (k, i) { cache.put(k, String(counts[i] + 1), 3600); });
}

/**
 * Orders tab. Page loads never create it (create = false); the first order does.
 * Returns null when the tab does not exist yet.
 */
function getOrdersSheet_(create) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.ORDERS_SHEET);
  if (!sheet && create) {
    sheet = ss.insertSheet(CONFIG.ORDERS_SHEET);
    sheet.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Tally with a short cache. fresh = true bypasses and refreshes the cache. */
function getTally_(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) {
    const hit = cache.get(CACHE_KEY_TALLY);
    if (hit) {
      try { return JSON.parse(hit); } catch (e) { /* fall through to recount */ }
    }
  }
  const tally = tallyBoxes_(getOrdersSheet_(false));
  cache.put(CACHE_KEY_TALLY, JSON.stringify(tally), CONFIG.CACHE_SECONDS);
  return tally;
}

/** Counts booster boxes across all orders (tracked products only). */
function tallyBoxes_(sheet) {
  const perProduct = {};
  let boxes = 0;
  const last = sheet ? sheet.getLastRow() : 0;
  if (last >= 2) {
    const rows = sheet.getRange(2, 1, last - 1, ORDER_HEADERS.length).getValues();
    rows.forEach(function (r) {
      const pid = r[4];
      const counted = Math.max(0, Math.floor(Number(r[9]) || 0));
      boxes += counted;
      if (pid) perProduct[pid] = (perProduct[pid] || 0) + counted;
    });
  }
  return { boxes: boxes, perProduct: perProduct };
}

/** Trims, caps length, and neutralises spreadsheet formula injection. */
function clean_(value, maxLen) {
  let s = String(value == null ? '' : value)
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(INVISIBLE_CHARS, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, maxLen);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
