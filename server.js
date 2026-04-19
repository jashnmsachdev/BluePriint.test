const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const path     = require("path");

const productCatalog = require("./productCatalog.cjs");

const app = express();
app.use(express.json());
app.use(cors());

// Serve admin dashboard from /admin/*
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
   Protects all mutating routes (POST / PUT / DELETE).
   Set ADMIN_API_KEY in your .env or Vercel env vars.
   Dashboard sends it as the x-admin-key request header.
════════════════════════════════════════════ */
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "bluepriint-admin-2025";

function requireAdminKey(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_API_KEY) {
    return res.status(401).json({ success: false, error: "Unauthorized — invalid or missing admin key." });
  }
  next();
}


/* ════════════════════════════════════════════
   🛠️  CLOUDINARY CONFIG (image hosting)
════════════════════════════════════════════ */
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "dschflths",
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


/* ════════════════════════════════════════════════════════════
   📦  SCHEMAS
════════════════════════════════════════════════════════════ */

/* ── PRODUCT ──────────────────────────────────────────────
   `image`       → primary/cover photo (shop card + cart)
   `images`      → extra gallery photos (Quick View carousel)
   `variants`    → selectable options in Quick View
                   { type, label, price?, oldPrice?,
                     description?, color?, images? }
   `active`      → false = hidden from shop (soft delete)
─────────────────────────────────────────────────────────── */

/* Embedded variant sub-schema — _id:false = no extra IDs */
const VariantSchema = new mongoose.Schema(
  {
    type:        { type: String, required: true, trim: true }, // "Color" | "Size" | "Material" | etc.
    label:       { type: String, required: true, trim: true }, // "Blue" | "3×2 ft"
    price:       { type: Number, default: null },              // overrides base price when selected
    oldPrice:    { type: Number, default: null },              // crossed-out price for this variant
    description: { type: String, default: "" },               // variant-specific description shown in Quick View
    color:       { type: String, default: null },              // hex for color-swatch chip e.g. "#1a5fa8"
    images:      { type: [String], default: [] },             // variant-specific gallery images
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    price:       { type: Number, required: true },
    oldPrice:    { type: Number, default: null },
    category:    { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    image:       { type: String, default: "" },
    images:      { type: [String], default: [] },
    variants:    { type: [VariantSchema], default: [] },
    badge:       { type: String, enum: ["popular", "sale", "new", "custom", null], default: null },
    tags:        { type: [String], default: [] },
    features:    { type: [String], default: [] },
    sku:         { type: String, default: "", trim: true },
    stock:       { type: String, default: "In Stock" },
    active:      { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
  }
);
ProductSchema.index({ name: "text", description: "text", category: "text", tags: "text" });
const Product = mongoose.model("Product", ProductSchema);


/* ── ORDER ────────────────────────────────────────────────
   orderId        → human-readable auto-generated ID (BP-XXXX)
   phone          → required by WhatsApp receipt feature
   address        → required delivery address
   deadline       → target delivery date (overdue = highlight red)
   advances       → array of advance payments { amount, method, account }
   totalAdvance   → sum of advances (auto-calculated on save)
   pendingPayment → value - totalAdvance (auto-calculated on save)
   status         → new | pending | progress | complete | delivered | cancelled
   source         → offline | whatsapp | online | referral
─────────────────────────────────────────────────────────── */

const AdvancePaymentSchema = new mongoose.Schema(
  {
    amount:  { type: Number, required: true, min: 0 },
    method:  { type: String, enum: ["Cash", "NEFT", "UPI"], default: "Cash" },
    account: { type: String, default: "", trim: true }, // UPI ID / bank ref / account no
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    orderId:        { type: String, unique: true },          // auto-set in pre-save
    customer:       { type: String, required: true, trim: true },
    company:        { type: String, default: "", trim: true },
    phone:          { type: String, default: "", trim: true },
    product:        { type: String, required: true, trim: true },
    category:       { type: String, default: "Other", trim: true },
    qty:            { type: Number, default: 1, min: 1 },
    value:          { type: Number, required: true, min: 0 },
    address:        { type: String, default: "", trim: true }, // delivery address
    deadline:       { type: Date,   default: null },           // expected delivery date
    advances:       { type: [AdvancePaymentSchema], default: [] },
    totalAdvance:   { type: Number, default: 0 },              // computed on save
    pendingPayment: { type: Number, default: 0 },              // computed on save
    status: {
      type:    String,
      enum:    ["new", "pending", "progress", "complete", "delivered", "cancelled"],
      default: "new",
    },
    source: {
      type:    String,
      enum:    ["offline", "whatsapp", "online", "referral"],
      default: "offline",
    },
    notes:     { type: String, default: "" },
    workNotes: { type: String, default: "" }, // employee production notes
    orderDate: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
  }
);

// Auto-generate human-readable orderId (BP-0001, BP-0002, …)
// Also auto-compute totalAdvance and pendingPayment
OrderSchema.pre("save", async function (next) {
  if (!this.orderId) {
    const count = await Order.countDocuments();
    this.orderId = `BP-${String(count + 1).padStart(4, "0")}`;
  }
  // Recalculate payment totals
  this.totalAdvance   = (this.advances || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  this.pendingPayment = Math.max(0, (Number(this.value) || 0) - this.totalAdvance);
  next();
});
OrderSchema.index({ customer: "text", product: "text", orderId: "text" });
const Order = mongoose.model("Order", OrderSchema);


/* ── CUSTOMER ─────────────────────────────────────────────
   Mirrors the customer directory in the dashboard.
─────────────────────────────────────────────────────────── */
const CustomerSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    company:      { type: String, default: "", trim: true },
    phone:        { type: String, required: true, trim: true },
    email:        { type: String, default: "", trim: true, lowercase: true },
    city:         { type: String, default: "", trim: true },
    source:       {
      type:    String,
      enum:    ["other", "walk-in", "enquiry", "referral", "online"],
      default: "other",
    },
    orders:       { type: Number, default: 0, min: 0 },
    totalSpent:   { type: Number, default: 0, min: 0 },
    notes:        { type: String, default: "" },
    lastContact:  { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
  }
);
CustomerSchema.index({ name: "text", company: "text", phone: "text", city: "text" });
const Customer = mongoose.model("Customer", CustomerSchema);


/* ── ENQUIRY ──────────────────────────────────────────────
   Mirrors the enquiry cards on the dashboard.
   services → array of strings (Printing, Signage, …)
   priority → high | med | low
   status   → new | contacted | quoted | closed
─────────────────────────────────────────────────────────── */
const EnquirySchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    company:  { type: String, default: "", trim: true },
    phone:    { type: String, required: true, trim: true },
    email:    { type: String, default: "", trim: true, lowercase: true },
    city:     { type: String, default: "", trim: true },
    message:  { type: String, default: "" },
    services: { type: [String], default: [] },
    priority: {
      type:    String,
      enum:    ["high", "med", "low"],
      default: "med",
    },
    status:   {
      type:    String,
      enum:    ["new", "contacted", "quoted", "closed"],
      default: "new",
    },
  },
  {
    timestamps: true,   // createdAt shown as the enquiry date card
    toJSON:     { virtuals: true },
  }
);
EnquirySchema.index({ name: "text", company: "text", phone: "text", message: "text" });
const Enquiry = mongoose.model("Enquiry", EnquirySchema);


/* ════════════════════════════════════════════
   📌 GET /api/catalog-config
   Exposes VALID_CATEGORIES and seed count to the dashboard.
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


/* ════════════════════════════════════════════════════════════
   📋  PRODUCT ROUTES
════════════════════════════════════════════════════════════ */

/* GET /api/products
   Supports all query params from shop.html:
     ?cat=       category filter (case-insensitive exact match)
     ?badge=     badge filter  (popular | sale | new)
     ?q=         full-text search
     ?maxPrice=  price ceiling
     ?sort=      newest | price_asc | price_desc | name_asc
     ?page=      page number  (default 1)
     ?limit=     page size    (default 12, max 100 for admin)
*/
app.get("/api/products", async (req, res) => {
  try {
    const {
      cat, badge, q, maxPrice,
      sort  = "newest",
      page  = 1,
      limit = 12,
    } = req.query;

    const filter = {};
    if (cat)      filter.category = { $regex: new RegExp(`^${cat}$`, "i") };
    if (badge)    filter.badge    = badge;
    if (maxPrice) filter.price    = { $lte: Number(maxPrice) };

    // Full-text search: use $or + $regex instead of $text so it works
    // without requiring a MongoDB Atlas text index, and supports partial matches.
    if (q) {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { name:        re },
        { description: re },
        { category:    re },
        { tags:        re },
        { sku:         re },
      ];
    }

    // Hide inactive products from shop by default.
    // Admin dashboard passes ?active=all to see everything.
    if (req.query.active !== "all") {
      filter.active = { $ne: false };
    }

    const sortMap = {
      newest:     { createdAt: -1 },
      price_asc:  { price:     1  },
      price_desc: { price:    -1  },
      name_asc:   { name:      1  },
    };
    const sortObj  = sortMap[sort] || { createdAt: -1 };
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: products,
      meta: { total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum },
    });
  } catch (err) {
    console.error("GET /api/products error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/products/:id  — Quick View + admin edit
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

// POST /api/products  — Add product (sends image + images[] + variants[] from dashboard modal)
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
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/products/:id  — Update product (saves images[], variants[] too)
app.put("/api/products/:id", requireAdminKey, async (req, res) => {
  try {
    if (req.body.category && !productCatalog.VALID_CATEGORIES.includes(req.body.category)) {
      return res.status(400).json({
        success: false,
        error: `category must be one of: ${productCatalog.VALID_CATEGORIES.join(", ")}`,
      });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!product) return res.status(404).json({ success: false, error: "Product not found" });
    res.json({ success: true, data: product });
  } catch (err) {
    console.error("PUT /api/products/:id error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/products/:id
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


// PATCH /api/products/:id  — partial update (variants, active, etc.)
//   Uses $set so only the fields sent in the body are changed.
app.patch("/api/products/:id", requireAdminKey, async (req, res) => {
  try {
    const { _id, createdAt, ...patch } = req.body;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: patch },
      { new: true, runValidators: true }
    ).lean();
    if (!product) return res.status(404).json({ success: false, error: "Product not found" });
    res.json({ success: true, data: product });
  } catch (err) {
    console.error("PATCH /api/products/:id error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════════════════════
   🧾  ORDER ROUTES
════════════════════════════════════════════════════════════ */

// GET /api/orders  — list all orders (admin dashboard)
//   ?limit=  number of results (default 200)
//   ?status= filter by status
//   ?q=      search customer / product / orderId
app.get("/api/orders", async (req, res) => {
  try {
    const { limit = 200, status, q } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q) {
      const re = new RegExp(q, "i");
      filter.$or = [{ customer: re }, { product: re }, { orderId: re }, { company: re }];
    }
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(500, parseInt(limit)))
      .lean();
    res.json({ success: true, data: orders, meta: { total: orders.length } });
  } catch (err) {
    console.error("GET /api/orders error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/orders/:id  — single order (for edit modal pre-fill)
app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    res.json({ success: true, data: order });
  } catch (err) {
    console.error("GET /api/orders/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/orders  — create new order
//   orderId is auto-generated (BP-XXXX) in the pre-save hook
app.post("/api/orders", requireAdminKey, async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error("POST /api/orders error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/orders/:id  — update order (status change, edit fields)
app.put("/api/orders/:id", requireAdminKey, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    res.json({ success: true, data: order });
  } catch (err) {
    console.error("PUT /api/orders/:id error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// PATCH /api/orders/:id  — partial update (workNotes, status, etc.)
//   Used by employee dashboard to save work notes without resending full object.
app.patch("/api/orders/:id", requireAdminKey, async (req, res) => {
  try {
    const { _id, createdAt, orderId, ...patch } = req.body; // orderId is immutable
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: patch },
      { new: true, runValidators: true }
    ).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    res.json({ success: true, data: order });
  } catch (err) {
    console.error("PATCH /api/orders/:id error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/orders/:id
app.delete("/api/orders/:id", requireAdminKey, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    res.json({ success: true, message: "Order deleted" });
  } catch (err) {
    console.error("DELETE /api/orders/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════════════════════
   👥  CUSTOMER ROUTES
════════════════════════════════════════════════════════════ */

// GET /api/customers
app.get("/api/customers", async (req, res) => {
  try {
    const { limit = 100, q } = req.query;
    const filter = {};
    if (q) {
      const re = new RegExp(q, "i");
      filter.$or = [{ name: re }, { company: re }, { phone: re }, { city: re }];
    }
    const customers = await Customer.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(500, parseInt(limit)))
      .lean();
    res.json({ success: true, data: customers, meta: { total: customers.length } });
  } catch (err) {
    console.error("GET /api/customers error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/customers/:id
app.get("/api/customers/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({ success: false, error: "Customer not found" });
    res.json({ success: true, data: customer });
  } catch (err) {
    console.error("GET /api/customers/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/customers
app.post("/api/customers", requireAdminKey, async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    console.error("POST /api/customers error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/customers/:id
app.put("/api/customers/:id", requireAdminKey, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!customer) return res.status(404).json({ success: false, error: "Customer not found" });
    res.json({ success: true, data: customer });
  } catch (err) {
    console.error("PUT /api/customers/:id error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/customers/:id
app.delete("/api/customers/:id", requireAdminKey, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: "Customer not found" });
    res.json({ success: true, message: "Customer deleted" });
  } catch (err) {
    console.error("DELETE /api/customers/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════════════════════
   💬  ENQUIRY ROUTES
════════════════════════════════════════════════════════════ */

// GET /api/enquiries
//   ?limit=  (default 100)
//   ?status= filter by status
//   ?service= filter by a specific service string
app.get("/api/enquiries", async (req, res) => {
  try {
    const { limit = 100, status, service } = req.query;
    const filter = {};
    if (status)  filter.status   = status;
    if (service) filter.services = { $elemMatch: { $regex: new RegExp(service, "i") } };
    const enquiries = await Enquiry.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(500, parseInt(limit)))
      .lean();
    res.json({ success: true, data: enquiries, meta: { total: enquiries.length } });
  } catch (err) {
    console.error("GET /api/enquiries error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/enquiries/:id
app.get("/api/enquiries/:id", async (req, res) => {
  try {
    const enquiry = await Enquiry.findById(req.params.id).lean();
    if (!enquiry) return res.status(404).json({ success: false, error: "Enquiry not found" });
    res.json({ success: true, data: enquiry });
  } catch (err) {
    console.error("GET /api/enquiries/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/enquiries  — admin "Add Enquiry" button + shop contact form
app.post("/api/enquiries", async (req, res) => {
  // Public endpoint — no admin key required so shop contact forms work too
  try {
    const enquiry = new Enquiry(req.body);
    await enquiry.save();
    res.status(201).json({ success: true, data: enquiry });
  } catch (err) {
    console.error("POST /api/enquiries error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/enquiries/:id  — status update + edit
app.put("/api/enquiries/:id", requireAdminKey, async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).lean();
    if (!enquiry) return res.status(404).json({ success: false, error: "Enquiry not found" });
    res.json({ success: true, data: enquiry });
  } catch (err) {
    console.error("PUT /api/enquiries/:id error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/enquiries/:id
app.delete("/api/enquiries/:id", requireAdminKey, async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndDelete(req.params.id);
    if (!enquiry) return res.status(404).json({ success: false, error: "Enquiry not found" });
    res.json({ success: true, message: "Enquiry deleted" });
  } catch (err) {
    console.error("DELETE /api/enquiries/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════════════════════
   📊  STATS ROUTE  —  GET /api/stats
   Powers the dashboard stat cards, bar chart, and order
   status donut chart. All computed server-side so the
   dashboard never needs to massage data itself.
════════════════════════════════════════════════════════════ */
app.get("/api/stats", async (req, res) => {
  try {
    const now       = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    /* ── Parallel queries ── */
    const [
      totalOrders,
      thisMonthOrders,
      lastMonthOrders,
      openEnquiries,
      totalCustomers,
      allOrders,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.find({ createdAt: { $gte: thisMonth, $lt: nextMonth } }).lean(),
      Order.find({ createdAt: { $gte: lastMonth, $lt: thisMonth } }).lean(),
      Enquiry.countDocuments({ status: { $in: ["new", "contacted"] } }),
      Customer.countDocuments(),
      Order.find({ status: { $ne: "cancelled" } })
        .select("value status createdAt category")
        .lean(),
    ]);

    /* ── Monthly revenue (current & last) ── */
    const sumRevenue = (orders) =>
      orders
        .filter(o => o.status !== "cancelled")
        .reduce((s, o) => s + (Number(o.value) || 0), 0);

    const monthlyRevenue    = sumRevenue(thisMonthOrders);
    const lastMonthRevenue  = sumRevenue(lastMonthOrders);
    const revenueChange     = lastMonthRevenue > 0
      ? Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : 0;

    /* ── Revenue by month (last 12 months for bar charts) ── */
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const revenueByMonth = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthOrders = allOrders.filter(
        o => new Date(o.createdAt) >= start && new Date(o.createdAt) < end
      );
      revenueByMonth.push({
        month:     monthNames[start.getMonth()],
        val:       monthOrders.reduce((s, o) => s + (Number(o.value) || 0), 0),
        orders:    monthOrders.length,
        highlight: i === 0,   // current month gets the gold bar
      });
    }

    /* ── Order status breakdown (for donut chart) ── */
    const statusCounts = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const ordersByStatus = {};
    statusCounts.forEach(s => { ordersByStatus[s._id] = s.count; });

    /* ── Revenue by category (kept for future use) ── */
    const catMap = {};
    allOrders.forEach(o => {
      const cat = o.category || "Other";
      catMap[cat] = (catMap[cat] || 0) + (Number(o.value) || 0);
    });
    const totalCatRevenue = Object.values(catMap).reduce((s, v) => s + v, 0) || 1;
    const revenueByCategory = Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([label, val]) => ({
        label,
        val: Math.round((val / totalCatRevenue) * 100),
      }));

    res.json({
      success: true,
      data: {
        totalOrders,
        monthlyRevenue,
        lastMonthRevenue,
        revenueChange,
        openEnquiries,
        totalCustomers,
        revenueByMonth,      // array of { month, val, orders, highlight }
        revenueByCategory,   // array of { label, val (%) }
        ordersByStatus,      // { new: N, pending: N, progress: N, complete: N, cancelled: N }
      },
    });
  } catch (err) {
    console.error("GET /api/stats error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════════════════════
   🧪  SEED ROUTE  —  GET /api/seed
   Uses productCatalog.getMongoSeedDocs() as single source of truth for the
   base catalogue, then merges in the richer variant/images data for key products.
   Visit once, then restrict. Add ?force=1 to wipe and re-seed.
════════════════════════════════════════════════════════════ */
app.get("/api/seed", async (req, res) => {
  try {
    const existing = await Product.countDocuments();
    if (existing > 0 && req.query.force !== "1") {
      return res.json({
        success: false,
        message: `DB already has ${existing} products — skipped. Add ?force=1 to re-seed.`,
      });
    }
    if (req.query.force === "1") await Product.deleteMany({});

    // Base catalogue from productCatalog.cjs (single source of truth)
    const baseDocs = productCatalog.getMongoSeedDocs();

    // Rich variant data keyed by sku — merged over base docs
    const IMG = "https://blue-priint.github.io/assets/images/Bluepriint%20Images/";
    const variantOverrides = {
      "flex-banner": {
        images: [IMG + "Printing/Backlit-Flex/3.jpg"], active: true,
        variants: [
          { type: "Material", label: "Standard Flex", price: 850,  oldPrice: 1100, description: "Our standard backlit flex — great value, bright output, ideal for most signage applications.", images: [IMG + "Printing/Backlit-Flex/3.jpg"] },
          { type: "Material", label: "Premium Flex",  price: 1100, oldPrice: null, description: "Ultra-bright premium grade flex with enhanced UV resistance and sharper colour reproduction.", images: [IMG + "Printing/Backlit-Flex/3.jpg"] },
          { type: "Size", label: "3×2 ft",  price: 850,  description: "Compact 3×2 ft — ideal for countertop displays and small shop windows.", images: [] },
          { type: "Size", label: "6×4 ft",  price: 1400, description: "Mid-size 6×4 ft — the most popular size for shopfront fascia panels.", images: [] },
          { type: "Size", label: "10×5 ft", price: 2200, description: "Large format 10×5 ft — maximum visual impact for malls and showrooms.", images: [] },
        ],
      },
      "acp-signboard": {
        images: [IMG + "Signage%20Solutions/ACPSignage.JPG"], active: true,
        variants: [
          { type: "Finish", label: "Matte White",  color: "#f0f0f0", price: 3200, oldPrice: 4000, description: "Clean matte white — timeless and professional.", images: [IMG + "Signage%20Solutions/ACPSignage.JPG"] },
          { type: "Finish", label: "Gloss Black",  color: "#1a1a1a", price: 3500, oldPrice: 4200, description: "Premium gloss black — bold, high-contrast.", images: [IMG + "Signage%20Solutions/ACPSignage.JPG"] },
          { type: "Finish", label: "Brushed Gold", color: "#c9a84c", price: 4200, oldPrice: 5000, description: "Luxury brushed gold — ideal for premium brands.", images: [IMG + "Signage%20Solutions/ACPSignage.JPG"] },
          { type: "Size", label: "3×1 ft",  price: 3200, description: "Small 3×1 ft — door nameplates and compact plaques.", images: [] },
          { type: "Size", label: "6×2 ft",  price: 5800, description: "Standard 6×2 ft — covers most shop frontages.", images: [] },
          { type: "Size", label: "10×3 ft", price: 9500, description: "Large 10×3 ft — wide storefronts and showrooms.", images: [] },
        ],
      },
      "acrylic-uv-print": {
        images: [IMG + "Printing/Acrylic/3.jpg"], active: true,
        variants: [
          { type: "Material", label: "Clear Acrylic", color: "#d6eeff", price: 1800, oldPrice: 2200, description: "Crystal-clear base — print appears to float.", images: [IMG + "Printing/Acrylic/3.jpg"] },
          { type: "Material", label: "White Acrylic", color: "#ffffff", price: 1800, oldPrice: 2200, description: "Solid white — maximum colour vibrancy.", images: [IMG + "Printing/Acrylic/3.jpg"] },
          { type: "Material", label: "Black Acrylic", color: "#1a1a1a", price: 2000, oldPrice: 2400, description: "Black base — premium dark aesthetic.", images: [IMG + "Printing/Acrylic/3.jpg"] },
          { type: "Thickness", label: "3mm", price: 1800, description: "3mm — lightweight for indoor signage.", images: [] },
          { type: "Thickness", label: "5mm", price: 2100, description: "5mm — most popular, versatile.", images: [] },
          { type: "Thickness", label: "8mm", price: 2600, description: "8mm — heavy-duty for high-traffic areas.", images: [] },
        ],
      },
      "facade-3d-led": {
        images: [IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg"], active: true,
        variants: [
          { type: "LED Color", label: "Warm White", color: "#ffe4b5", price: 8500,  description: "Warm white — inviting, suits cafes and hospitality.", images: [IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg"] },
          { type: "LED Color", label: "Cool White", color: "#e8f4ff", price: 8500,  description: "Cool white — crisp and modern.", images: [IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg"] },
          { type: "LED Color", label: "RGB Color",  color: "#9b59b6", price: 10500, description: "Full RGB — cycle through any colour.", images: [IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg"] },
          { type: "Material", label: "Acrylic Face",  price: 8500,  description: "Acrylic faces — lightweight and vibrant.", images: [] },
          { type: "Material", label: "SS Metal Face", price: 12000, description: "Stainless steel — ultra-premium finish.", images: [] },
        ],
      },
      "neon-flex-sign": {
        images: [IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg"], active: true,
        variants: [
          { type: "Color", label: "Warm White", color: "#ffe4b5", price: 4500, oldPrice: 5500, description: "Soft warm white — cosy atmosphere for cafes.", images: [] },
          { type: "Color", label: "Neon Red",   color: "#ff3b3b", price: 4500, oldPrice: 5500, description: "Bold neon red — attention-grabbing.", images: [] },
          { type: "Color", label: "Neon Blue",  color: "#2980d9", price: 4500, oldPrice: 5500, description: "Electric blue — modern and techy.", images: [] },
          { type: "Color", label: "Neon Green", color: "#22a06b", price: 4500, oldPrice: 5500, description: "Vivid green — eco-brands and wellness.", images: [] },
          { type: "Color", label: "RGB",        color: "#9b59b6", price: 5800, oldPrice: 7000, description: "Full RGB remote — choose any colour.", images: [] },
          { type: "Mount",  label: "Indoor",  price: 4500, description: "Indoor mount — acrylic backboard.", images: [] },
          { type: "Mount",  label: "Outdoor", price: 5500, description: "Outdoor — IP65-rated weatherproof casing.", images: [] },
        ],
      },
      "vinyl-wall-wrap": {
        images: [IMG + "Printing/one%20way%20vison/3.jpg"], active: true,
        variants: [
          { type: "Finish", label: "Matte",    color: "#e0e0e0", price: 560, description: "Matte — no glare, professional look.", images: [] },
          { type: "Finish", label: "Gloss",    color: "#b0d0ff", price: 560, description: "Gloss — vivid colours and high contrast.", images: [] },
          { type: "Finish", label: "Textured", color: "#c8b89a", price: 680, description: "Textured — tactile, premium feel.", images: [] },
          { type: "Size", label: "Per sq.ft", price: 560,  description: "Order by the square foot — any dimension.", images: [] },
          { type: "Size", label: "10×8 ft",   price: 4200, description: "Standard 10×8 ft feature wall panel.", images: [] },
          { type: "Size", label: "Full wall",  price: 8500, description: "Full wall coverage — quote after site measurement.", images: [] },
        ],
      },
    };

    // Merge overrides onto base docs
    const merged = baseDocs.map(doc => {
      const override = variantOverrides[doc.sku];
      return override ? { ...doc, ...override } : { ...doc, images: [], variants: [], active: true };
    });

    await Product.insertMany(merged);
    res.json({
      success: true,
      message: `${merged.length} products seeded (${Object.keys(variantOverrides).length} with variants).`,
      products: merged.map(p => ({ sku: p.sku, name: p.name, variants: (p.variants||[]).length })),
    });
  } catch (err) {
    console.error("GET /api/seed error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════════════════════
   🚀  START SERVER
════════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 BluePriint API running on port ${PORT}`);
  console.log(`   Admin dashboard: http://localhost:${PORT}/admin/dashboard.html`);
});
