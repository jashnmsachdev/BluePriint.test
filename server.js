const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const path     = require("path");

const productCatalog = require("./productCatalog.cjs");

const app = express();
app.use(express.json());
app.use(cors());

// Admin UI + shop assets (same origin as /api/*)
app.use("/admin", express.static(path.join(__dirname, "admin")));

/* ════════════════════════════════════════════
   🔗 MONGODB ATLAS CONNECTION
════════════════════════════════════════════ */
mongoose.connect(
  "mongodb://admin:admin123@ac-2ztf1nh-shard-00-00.zfckuvh.mongodb.net:27017," +
  "ac-2ztf1nh-shard-00-01.zfckuvh.mongodb.net:27017," +
  "ac-2ztf1nh-shard-00-02.zfckuvh.mongodb.net:27017/" +
  "?ssl=true&replicaSet=atlas-dkqg1t-shard-0&authSource=admin&appName=Cluster0"
)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));


/* ════════════════════════════════════════════
   🔐 ADMIN KEY MIDDLEWARE
   Protects mutating routes (POST / PUT / DELETE).
   Set ADMIN_API_KEY in your environment (.env or Vercel env vars).
   Dashboard sends the key in the x-admin-key header.
════════════════════════════════════════════ */
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'bluepriint-admin-2025';

function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized — invalid or missing admin key.' });
  }
  next();
}


/* ════════════════════════════════════════════
   📦 PRODUCT SCHEMA
   Fields aligned with shop.html field names.
   price / oldPrice are Numbers so toLocaleString works client-side.
════════════════════════════════════════════ */
const ProductSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    price:       { type: Number, required: true },          // ← Number, NOT String
    oldPrice:    { type: Number, default: null },           // original price (for discount %)
    category:    { type: String, required: true, trim: true }, // maps to `cat` in shop
    description: { type: String, default: "" },             // maps to `desc` in shop
    image:       { type: String, default: "" },             // maps to `img`  in shop
    badge:       { type: String, enum: ["popular", "sale", "new", "custom", null], default: null },
    tags:        { type: [String], default: [] },
    features:    { type: [String], default: [] },           // shown in quick-view modal
    sku:         { type: String, default: "" },
    stock:       { type: String, default: "In Stock" },
  },
  {
    timestamps: true,           // adds createdAt / updatedAt (used for "newest" sort)
    toJSON:     { virtuals: true }, // ensures `id` field is included alongside `_id`
  }
);

// Text index for full-text search (?q= param)
ProductSchema.index({ name: "text", description: "text", category: "text", tags: "text" });

const Product = mongoose.model("Product", ProductSchema);


/* ════════════════════════════════════════════
   📌 GET /api/catalog-config
   Shared with admin/dashboard.html — categories match api/products.js + productCatalog.cjs
════════════════════════════════════════════ */
app.get("/api/catalog-config", (req, res) => {
  try {
    res.json({
      success: true,
      validCategories: productCatalog.VALID_CATEGORIES,
      productSeedCount: productCatalog.getCatalogProductCount(),
    });
  } catch (err) {
    console.error("GET /api/catalog-config error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   📋 GET /api/products
   Supports all query params from shop.html:
     ?cat=       category filter
     ?badge=     badge filter  (popular | sale | new)
     ?q=         full-text search
     ?maxPrice=  price ceiling
     ?sort=      newest | price_asc | price_desc | name_asc
     ?page=      page number  (default 1)
     ?limit=     page size    (default 12)
════════════════════════════════════════════ */
app.get("/api/products", async (req, res) => {
  try {
    const {
      cat,
      badge,
      q,
      maxPrice,
      sort  = "newest",
      page  = 1,
      limit = 12,
    } = req.query;

    /* ── Build filter ── */
    const filter = {};

    if (cat)      filter.category = { $regex: new RegExp(`^${cat}$`, "i") };
    if (badge)    filter.badge    = badge;
    if (maxPrice) filter.price    = { $lte: Number(maxPrice) };

    // Full-text search (uses the text index defined above)
    if (q) {
      filter.$text = { $search: q };
    }

    /* ── Sort mapping (shop sends these exact strings) ── */
    const sortMap = {
      newest:     { createdAt: -1 },
      price_asc:  { price: 1 },
      price_desc: { price: -1 },
      name_asc:   { name: 1 },
    };
    const sortObj = sortMap[sort] || { createdAt: -1 };

    /* ── Pagination ── */
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit))); // cap at 50
    const skip     = (pageNum - 1) * limitNum;

    /* ── Query ── */
    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(filter),
    ]);

    /* ── Envelope response matching shop.html expectations ── */
    res.json({
      success: true,
      data: products,
      meta: {
        total,
        page:       pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit:      limitNum,
      },
    });
  } catch (err) {
    console.error("GET /api/products error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🔍 GET /api/products/:id  (Quick View)
════════════════════════════════════════════ */
app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ success: false, error: "Product not found" });
    res.json({ success: true, data: product });
  } catch (err) {
    console.error("GET /api/products/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   ➕ POST /api/products  (Add product)
════════════════════════════════════════════ */
app.post("/api/products", requireAdminKey, async (req, res) => {
  try {
    if (req.body.category && !productCatalog.VALID_CATEGORIES.includes(req.body.category)) {
      return res.status(400).json({
        success: false,
        error: `category must be one of: ${productCatalog.VALID_CATEGORIES.join(", ")}`,
      });
    }
    const product = new Product(req.body);
    await product.save();
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    console.error("POST /api/products error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   ✏️  PUT /api/products/:id  (Update product)
════════════════════════════════════════════ */
app.put("/api/products/:id", requireAdminKey, async (req, res) => {
  try {
    if (req.body.category && !productCatalog.VALID_CATEGORIES.includes(req.body.category)) {
      return res.status(400).json({
        success: false,
        error: `category must be one of: ${productCatalog.VALID_CATEGORIES.join(", ")}`,
      });
    }
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!product) return res.status(404).json({ success: false, error: "Product not found" });
    res.json({ success: true, data: product });
  } catch (err) {
    console.error("PUT /api/products/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🗑️  DELETE /api/products/:id
════════════════════════════════════════════ */
app.delete("/api/products/:id", requireAdminKey, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: "Product not found" });
    res.json({ success: true, message: "Product deleted" });
  } catch (err) {
    console.error("DELETE /api/products/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🧪 GET /api/seed  (one-time test data seeder)
   Visit once to populate DB, then remove or restrict.
════════════════════════════════════════════ */
app.get("/api/seed", async (req, res) => {
  try {
    const existing = await Product.countDocuments();
    if (existing > 0) {
      return res.json({ success: false, message: `DB already has ${existing} products — seeding skipped.` });
    }

    const docs = productCatalog.getMongoSeedDocs();
    await Product.insertMany(docs);
    res.json({ success: true, message: `${docs.length} products seeded from api/products.js (via productCatalog.cjs).` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🚀 START SERVER
════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   Admin dashboard: http://localhost:${PORT}/admin/dashboard.html`);
});
