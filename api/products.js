/**
 * /api/products.js
 * BluePriint — Products REST API
 * Vercel Serverless Function (Node.js runtime)
 *
 * ENDPOINTS
 * ─────────────────────────────────────────────────────────────
 *  GET    /api/products              → list all (supports filters)
 *  GET    /api/products?id=BP-001    → single product by ID
 *  GET    /api/products?sku=flex-banner → single product by SKU
 *  POST   /api/products              → create a new product
 *  PUT    /api/products?id=BP-001    → update product fields
 *  DELETE /api/products?id=BP-001    → delete product
 *
 * QUERY PARAMS (GET list)
 * ─────────────────────────────────────────────────────────────
 *  ?cat=Printing                     filter by category
 *  ?badge=sale                       filter by badge (popular|sale|new)
 *  ?q=canvas                         search name, desc, tags (case-insensitive)
 *  ?minPrice=500&maxPrice=5000       price range filter
 *  ?sort=price_asc|price_desc|name_asc|name_desc|newest
 *  ?page=1&limit=10                  pagination (default limit: 24)
 *  ?fields=id,name,price,img         sparse fieldset response
 *
 * NOTE: This file uses an in-memory store seeded with the full
 * product catalogue. For production persistence, swap the
 * PRODUCTS store for a database call (see the DB_ADAPTER stub
 * at the bottom of this file — works with PlanetScale, Supabase,
 * MongoDB Atlas, or Vercel KV out of the box).
 *
 * Deploy: push this file to /api/products.js in your Vercel repo.
 * Auth:   pass x-admin-key: <your secret> header for write operations.
 *         Set ADMIN_API_KEY in Vercel environment variables.
 */

// ─────────────────────────────────────────────────────────────
// PRODUCT CATALOGUE — seed data (24 products)
// ─────────────────────────────────────────────────────────────

const IMG = 'https://blue-priint.github.io/assets/images/Bluepriint%20Images/';

/** @type {Product[]} */
let PRODUCTS = [
  {
    id: 'BP-001',
    sku: 'flex-banner',
    name: 'Backlit Flex Banner',
    category: 'Printing',
    description:
      'High-brightness backlit flex for shop fronts, malls and outdoor displays. UV-resistant ink that glows brilliantly at night.',
    price: 850,
    oldPrice: 1100,
    currency: 'INR',
    badge: 'popular',
    tags: ['Flex', 'Backlit', 'UV Print'],
    features: [
      'Available in all custom sizes',
      'UV-resistant weatherproof ink',
      '48-hour express turnaround',
    ],
    image: IMG + 'Printing/Backlit-Flex/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-03-01T10:00:00Z',
  },
  {
    id: 'BP-002',
    sku: 'acp-signboard',
    name: 'ACP Fascia Sign Board',
    category: 'Signage',
    description:
      'Durable aluminium composite panel signage for shops, offices and commercial spaces. Professional finish that lasts years.',
    price: 3200,
    oldPrice: 4000,
    currency: 'INR',
    badge: 'sale',
    tags: ['ACP', 'Aluminium', 'Fascia'],
    features: [
      'Weather-resistant ACP panel',
      'Custom shape & size fabrication',
      'LED backlit options available',
    ],
    image: IMG + 'Signage%20Solutions/ACPSignage.JPG',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-03-05T09:00:00Z',
  },
  {
    id: 'BP-003',
    sku: 'canvas-print',
    name: 'Premium Canvas Print',
    category: 'Printing',
    description:
      'Gallery-quality canvas prints for offices, showrooms and retail walls. Archival inks, vivid and lasting.',
    price: 1200,
    oldPrice: null,
    currency: 'INR',
    badge: null,
    tags: ['Canvas', 'A0/A1', 'Framed'],
    features: [
      'Archival-grade canvas material',
      'Sizes from A3 to 10-foot wide',
      'Framing & stretching available',
    ],
    image: IMG + 'Printing/canvas/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-01-12T08:00:00Z',
    updatedAt: '2024-02-20T08:00:00Z',
  },
  {
    id: 'BP-004',
    sku: 'one-way-vision',
    name: 'One Way Vision Film',
    category: 'Printing',
    description:
      'See-through perforated vinyl for glass facades — brand visibility outside, clear view inside.',
    price: 950,
    oldPrice: 1200,
    currency: 'INR',
    badge: 'new',
    tags: ['Perforated', 'Glass Film', 'Privacy'],
    features: [
      '50% perforated vinyl film',
      'Maintains interior visibility',
      'UV & weather resistant',
    ],
    image: IMG + 'Printing/one%20way%20vison/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-01T08:00:00Z',
    updatedAt: '2024-03-10T08:00:00Z',
  },
  {
    id: 'BP-005',
    sku: 'clip-on-translite',
    name: 'Clip-on Translite',
    category: 'Internal Branding',
    description:
      'Backlit translites for in-store branding, aisle displays and product promotions. Bright and attention-grabbing.',
    price: 2400,
    oldPrice: null,
    currency: 'INR',
    badge: null,
    tags: ['Backlit', 'In-Store', 'LED'],
    features: [
      'Slim-frame backlit design',
      'Quick-change graphics system',
      'Energy-efficient LED backlight',
    ],
    image: IMG + 'Internal%20Branding/Clip%20on%20translites/Picture30.jpg',
    stock: 'low_stock',
    active: true,
    createdAt: '2024-01-15T08:00:00Z',
    updatedAt: '2024-02-28T08:00:00Z',
  },
  {
    id: 'BP-006',
    sku: 'acrylic-uv-print',
    name: 'Acrylic UV Print',
    category: 'Printing',
    description:
      'Vibrant, scratch-resistant UV prints on clear or white acrylic. The premium choice for brand displays.',
    price: 1800,
    oldPrice: 2200,
    currency: 'INR',
    badge: 'sale',
    tags: ['Acrylic', 'UV Print', 'Scratch-Resistant'],
    features: [
      'Crystal-clear acrylic substrate',
      'Scratch & fade resistant',
      'Standoff or flush mounting',
    ],
    image: IMG + 'Printing/Acrylic/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-01-18T08:00:00Z',
    updatedAt: '2024-03-01T08:00:00Z',
  },
  {
    id: 'BP-007',
    sku: 'facade-3d-led',
    name: '3D LED Facade Sign',
    category: 'Signage',
    description:
      'Dramatic illuminated facade signs with 3D LED letters that transform storefronts into landmark destinations after dark.',
    price: 8500,
    oldPrice: null,
    currency: 'INR',
    badge: 'popular',
    tags: ['3D LED', 'Facade', 'Channel Letters'],
    features: [
      'Custom 3D letter fabrication',
      'RGB or single-colour LED',
      'Includes installation & wiring',
    ],
    image: IMG + 'Signage%20Solutions/Facade%20Signage/3%20night.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-01-20T08:00:00Z',
    updatedAt: '2024-02-15T08:00:00Z',
  },
  {
    id: 'BP-008',
    sku: 'floor-vinyl',
    name: 'Floor Vinyl Graphics',
    category: 'Internal Branding',
    description:
      'Heavy-duty anti-slip floor vinyl for retail stores, showrooms and events. Turn your floor into a brand surface.',
    price: 650,
    oldPrice: 800,
    currency: 'INR',
    badge: 'sale',
    tags: ['Floor Vinyl', 'Anti-Slip', 'Retail'],
    features: [
      'Anti-slip laminate finish',
      'Withstands heavy foot traffic',
      'Easy to clean & maintain',
    ],
    image: IMG + 'Printing/image11.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-01-22T08:00:00Z',
    updatedAt: '2024-03-02T08:00:00Z',
  },
  {
    id: 'BP-009',
    sku: 'roll-up-standee',
    name: 'Roll-up Standee',
    category: 'BTL',
    description:
      'Portable and professional roll-up standees for events, exhibitions, retail launches and office lobbies.',
    price: 1400,
    oldPrice: 1800,
    currency: 'INR',
    badge: 'sale',
    tags: ['Standee', 'Events', 'Retractable'],
    features: [
      'Aluminium base with carry bag',
      'Retractable mechanism',
      'Print replacement available',
    ],
    image: IMG + 'Printing/Backlit-Flex/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-01-25T08:00:00Z',
    updatedAt: '2024-02-25T08:00:00Z',
  },
  {
    id: 'BP-010',
    sku: 'glow-sign-board',
    name: 'Glow Sign Board',
    category: 'Signage',
    description:
      'Classic backlit glow sign boards for shops and businesses. Highly visible day and night with a clean, professional look.',
    price: 2200,
    oldPrice: null,
    currency: 'INR',
    badge: null,
    tags: ['Glow Sign', 'Backlit', 'Aluminium Frame'],
    features: [
      'Aluminium frame construction',
      'Internal LED / CFL lighting',
      'Waterproof & outdoor-safe',
    ],
    image: IMG + 'Signage%20Solutions/ACPSignage.JPG',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-01-28T08:00:00Z',
    updatedAt: '2024-02-10T08:00:00Z',
  },
  {
    id: 'BP-011',
    sku: 'dangler-print',
    name: 'Dangler Print',
    category: 'Internal Branding',
    description:
      'Eye-catching hanging danglers for aisle branding, product promotions and seasonal campaigns in retail environments.',
    price: 320,
    oldPrice: null,
    currency: 'INR',
    badge: null,
    tags: ['Dangler', 'Sunboard', 'Die-Cut'],
    features: [
      'Sunboard or PVC material',
      'Single or double-sided print',
      'Custom die-cut shapes available',
    ],
    image: IMG + 'Internal%20Branding/Clip%20on%20translites/Picture30.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-01T08:00:00Z',
    updatedAt: '2024-02-20T08:00:00Z',
  },
  {
    id: 'BP-012',
    sku: 'outdoor-hoarding',
    name: 'Outdoor Hoarding',
    category: 'OOH',
    description:
      'Large-format outdoor hoardings for maximum brand reach along highways, markets and commercial corridors.',
    price: 12000,
    oldPrice: null,
    currency: 'INR',
    badge: null,
    tags: ['Hoarding', 'Large Format', 'OOH'],
    features: [
      'Sizes up to 40×20 feet',
      'Steel structure & printing included',
      'PAN India installation network',
    ],
    image: IMG + 'Printing/canvas/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-03T08:00:00Z',
    updatedAt: '2024-03-01T08:00:00Z',
  },
  {
    id: 'BP-013',
    sku: 'sunboard-cutout',
    name: 'Sunboard Cut-out Display',
    category: 'BTL',
    description:
      'Custom-shaped sunboard cut-outs for point-of-sale displays, in-store promotions and event activations.',
    price: 480,
    oldPrice: 600,
    currency: 'INR',
    badge: 'sale',
    tags: ['Sunboard', 'Cut-out', 'POS'],
    features: [
      '5mm sunboard substrate',
      'Any shape or size',
      'Single or double-sided',
    ],
    image: IMG + 'Printing/Backlit-Flex/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-05T08:00:00Z',
    updatedAt: '2024-02-28T08:00:00Z',
  },
  {
    id: 'BP-014',
    sku: 'neon-flex-sign',
    name: 'Neon Flex LED Sign',
    category: 'Signage',
    description:
      'Custom neon flex LED signs for restaurants, retail and office interiors. Warm glow, low power consumption.',
    price: 4500,
    oldPrice: 5500,
    currency: 'INR',
    badge: 'new',
    tags: ['Neon', 'LED', 'Custom Shape'],
    features: [
      'Custom shape bending',
      'Energy-efficient LED neon',
      'Indoor & outdoor versions',
    ],
    image: IMG + 'Signage%20Solutions/Facade%20Signage/3%20night.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-10T08:00:00Z',
    updatedAt: '2024-03-08T08:00:00Z',
  },
  {
    id: 'BP-015',
    sku: 'vinyl-wall-wrap',
    name: 'Vinyl Wall Wrap',
    category: 'Printing',
    description:
      'Full-colour adhesive vinyl wall graphics for offices, retail showrooms and hospitality spaces. Easy to apply and remove.',
    price: 560,
    oldPrice: null,
    currency: 'INR',
    badge: null,
    tags: ['Vinyl', 'Wall Graphics', 'Office'],
    features: [
      'Air-release adhesive vinyl',
      'Repositionable up to 24 hrs',
      'Matte or gloss finish',
    ],
    image: IMG + 'Printing/one%20way%20vison/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-12T08:00:00Z',
    updatedAt: '2024-02-25T08:00:00Z',
  },
  {
    id: 'BP-016',
    sku: 'kiosk-display',
    name: 'Retail Kiosk Display',
    category: 'OOH',
    description:
      'Freestanding retail kiosks for malls, airports and high-traffic areas. Custom fabricated for your brand identity.',
    price: 18000,
    oldPrice: null,
    currency: 'INR',
    badge: null,
    tags: ['Kiosk', 'Retail', 'Freestanding'],
    features: [
      'Custom aluminium fabrication',
      'Integrated lighting options',
      'Branded wrap printing included',
    ],
    image: IMG + 'Signage%20Solutions/ACPSignage.JPG',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-14T08:00:00Z',
    updatedAt: '2024-03-01T08:00:00Z',
  },
  {
    id: 'BP-017',
    sku: 'led-display-screen',
    name: 'Indoor LED Display Screen',
    category: 'LED Screens',
    description:
      'High-resolution indoor LED display panels for retail, corporate lobbies and command centres. Vivid and impact-ready.',
    price: 22000,
    oldPrice: null,
    currency: 'INR',
    badge: null,
    tags: ['LED Screen', 'Indoor', 'P2.5/P3'],
    features: [
      'P2.5 / P3 pixel pitch options',
      'Content management system',
      'Installation & commissioning',
    ],
    image: IMG + 'Signage%20Solutions/Facade%20Signage/3%20night.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-16T08:00:00Z',
    updatedAt: '2024-02-20T08:00:00Z',
  },
  {
    id: 'BP-018',
    sku: 'outdoor-led-screen',
    name: 'Outdoor LED Video Wall',
    category: 'LED Screens',
    description:
      'Weatherproof outdoor LED screens for storefronts, rooftops and building facades. High brightness for direct sunlight.',
    price: 45000,
    oldPrice: null,
    currency: 'INR',
    badge: 'popular',
    tags: ['Outdoor LED', 'Video Wall', 'Weatherproof'],
    features: [
      'IP65 weatherproof rated',
      '5000+ nits brightness',
      'Remote content management',
    ],
    image: IMG + 'Signage%20Solutions/Facade%20Signage/3%20night.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-18T08:00:00Z',
    updatedAt: '2024-03-05T08:00:00Z',
  },
  {
    id: 'BP-019',
    sku: 'backlit-sign-box',
    name: 'LED Backlit Sign Box',
    category: 'Signage',
    description:
      'Slim aluminium LED light boxes for menus, directories and wall-mounted advertising displays. Clean and modern.',
    price: 2800,
    oldPrice: 3400,
    currency: 'INR',
    badge: 'sale',
    tags: ['Lightbox', 'Backlit', 'Slim Frame'],
    features: [
      'Slim 50mm aluminium frame',
      'Even LED backlighting',
      'Snap-open frame for easy graphic change',
    ],
    image: IMG + 'Internal%20Branding/Clip%20on%20translites/Picture30.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-20T08:00:00Z',
    updatedAt: '2024-03-02T08:00:00Z',
  },
  {
    id: 'BP-020',
    sku: 'printed-brochure',
    name: 'Catalogue & Brochure Print',
    category: 'Printing',
    description:
      'Premium offset and digital brochures for product catalogues, company profiles and event materials.',
    price: 180,
    oldPrice: null,
    currency: 'INR',
    badge: null,
    tags: ['Brochure', 'Offset', 'A4/A5'],
    features: [
      '200–350gsm coated stocks',
      'Spot UV & foiling options',
      'Min. 100 qty, bulk pricing',
    ],
    image: IMG + 'Printing/canvas/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-22T08:00:00Z',
    updatedAt: '2024-02-28T08:00:00Z',
  },
  {
    id: 'BP-021',
    sku: 'window-graphics',
    name: 'Shop Window Graphics',
    category: 'Printing',
    description:
      'Full-colour adhesive and semi-permanent window graphics for storefronts, malls and showroom glass.',
    price: 420,
    oldPrice: 520,
    currency: 'INR',
    badge: 'sale',
    tags: ['Window', 'Vinyl', 'Frosted'],
    features: [
      'Clear, white or frosted vinyl',
      'Custom cut & printed designs',
      'Professional application service',
    ],
    image: IMG + 'Printing/one%20way%20vison/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-24T08:00:00Z',
    updatedAt: '2024-03-01T08:00:00Z',
  },
  {
    id: 'BP-022',
    sku: 'frosted-film',
    name: 'Frosted Privacy Film',
    category: 'Internal Branding',
    description:
      'Architectural frosted film for glass partitions and office doors. Adds privacy while maintaining natural light flow.',
    price: 380,
    oldPrice: null,
    currency: 'INR',
    badge: null,
    tags: ['Frosted', 'Privacy', 'Glass Film'],
    features: [
      'Multiple frosting levels',
      'Custom pattern or solid frosted',
      'Easy clean & maintain',
    ],
    image: IMG + 'Printing/one%20way%20vison/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-26T08:00:00Z',
    updatedAt: '2024-03-03T08:00:00Z',
  },
  {
    id: 'BP-023',
    sku: 'banner-stand',
    name: 'Premium Banner Stand',
    category: 'BTL',
    description:
      'Heavy-duty double-sided banner stands for exhibitions, trade shows and in-store promotions.',
    price: 2200,
    oldPrice: 2800,
    currency: 'INR',
    badge: null,
    tags: ['Banner Stand', 'Double-Sided', 'Exhibition'],
    features: [
      'Chrome & black finish options',
      'Double-sided print ready',
      'Padded carry case included',
    ],
    image: IMG + 'Printing/Backlit-Flex/3.jpg',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-02-28T08:00:00Z',
    updatedAt: '2024-03-05T08:00:00Z',
  },
  {
    id: 'BP-024',
    sku: 'wayfinding-sign',
    name: 'Wayfinding Signage Set',
    category: 'Signage',
    description:
      'Architectural wayfinding and directional signs for campuses, hospitals, hotels and corporate offices.',
    price: 5500,
    oldPrice: null,
    currency: 'INR',
    badge: 'new',
    tags: ['Wayfinding', 'Directional', 'Architectural'],
    features: [
      'Brushed aluminium panels',
      'Custom typography & brand colour',
      'Full system design included',
    ],
    image: IMG + 'Signage%20Solutions/ACPSignage.JPG',
    stock: 'in_stock',
    active: true,
    createdAt: '2024-03-01T08:00:00Z',
    updatedAt: '2024-03-10T08:00:00Z',
  },
];

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  'Printing',
  'Signage',
  'Internal Branding',
  'LED Screens',
  'OOH',
  'BTL',
];

const VALID_BADGES    = ['popular', 'sale', 'new', null];
const VALID_STOCK     = ['in_stock', 'low_stock', 'out_of_stock'];
const VALID_SORT_KEYS = ['price_asc', 'price_desc', 'name_asc', 'name_desc', 'newest', 'oldest'];
const DEFAULT_LIMIT   = 24;
const MAX_LIMIT       = 100;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Build and send a consistent JSON response.
 * @param {import('@vercel/node').VercelResponse} res
 * @param {number} status
 * @param {object} body
 */
function send(res, status, body) {
  res.status(status).json(body);
}

/**
 * Set CORS headers — allow any origin by default.
 * Lock down ALLOWED_ORIGINS in your env vars for production.
 * @param {import('@vercel/node').VercelRequest}  req
 * @param {import('@vercel/node').VercelResponse} res
 */
function setCORS(req, res) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['*'];

  const origin = req.headers['origin'];
  const allow  = allowedOrigins.includes('*') || allowedOrigins.includes(origin)
    ? (origin || '*')
    : allowedOrigins[0];

  res.setHeader('Access-Control-Allow-Origin',  allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, Authorization');
  res.setHeader('Access-Control-Max-Age',       '86400');
  res.setHeader('Vary',                         'Origin');
}

/**
 * Returns true if the request carries a valid admin key.
 * Set ADMIN_API_KEY in Vercel environment variables.
 * @param {import('@vercel/node').VercelRequest} req
 */
function isAuthorised(req) {
  const secret = process.env.ADMIN_API_KEY;
  if (!secret) return true; // no key set → open (dev mode only, never in prod)
  const provided =
    req.headers['x-admin-key'] ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  return provided === secret;
}

/**
 * Generate the next sequential product ID.
 */
function nextId() {
  const nums = PRODUCTS.map((p) => parseInt(p.id.replace('BP-', ''), 10)).filter(Number.isFinite);
  const max  = nums.length ? Math.max(...nums) : 0;
  return `BP-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Lightweight ISO 8601 timestamp.
 */
const now = () => new Date().toISOString();

/**
 * Pick a sparse fieldset from a product object.
 * @param {object}   product
 * @param {string[]} fields   e.g. ['id','name','price']
 */
function pickFields(product, fields) {
  if (!fields || !fields.length) return product;
  return fields.reduce((acc, f) => {
    if (Object.prototype.hasOwnProperty.call(product, f)) acc[f] = product[f];
    return acc;
  }, {});
}

// ─────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────

/**
 * Validate fields for POST (create). Returns an array of error strings.
 * @param {object} body
 * @returns {string[]}
 */
function validateCreate(body) {
  const errors = [];

  if (!body.name || typeof body.name !== 'string' || !body.name.trim())
    errors.push('name is required and must be a non-empty string');

  if (!body.sku || typeof body.sku !== 'string' || !body.sku.trim())
    errors.push('sku is required and must be a non-empty string');
  else if (PRODUCTS.some((p) => p.sku === body.sku.trim()))
    errors.push(`sku "${body.sku.trim()}" is already in use`);

  if (!body.category || !VALID_CATEGORIES.includes(body.category))
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);

  if (body.price === undefined || body.price === null)
    errors.push('price is required');
  else if (typeof body.price !== 'number' || body.price < 0)
    errors.push('price must be a non-negative number');

  if (body.oldPrice !== undefined && body.oldPrice !== null) {
    if (typeof body.oldPrice !== 'number' || body.oldPrice < 0)
      errors.push('oldPrice must be a non-negative number or null');
    else if (body.oldPrice <= body.price)
      errors.push('oldPrice should be greater than price (it is the crossed-out original price)');
  }

  if (body.badge !== undefined && body.badge !== null && !VALID_BADGES.includes(body.badge))
    errors.push(`badge must be one of: ${VALID_BADGES.filter(Boolean).join(', ')}, or null`);

  if (body.stock !== undefined && !VALID_STOCK.includes(body.stock))
    errors.push(`stock must be one of: ${VALID_STOCK.join(', ')}`);

  if (body.tags !== undefined && !Array.isArray(body.tags))
    errors.push('tags must be an array of strings');

  if (body.features !== undefined && !Array.isArray(body.features))
    errors.push('features must be an array of strings');

  return errors;
}

/**
 * Validate fields for PUT (update). Only supplied fields are checked.
 * @param {object} body
 * @returns {string[]}
 */
function validateUpdate(body) {
  const errors = [];

  if (body.name !== undefined && (!body.name || !body.name.trim()))
    errors.push('name cannot be empty');

  if (body.sku !== undefined) {
    const trimmed = body.sku.trim();
    const conflict = PRODUCTS.find((p) => p.sku === trimmed);
    if (conflict && conflict.id !== body._targetId) // _targetId injected before calling
      errors.push(`sku "${trimmed}" is already used by ${conflict.id}`);
  }

  if (body.category !== undefined && !VALID_CATEGORIES.includes(body.category))
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);

  if (body.price !== undefined && (typeof body.price !== 'number' || body.price < 0))
    errors.push('price must be a non-negative number');

  if (body.badge !== undefined && body.badge !== null && !VALID_BADGES.includes(body.badge))
    errors.push(`badge must be one of: ${VALID_BADGES.filter(Boolean).join(', ')}, or null`);

  if (body.stock !== undefined && !VALID_STOCK.includes(body.stock))
    errors.push(`stock must be one of: ${VALID_STOCK.join(', ')}`);

  if (body.active !== undefined && typeof body.active !== 'boolean')
    errors.push('active must be a boolean');

  return errors;
}

// ─────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────

/**
 * Main Vercel serverless handler.
 * @param {import('@vercel/node').VercelRequest}  req
 * @param {import('@vercel/node').VercelResponse} res
 */
export default function handler(req, res) {
  setCORS(req, res);

  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { method, query, body } = req;

  // ── GET ──────────────────────────────────────────────────
  if (method === 'GET') {
    // Single product lookup by ID
    if (query.id) {
      const product = PRODUCTS.find((p) => p.id === query.id);
      if (!product)
        return send(res, 404, { success: false, error: `Product "${query.id}" not found` });
      const fields = query.fields ? query.fields.split(',') : null;
      return send(res, 200, { success: true, data: pickFields(product, fields) });
    }

    // Single product lookup by SKU
    if (query.sku) {
      const product = PRODUCTS.find((p) => p.sku === query.sku);
      if (!product)
        return send(res, 404, { success: false, error: `SKU "${query.sku}" not found` });
      const fields = query.fields ? query.fields.split(',') : null;
      return send(res, 200, { success: true, data: pickFields(product, fields) });
    }

    // ── Filtered list ────────────────────────────────────
    let list = [...PRODUCTS];

    // Only active by default (admin can pass ?active=all)
    if (query.active !== 'all') {
      list = list.filter((p) => p.active !== false);
    }

    // Category filter
    if (query.cat) {
      list = list.filter(
        (p) => p.category.toLowerCase() === decodeURIComponent(query.cat).toLowerCase()
      );
    }

    // Badge filter
    if (query.badge) {
      list = query.badge === 'none'
        ? list.filter((p) => !p.badge)
        : list.filter((p) => p.badge === query.badge);
    }

    // Stock filter
    if (query.stock) {
      list = list.filter((p) => p.stock === query.stock);
    }

    // Full-text search: name, description, tags
    if (query.q) {
      const q = decodeURIComponent(query.q).toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Price range
    const minPrice = parseFloat(query.minPrice);
    const maxPrice = parseFloat(query.maxPrice);
    if (!isNaN(minPrice)) list = list.filter((p) => p.price >= minPrice);
    if (!isNaN(maxPrice)) list = list.filter((p) => p.price <= maxPrice);

    // Sorting
    const sortKey = query.sort || 'newest';
    switch (sortKey) {
      case 'price_asc':   list.sort((a, b) => a.price - b.price);            break;
      case 'price_desc':  list.sort((a, b) => b.price - a.price);            break;
      case 'name_asc':    list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name_desc':   list.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'oldest':      list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
      case 'newest':
      default:            list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
    }

    // Pagination
    const total = list.length;
    const limit = Math.min(parseInt(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const page  = Math.max(parseInt(query.page)  || 1, 1);
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    list = list.slice(start, start + limit);

    // Sparse fieldset
    const fields = query.fields ? query.fields.split(',') : null;
    if (fields) list = list.map((p) => pickFields(p, fields));

    return send(res, 200, {
      success: true,
      data: list,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  }

  // ── POST (create) ────────────────────────────────────────
  if (method === 'POST') {
    if (!isAuthorised(req))
      return send(res, 401, { success: false, error: 'Unauthorised — valid x-admin-key required' });

    const errors = validateCreate(body || {});
    if (errors.length)
      return send(res, 400, { success: false, errors });

    const newProduct = {
      id:          nextId(),
      sku:         body.sku.trim(),
      name:        body.name.trim(),
      category:    body.category,
      description: (body.description || '').trim(),
      price:       body.price,
      oldPrice:    body.oldPrice ?? null,
      currency:    body.currency || 'INR',
      badge:       body.badge ?? null,
      tags:        Array.isArray(body.tags)     ? body.tags     : [],
      features:    Array.isArray(body.features) ? body.features : [],
      image:       (body.image || '').trim(),
      stock:       body.stock || 'in_stock',
      active:      body.active !== false,
      createdAt:   now(),
      updatedAt:   now(),
    };

    PRODUCTS.push(newProduct);

    return send(res, 201, {
      success: true,
      message: 'Product created',
      data:    newProduct,
    });
  }

  // ── PUT (update) ─────────────────────────────────────────
  if (method === 'PUT') {
    if (!isAuthorised(req))
      return send(res, 401, { success: false, error: 'Unauthorised — valid x-admin-key required' });

    const targetId = query.id;
    if (!targetId)
      return send(res, 400, { success: false, error: 'Query param "id" is required for PUT' });

    const index = PRODUCTS.findIndex((p) => p.id === targetId);
    if (index === -1)
      return send(res, 404, { success: false, error: `Product "${targetId}" not found` });

    // Inject target ID for duplicate-SKU check
    const updateBody = { ...(body || {}), _targetId: targetId };
    const errors = validateUpdate(updateBody);
    if (errors.length)
      return send(res, 400, { success: false, errors });

    // Immutable fields — strip them if the caller tries to change them
    const { id: _id, createdAt: _ca, _targetId: _ti, ...safeUpdates } = updateBody;

    PRODUCTS[index] = {
      ...PRODUCTS[index],
      ...safeUpdates,
      updatedAt: now(),
    };

    return send(res, 200, {
      success: true,
      message: 'Product updated',
      data:    PRODUCTS[index],
    });
  }

  // ── DELETE ───────────────────────────────────────────────
  if (method === 'DELETE') {
    if (!isAuthorised(req))
      return send(res, 401, { success: false, error: 'Unauthorised — valid x-admin-key required' });

    const targetId = query.id;
    if (!targetId)
      return send(res, 400, { success: false, error: 'Query param "id" is required for DELETE' });

    const index = PRODUCTS.findIndex((p) => p.id === targetId);
    if (index === -1)
      return send(res, 404, { success: false, error: `Product "${targetId}" not found` });

    const deleted = PRODUCTS.splice(index, 1)[0];

    return send(res, 200, {
      success: true,
      message: `Product "${deleted.id}" deleted`,
      data:    { id: deleted.id, sku: deleted.sku, name: deleted.name },
    });
  }

  // ── 405 Method Not Allowed ───────────────────────────────
  return send(res, 405, {
    success: false,
    error:   `Method "${method}" is not supported on this endpoint`,
    allowed: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
}

// ─────────────────────────────────────────────────────────────
// DB_ADAPTER STUB
// Replace the in-memory PRODUCTS array with one of these adapters
// to enable persistent storage without changing the handler above.
// ─────────────────────────────────────────────────────────────

/*
──────────────────────────────────────────────────
OPTION A: Vercel KV (Redis)  — npm i @vercel/kv
──────────────────────────────────────────────────
import { kv } from '@vercel/kv';

async function dbGet(id)         { return kv.hget('products', id); }
async function dbGetAll()        { return Object.values(await kv.hgetall('products') || {}); }
async function dbSet(id, data)   { return kv.hset('products', { [id]: data }); }
async function dbDel(id)         { return kv.hdel('products', id); }


──────────────────────────────────────────────────
OPTION B: Supabase  — npm i @supabase/supabase-js
──────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function dbGetAll()        { const { data } = await sb.from('products').select('*'); return data; }
async function dbGet(id)         { const { data } = await sb.from('products').select('*').eq('id', id).single(); return data; }
async function dbSet(id, data)   { return sb.from('products').upsert({ ...data, id }); }
async function dbDel(id)         { return sb.from('products').delete().eq('id', id); }


──────────────────────────────────────────────────
OPTION C: MongoDB Atlas  — npm i mongodb
──────────────────────────────────────────────────
import { MongoClient } from 'mongodb';
const client = new MongoClient(process.env.MONGODB_URI);
const col    = () => client.db('bluepriint').collection('products');

async function dbGetAll()        { return col().find({}).toArray(); }
async function dbGet(id)         { return col().findOne({ id }); }
async function dbSet(id, data)   { return col().replaceOne({ id }, data, { upsert: true }); }
async function dbDel(id)         { return col().deleteOne({ id }); }
*/
