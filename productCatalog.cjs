/**
 * Shared catalogue bridge — used by:
 *   • server.js (Mongo seed + /api/catalog-config)
 *   • api/products.js (Vercel in-memory store via createRequire)
 *
 * Product rows are read from api/products.js (single source of truth for the seed array).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const VALID_CATEGORIES = [
  'Printing',
  'Signage',
  'Internal Branding',
  'LED Screens',
  'OOH',
  'BTL',
];

let _parsedCache = null;

function parseProductsFromApiFile() {
  if (_parsedCache) return _parsedCache;

  const filePath = path.join(__dirname, 'api', 'products.js');
  const s = fs.readFileSync(filePath, 'utf8');

  const IMGm = s.match(/const IMG = '([^']*)';/);
  if (!IMGm) throw new Error('[productCatalog] const IMG not found in api/products.js');

  const IMG = IMGm[1];
  const marker = 'let PRODUCTS = [';
  const i0 = s.indexOf(marker);
  if (i0 < 0) throw new Error('[productCatalog] let PRODUCTS = [ not found in api/products.js');

  const sub = s.slice(i0 + 'let PRODUCTS = '.length);
  let depth = 0;
  let j = 0;
  let started = false;
  for (; j < sub.length; j++) {
    const c = sub[j];
    if (c === '[') {
      depth++;
      started = true;
    } else if (c === ']') {
      depth--;
      if (started && depth === 0) {
        j++;
        break;
      }
    }
  }

  const arrSrc = sub.slice(0, j);
  // eslint-disable-next-line no-eval
  _parsedCache = eval(`(function () { const IMG = ${JSON.stringify(IMG)}; return ${arrSrc} })()`);
  return _parsedCache;
}

function cloneVercelProducts() {
  return JSON.parse(JSON.stringify(parseProductsFromApiFile()));
}

/** Documents for Express + Mongo Product schema (no _id). */
function getMongoSeedDocs() {
  return parseProductsFromApiFile().map((p) => ({
    name: p.name,
    price: p.price,
    oldPrice: p.oldPrice ?? null,
    category: p.category,
    description: p.description || '',
    image: p.image || '',
    badge: p.badge ?? null,
    tags: Array.isArray(p.tags) ? p.tags : [],
    features: Array.isArray(p.features) ? p.features : [],
    sku: p.sku || '',
    stock: p.stock === 'low_stock' ? 'Low Stock' : 'In Stock',
  }));
}

function getCatalogProductCount() {
  return parseProductsFromApiFile().length;
}

module.exports = {
  VALID_CATEGORIES,
  cloneVercelProducts,
  getMongoSeedDocs,
  getCatalogProductCount,
  parseProductsFromApiFile,
};
