/* ════════════════════════════════════════════
   shop.js  —  BluePriint Client-Side Shop Logic
   Connects to the Express API defined in server.js
════════════════════════════════════════════ */
 
/* ── API Base URL (matches server.js deployment) ── */
const API_BASE = (() => {
  const h = window.location.hostname;
  return (h === 'localhost' || h === '127.0.0.1')
    ? 'http://localhost:3000'
    : 'https://bluepriint-test.onrender.com';
})();
 
const API_URL = `${API_BASE}/api/products`;
 
 
/* ════════════════════════════════════════════
   STATE
   All filter/pagination state lives here.
   applyFilters() reads from this object and fires the API call.
════════════════════════════════════════════ */
let STATE = {
  q:        '',
  cat:      '',
  badge:    '',
  maxPrice: '',
  sort:     'newest',
  page:     1,
  limit:    12,
  total:    0,
  totalPages: 1,
};
 
let CART = JSON.parse(localStorage.getItem('bp_cart') || '[]');
 
 
/* ════════════════════════════════════════════
   API HELPERS
════════════════════════════════════════════ */
 
/**
 * Fetch a paginated / filtered product list.
 * Returns { success, data, meta } matching server.js envelope.
 */
async function fetchProducts(params = {}) {
  const qs = new URLSearchParams();
  if (params.q)        qs.set('q',        params.q);
  if (params.cat)      qs.set('cat',      params.cat);
  if (params.badge)    qs.set('badge',    params.badge);
  if (params.maxPrice) qs.set('maxPrice', params.maxPrice);
  if (params.sort)     qs.set('sort',     params.sort);
  if (params.page)     qs.set('page',     params.page);
  if (params.limit)    qs.set('limit',    params.limit);
 
  try {
    const res  = await fetch(`${API_URL}?${qs.toString()}`);
    return await res.json();
  } catch (err) {
    console.error('[Shop] fetchProducts error:', err);
    return { success: false, error: err.message };
  }
}
 
/**
 * Fetch a single product by its MongoDB _id.
 * Used by the Quick View modal.
 */
async function fetchProductById(id) {
  try {
    const res  = await fetch(`${API_URL}/${id}`);
    return await res.json();
  } catch (err) {
    console.error('[Shop] fetchProductById error:', err);
    return { success: false, error: err.message };
  }
}
 
 
/* ════════════════════════════════════════════
   RENDER — Product Cards
   Renders into #productGrid.
   Falls back to a friendly empty state if no results.
════════════════════════════════════════════ */
function renderProductCards(products) {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
 
  if (!products || !products.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
        <div style="font-size:48px;opacity:.2;margin-bottom:16px;">📦</div>
        <div style="font-size:17px;font-weight:700;color:#0d3b6e;margin-bottom:8px;">No products found</div>
        <div style="font-size:13.5px;color:#6b7c93;">Try adjusting your filters or search term.</div>
      </div>`;
    return;
  }
 
  const badgeLabels = { popular: '🔥 Popular', sale: '🏷 Sale', new: '✨ New' };
  const badgeCls    = { popular: 'badge-popular', sale: 'badge-sale', new: 'badge-new' };
 
  grid.innerHTML = products.map(p => {
    const id       = p.id || p._id;
    const img      = p.image || p.img || '';
    const cat      = p.category || p.cat || '';
    const desc     = p.description || p.desc || '';
    const discount = p.oldPrice ? Math.round(100 - (p.price / p.oldPrice * 100)) : 0;
 
    return `
      <div class="product-card" data-id="${id}">
        <div class="product-img-wrap">
          <img
            src="${img}"
            alt="${p.name}"
            loading="lazy"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'220\'%3E%3Crect fill=\'%23e8f1fb\' width=\'300\' height=\'220\'/%3E%3Ctext x=\'150\' y=\'115\' text-anchor=\'middle\' font-size=\'36\' fill=\'%232980d9\'%3E📦%3C/text%3E%3C/svg%3E'"
          />
          ${p.badge ? `<span class="product-badge ${badgeCls[p.badge] || ''}">${badgeLabels[p.badge] || p.badge}</span>` : ''}
          ${discount > 0 ? `<span class="product-discount">-${discount}%</span>` : ''}
          <button class="quick-view-btn" onclick="openQuickView('${id}')">Quick View</button>
        </div>
        <div class="product-info">
          <div class="product-cat">${cat}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${desc.length > 80 ? desc.slice(0, 80) + '…' : desc}</div>
          <div class="product-price-row">
            <span class="product-price">₹${Number(p.price).toLocaleString('en-IN')}</span>
            ${p.oldPrice ? `<span class="product-old-price">₹${Number(p.oldPrice).toLocaleString('en-IN')}</span>` : ''}
          </div>
          <button class="add-to-cart-btn" onclick="addToCart('${id}', '${p.name.replace(/'/g,"\\'")}', ${p.price})">
            🛒 Add to Cart
          </button>
        </div>
      </div>`;
  }).join('');
}
 
 
/* ════════════════════════════════════════════
   RENDER — Pagination
   Renders into #pagination.
════════════════════════════════════════════ */
function renderPagination(page, totalPages) {
  const el = document.getElementById('pagination');
  if (!el || totalPages <= 1) {
    if (el) el.innerHTML = '';
    return;
  }
 
  let btns = '';
  if (page > 1) btns += `<button class="pg-btn" onclick="goToPage(${page-1})">‹</button>`;
 
  const start = Math.max(1, page - 2);
  const end   = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) {
    btns += `<button class="pg-btn${i === page ? ' active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
 
  if (page < totalPages) btns += `<button class="pg-btn" onclick="goToPage(${page+1})">›</button>`;
 
  el.innerHTML = btns;
}
 
 
/* ════════════════════════════════════════════
   RENDER — Result Count
════════════════════════════════════════════ */
function renderResultCount(total) {
  const el = document.getElementById('resultCount');
  if (el) el.textContent = `${total} product${total !== 1 ? 's' : ''} found`;
}
 
 
/* ════════════════════════════════════════════
   APPLY FILTERS
   Collects current STATE and fires fetchProducts().
   Called on any filter/search/sort/page change.
════════════════════════════════════════════ */
async function applyFilters() {
  showLoadingState();
 
  const result = await fetchProducts(STATE);
 
  if (result && result.success) {
    const { data, meta } = result;
    STATE.total      = meta.total;
    STATE.totalPages = meta.totalPages;
 
    renderProductCards(data);
    renderPagination(meta.page, meta.totalPages);
    renderResultCount(meta.total);
  } else {
    showErrorState(result?.error || 'Failed to load products');
  }
}
 
function showLoadingState() {
  const grid = document.getElementById('productGrid');
  if (grid) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#6b7c93;">
        <div style="font-size:28px;display:inline-block;animation:spin .8s linear infinite;margin-bottom:12px;">⟳</div>
        <br>Loading products…
      </div>`;
  }
}
 
function showErrorState(msg) {
  const grid = document.getElementById('productGrid');
  if (grid) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
        <div style="font-size:28px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:14px;color:#e53935;">${msg}</div>
        <button onclick="applyFilters()" style="margin-top:16px;padding:8px 20px;background:#0d3b6e;color:#fff;border:none;border-radius:8px;cursor:pointer;">Retry</button>
      </div>`;
  }
}
 
 
/* ════════════════════════════════════════════
   FILTER / SORT / SEARCH CONTROLS
   Wire these to DOM element events in shop.html.
════════════════════════════════════════════ */
 
/** Called from the search input (use with debounce) */
let _searchTimer;
function onSearchInput(value) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    STATE.q    = value.trim();
    STATE.page = 1;
    applyFilters();
  }, 350);
}
 
/** Called from category filter buttons or <select> */
function filterByCategory(cat) {
  STATE.cat  = cat;
  STATE.page = 1;
  applyFilters();
 
  // Update active state on filter buttons if they exist
  document.querySelectorAll('[data-cat-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.catBtn === cat);
  });
}
 
/** Called from badge filter buttons */
function filterByBadge(badge) {
  STATE.badge = badge;
  STATE.page  = 1;
  applyFilters();
}
 
/** Called from price range input */
function filterByMaxPrice(value) {
  STATE.maxPrice = value || '';
  STATE.page     = 1;
  applyFilters();
}
 
/** Called from sort <select> */
function onSortChange(value) {
  STATE.sort = value;
  STATE.page = 1;
  applyFilters();
}
 
/** Go to a specific page */
function goToPage(n) {
  STATE.page = n;
  applyFilters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
 
/** Reset all filters */
function clearFilters() {
  STATE = { ...STATE, q: '', cat: '', badge: '', maxPrice: '', sort: 'newest', page: 1 };
 
  const searchEl   = document.getElementById('searchInput');
  const sortEl     = document.getElementById('sortSelect');
  const priceEl    = document.getElementById('priceRange');
  if (searchEl) searchEl.value = '';
  if (sortEl)   sortEl.value   = 'newest';
  if (priceEl)  priceEl.value  = '';
 
  document.querySelectorAll('[data-cat-btn]').forEach(b => b.classList.remove('active'));
 
  applyFilters();
}
 
 
/* ════════════════════════════════════════════
   QUICK VIEW MODAL
   Fetches the full product and populates #quickViewModal.
   server.js GET /api/products/:id is the source.
════════════════════════════════════════════ */
async function openQuickView(id) {
  const modal = document.getElementById('quickViewModal');
  if (!modal) return;
 
  // Show modal in loading state
  const body = modal.querySelector('#qvBody') || modal.querySelector('.qv-body');
  if (body) body.innerHTML = '<div style="text-align:center;padding:40px;font-size:22px;color:#6b7c93;">⟳ Loading…</div>';
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
 
  const result = await fetchProductById(id);
  if (!result || !result.success) {
    if (body) body.innerHTML = `<div style="text-align:center;padding:40px;color:#e53935;">Failed to load product.</div>`;
    return;
  }
 
  const p        = result.data;
  const img      = p.image || p.img || '';
  const cat      = p.category || p.cat || '';
  const desc     = p.description || p.desc || '';
  const features = (p.features || []).map(f => `<li>${f}</li>`).join('');
  const tags     = (p.tags || []).map(t => `<span class="product-tag">${t}</span>`).join('');
  const discount = p.oldPrice ? Math.round(100 - (p.price / p.oldPrice * 100)) : 0;
 
  if (body) {
    body.innerHTML = `
      <div class="qv-grid">
        <div class="qv-img-wrap">
          <img src="${img}" alt="${p.name}"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'300\'%3E%3Crect fill=\'%23e8f1fb\' width=\'400\' height=\'300\'/%3E%3Ctext x=\'200\' y=\'155\' text-anchor=\'middle\' font-size=\'48\' fill=\'%232980d9\'%3E📦%3C/text%3E%3C/svg%3E'"
          />
        </div>
        <div class="qv-details">
          <div class="qv-cat">${cat}</div>
          <h2 class="qv-name">${p.name}</h2>
          ${p.sku ? `<div class="qv-sku">SKU: ${p.sku}</div>` : ''}
          <div class="qv-price-row">
            <span class="qv-price">₹${Number(p.price).toLocaleString('en-IN')}</span>
            ${p.oldPrice ? `<span class="qv-old-price">₹${Number(p.oldPrice).toLocaleString('en-IN')}</span>` : ''}
            ${discount > 0 ? `<span class="qv-discount">-${discount}%</span>` : ''}
          </div>
          <p class="qv-desc">${desc}</p>
          ${features ? `<ul class="qv-features">${features}</ul>` : ''}
          ${tags ? `<div class="qv-tags">${tags}</div>` : ''}
          <div class="qv-stock ${p.stock === 'In Stock' ? 'in-stock' : 'low-stock'}">
            ${p.stock === 'In Stock' ? '✓ In Stock' : '⚠ Low Stock'}
          </div>
          <div class="qv-actions">
            <button class="btn-add-cart" onclick="addToCart('${p.id || p._id}', '${p.name.replace(/'/g,"\\'")}', ${p.price}); closeQuickView();">
              🛒 Add to Cart
            </button>
            <a class="btn-enquire" href="https://wa.me/919717027607?text=${encodeURIComponent('Hi BluePriint, I\'d like a quote for: ' + p.name)}" target="_blank">
              💬 Get Quote
            </a>
          </div>
        </div>
      </div>`;
  }
}
 
function closeQuickView() {
  const modal = document.getElementById('quickViewModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}
 
 
/* ════════════════════════════════════════════
   CART
   Stored in localStorage as bp_cart = [{id, name, price, qty}]
════════════════════════════════════════════ */
function saveCart() {
  localStorage.setItem('bp_cart', JSON.stringify(CART));
  updateCartBadge();
}
 
function updateCartBadge() {
  const total = CART.reduce((sum, i) => sum + i.qty, 0);
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = total;
    el.style.display = total > 0 ? 'inline-flex' : 'none';
  });
}
 
function addToCart(id, name, price) {
  const existing = CART.find(i => i.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    CART.push({ id, name, price: Number(price), qty: 1 });
  }
  saveCart();
  showShopToast(`"${name}" added to cart`);
}
 
function removeFromCart(id) {
  CART = CART.filter(i => i.id !== id);
  saveCart();
  renderCartPanel();
}
 
function updateCartQty(id, delta) {
  const item = CART.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart();
  renderCartPanel();
}
 
function renderCartPanel() {
  const panel = document.getElementById('cartPanel');
  if (!panel) return;
 
  if (!CART.length) {
    panel.innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:36px;opacity:.3;margin-bottom:12px;">🛒</div>
        <div style="font-size:14px;color:#6b7c93;">Your cart is empty</div>
      </div>`;
    return;
  }
 
  const subtotal = CART.reduce((sum, i) => sum + i.price * i.qty, 0);
 
  panel.innerHTML = `
    <div class="cart-items">
      ${CART.map(item => `
        <div class="cart-item" data-id="${item.id}">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-controls">
            <button onclick="updateCartQty('${item.id}', -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="updateCartQty('${item.id}',  1)">+</button>
          </div>
          <div class="cart-item-price">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
          <button class="cart-item-del" onclick="removeFromCart('${item.id}')">✕</button>
        </div>
      `).join('')}
    </div>
    <div class="cart-footer">
      <div class="cart-subtotal">
        Subtotal <strong>₹${subtotal.toLocaleString('en-IN')}</strong>
      </div>
      <a class="cart-enquire-btn"
         href="https://wa.me/919717027607?text=${encodeURIComponent('Hi BluePriint, I\'d like to order:\n' + CART.map(i => `• ${i.name} ×${i.qty}`).join('\n'))}"
         target="_blank">
        💬 Send Enquiry via WhatsApp
      </a>
    </div>`;
}
 
function toggleCart() {
  const drawer = document.getElementById('cartDrawer');
  if (!drawer) return;
  const isOpen = drawer.classList.toggle('open');
  document.body.style.overflow = isOpen ? 'hidden' : '';
  if (isOpen) renderCartPanel();
}
 
 
/* ════════════════════════════════════════════
   TOAST (shop-specific, lightweight)
════════════════════════════════════════════ */
let _shopToastTimer;
function showShopToast(msg) {
  let t = document.getElementById('shopToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'shopToast';
    t.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);
      background:#0d3b6e;color:#fff;padding:11px 20px;border-radius:10px;
      font-size:13.5px;font-weight:600;z-index:9999;
      transition:transform .35s cubic-bezier(.34,1.56,.64,1);
      box-shadow:0 8px 24px rgba(7,25,46,.18);white-space:nowrap;`;
    document.body.appendChild(t);
  }
  t.textContent = '✓ ' + msg;
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(_shopToastTimer);
  _shopToastTimer = setTimeout(() => {
    t.style.transform = 'translateX(-50%) translateY(80px)';
  }, 2800);
}
 
 
/* ════════════════════════════════════════════
   INIT
   Called on DOMContentLoaded.
   Checks URL params so direct links like
   shop.html?cat=Signage or shop.html?id=... work.
════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
 
  // Pre-fill state from URL params
  if (params.get('cat'))      STATE.cat      = params.get('cat');
  if (params.get('badge'))    STATE.badge    = params.get('badge');
  if (params.get('q'))        STATE.q        = params.get('q');
  if (params.get('sort'))     STATE.sort     = params.get('sort');
  if (params.get('maxPrice')) STATE.maxPrice = params.get('maxPrice');
 
  // Wire up search input if present
  const searchEl = document.getElementById('searchInput');
  if (searchEl) {
    searchEl.value = STATE.q;
    searchEl.addEventListener('input', e => onSearchInput(e.target.value));
  }
 
  // Wire up sort select
  const sortEl = document.getElementById('sortSelect');
  if (sortEl) {
    sortEl.value = STATE.sort;
    sortEl.addEventListener('change', e => onSortChange(e.target.value));
  }
 
  // Wire up price range
  const priceEl = document.getElementById('priceRange');
  if (priceEl) {
    priceEl.addEventListener('input', e => filterByMaxPrice(e.target.value));
  }
 
  // Category buttons (elements with data-cat-btn attribute)
  document.querySelectorAll('[data-cat-btn]').forEach(btn => {
    btn.addEventListener('click', () => filterByCategory(btn.dataset.catBtn));
    if (btn.dataset.catBtn === STATE.cat) btn.classList.add('active');
  });
 
  // Cart badge initialisation
  updateCartBadge();
 
  // Load products
  await applyFilters();
 
  // If a product ID is in the URL, open Quick View
  const productId = params.get('id');
  if (productId) openQuickView(productId);
 
  // ESC closes Quick View
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeQuickView();
  });
 
  // Click outside quick view modal to close
  const qvModal = document.getElementById('quickViewModal');
  if (qvModal) {
    qvModal.addEventListener('click', e => {
      if (e.target === qvModal) closeQuickView();
    });
  }
});
 
