const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

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
   `image`    → primary/cover photo (used by shop card + cart)
   `images`   → additional gallery photos (Quick View carousel)
   `variants` → array of selectable options shown in Quick View
                each variant: { type, label, price?, oldPrice?,
                                color?, images? }
   `active`   → soft-delete flag (false = hidden from shop)
─────────────────────────────────────────────────────────── */

/* Variant sub-schema — kept flexible so any type string works */
const VariantSchema = new mongoose.Schema(
  {
    type:     { type: String, required: true, trim: true }, // "Color" | "Size" | "Material" | etc.
    label:    { type: String, required: true, trim: true }, // "Blue" | "3×2 ft" | "Acrylic"
    price:    { type: Number, default: null },              // overrides base price when selected
    oldPrice: { type: Number, default: null },              // crossed-out price for this variant
    color:    { type: String, default: null },              // hex string for color-swatch chip
    images:   { type: [String], default: [] },             // variant-specific gallery images
  },
  { _id: false } // embedded — no separate _id needed
);

const ProductSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    price:       { type: Number, required: true },
    oldPrice:    { type: Number, default: null },
    category:    { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    image:       { type: String, default: "" },        // primary photo
    images:      { type: [String], default: [] },      // extra gallery photos
    variants:    { type: [VariantSchema], default: [] }, // Quick View variant chips
    badge:       { type: String, enum: ["popular", "sale", "new", "custom", null], default: null },
    tags:        { type: [String], default: [] },
    features:    { type: [String], default: [] },
    sku:         { type: String, default: "", trim: true },
    stock:       { type: String, default: "In Stock" },
    active:      { type: Boolean, default: true },     // false = hidden from shop listing
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
  }
);
ProductSchema.index({ name: "text", description: "text", category: "text", tags: "text" });
const Product = mongoose.model("Product", ProductSchema);


/* ── ORDER ────────────────────────────────────────────────
   orderId  → human-readable auto-generated ID (BP-XXXX)
   phone    → required by WhatsApp receipt feature
   status   → new | pending | progress | complete | cancelled
   source   → offline | whatsapp | online | referral
─────────────────────────────────────────────────────────── */
const OrderSchema = new mongoose.Schema(
  {
    orderId:   { type: String, unique: true },          // auto-set in pre-save
    customer:  { type: String, required: true, trim: true },
    company:   { type: String, default: "", trim: true },
    phone:     { type: String, default: "", trim: true }, // needed for WA receipt
    product:   { type: String, required: true, trim: true },
    category:  { type: String, default: "Other", trim: true },
    qty:       { type: Number, default: 1, min: 1 },
    value:     { type: Number, required: true, min: 0 },
    status:    {
      type:    String,
      enum:    ["new", "pending", "progress", "complete", "cancelled"],
      default: "new",
    },
    source:    {
      type:    String,
      enum:    ["offline", "whatsapp", "online", "referral"],
      default: "offline",
    },
    notes:     { type: String, default: "" },
    workNotes: { type: String, default: "" }, // employee-facing production notes (not shown in revenue views)
    orderDate: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
  }
);

// Auto-generate human-readable orderId (BP-0001, BP-0002, …)
OrderSchema.pre("save", async function (next) {
  if (!this.orderId) {
    const count = await Order.countDocuments();
    this.orderId = `BP-${String(count + 1).padStart(4, "0")}`;
  }
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
    if (q)        filter.$text    = { $search: q };

    // Hide inactive products from the shop by default.
    // Admin can pass ?active=all to see everything (used by dashboard).
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

// POST /api/products  — Add product (sends image + images[] from dashboard modal)
app.post("/api/products", requireAdminKey, async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    console.error("POST /api/products error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/products/:id  — Update product (saves new images[] array too)
app.put("/api/products/:id", requireAdminKey, async (req, res) => {
  try {
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

// PATCH /api/products/:id  — partial update (variants, active flag, workNotes, etc.)
//   Safer than PUT for single-field changes — only touches fields sent in body.
app.patch("/api/products/:id", requireAdminKey, async (req, res) => {
  try {
    // Strip immutable fields so callers can't accidentally overwrite _id / createdAt
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
//   Used by the employee dashboard to save work notes without
//   resending the full order object.
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
   Inserts the full 6-product starter catalogue with variants.
   Visit once, then protect or remove this route in production.
   Skips automatically if products already exist in the DB.
════════════════════════════════════════════════════════════ */
app.get("/api/seed", async (req, res) => {
  try {
    const existing = await Product.countDocuments();
    if (existing > 0) {
      return res.json({
        success: false,
        message: `DB already has ${existing} products — seeding skipped. Pass ?force=1 to re-seed.`,
      });
    }

    const IMG = "https://blue-priint.github.io/assets/images/Bluepriint%20Images/";

    const sampleProducts = [
      {
        name: "Backlit Flex Banner", sku: "flex-banner",
        price: 850, oldPrice: 1100,
        category: "Printing", badge: "popular",
        description: "High-brightness backlit flex for shop fronts, malls and outdoor displays. UV-resistant ink that glows brilliantly at night.",
        image:  IMG + "Printing/Backlit-Flex/3.jpg",
        images: [IMG + "Printing/Backlit-Flex/3.jpg"],
        tags: ["Flex", "Backlit", "UV Print"],
        features: ["Available in all custom sizes", "UV-resistant weatherproof ink", "48-hour express turnaround"],
        variants: [
          { type: "Material", label: "Standard Flex", price: 850,  oldPrice: 1100, images: [IMG + "Printing/Backlit-Flex/3.jpg"] },
          { type: "Material", label: "Premium Flex",  price: 1100, oldPrice: null, images: [IMG + "Printing/Backlit-Flex/3.jpg"] },
          { type: "Size", label: "3×2 ft",  price: 850,  images: [] },
          { type: "Size", label: "6×4 ft",  price: 1400, images: [] },
          { type: "Size", label: "10×5 ft", price: 2200, images: [] },
        ],
        stock: "in_stock", active: true,
      },
      {
        name: "ACP Fascia Sign Board", sku: "acp-signboard",
        price: 3200, oldPrice: 4000,
        category: "Signage", badge: "sale",
        description: "Durable aluminium composite panel signage for shops, offices and commercial spaces. Professional finish that lasts years.",
        image:  IMG + "Signage%20Solutions/ACPSignage.JPG",
        images: [IMG + "Signage%20Solutions/ACPSignage.JPG"],
        tags: ["ACP", "Aluminium", "Fascia"],
        features: ["Weather-resistant ACP panel", "Custom shape & size fabrication", "LED backlit options available"],
        variants: [
          { type: "Finish", label: "Matte White",  color: "#f0f0f0", price: 3200, oldPrice: 4000, images: [IMG + "Signage%20Solutions/ACPSignage.JPG"] },
          { type: "Finish", label: "Gloss Black",  color: "#1a1a1a", price: 3500, oldPrice: 4200, images: [IMG + "Signage%20Solutions/ACPSignage.JPG"] },
          { type: "Finish", label: "Brushed Gold", color: "#c9a84c", price: 4200, oldPrice: 5000, images: [IMG + "Signage%20Solutions/ACPSignage.JPG"] },
          { type: "Size", label: "3×1 ft",  price: 3200, images: [] },
          { type: "Size", label: "6×2 ft",  price: 5800, images: [] },
          { type: "Size", label: "10×3 ft", price: 9500, images: [] },
        ],
        stock: "in_stock", active: true,
      },
      {
        name: "Acrylic UV Print", sku: "acrylic-uv-print",
        price: 1800, oldPrice: 2200,
        category: "Printing", badge: "sale",
        description: "Vibrant, scratch-resistant UV prints on clear or white acrylic. The premium choice for brand displays.",
        image:  IMG + "Printing/Acrylic/3.jpg",
        images: [IMG + "Printing/Acrylic/3.jpg"],
        tags: ["Acrylic", "UV Print", "Scratch-Resistant"],
        features: ["Crystal-clear acrylic substrate", "Scratch & fade resistant", "Standoff or flush mounting"],
        variants: [
          { type: "Material", label: "Clear Acrylic",  color: "#d6eeff", price: 1800, oldPrice: 2200, images: [IMG + "Printing/Acrylic/3.jpg"] },
          { type: "Material", label: "White Acrylic",  color: "#ffffff", price: 1800, oldPrice: 2200, images: [IMG + "Printing/Acrylic/3.jpg"] },
          { type: "Material", label: "Black Acrylic",  color: "#1a1a1a", price: 2000, oldPrice: 2400, images: [IMG + "Printing/Acrylic/3.jpg"] },
          { type: "Thickness", label: "3mm", price: 1800, images: [] },
          { type: "Thickness", label: "5mm", price: 2100, images: [] },
          { type: "Thickness", label: "8mm", price: 2600, images: [] },
        ],
        stock: "in_stock", active: true,
      },
      {
        name: "3D LED Facade Sign", sku: "facade-3d-led",
        price: 8500, oldPrice: null,
        category: "Signage", badge: "popular",
        description: "Dramatic illuminated facade signs with 3D LED letters that transform storefronts into landmark destinations after dark.",
        image:  IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg",
        images: [IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg"],
        tags: ["3D LED", "Facade", "Channel Letters"],
        features: ["Custom 3D letter fabrication", "RGB or single-colour LED", "Includes installation & wiring"],
        variants: [
          { type: "LED Color", label: "Warm White", color: "#ffe4b5", price: 8500,  images: [IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg"] },
          { type: "LED Color", label: "Cool White", color: "#e8f4ff", price: 8500,  images: [IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg"] },
          { type: "LED Color", label: "RGB Color",  color: "#9b59b6", price: 10500, images: [IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg"] },
          { type: "Material", label: "Acrylic Face",  price: 8500,  images: [] },
          { type: "Material", label: "SS Metal Face", price: 12000, images: [] },
        ],
        stock: "in_stock", active: true,
      },
      {
        name: "Neon Flex LED Sign", sku: "neon-flex-sign",
        price: 4500, oldPrice: 5500,
        category: "Signage", badge: "new",
        description: "Custom neon flex LED signs for restaurants, retail and office interiors. Warm glow, low power consumption.",
        image:  IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg",
        images: [IMG + "Signage%20Solutions/Facade%20Signage/3%20night.jpg"],
        tags: ["Neon", "LED", "Custom Shape"],
        features: ["Custom shape bending", "Energy-efficient LED neon", "Indoor & outdoor versions"],
        variants: [
          { type: "Color", label: "Warm White", color: "#ffe4b5", price: 4500, oldPrice: 5500, images: [] },
          { type: "Color", label: "Neon Red",   color: "#ff3b3b", price: 4500, oldPrice: 5500, images: [] },
          { type: "Color", label: "Neon Blue",  color: "#2980d9", price: 4500, oldPrice: 5500, images: [] },
          { type: "Color", label: "Neon Green", color: "#22a06b", price: 4500, oldPrice: 5500, images: [] },
          { type: "Color", label: "RGB",        color: "#9b59b6", price: 5800, oldPrice: 7000, images: [] },
          { type: "Mount", label: "Indoor",  price: 4500, images: [] },
          { type: "Mount", label: "Outdoor", price: 5500, images: [] },
        ],
        stock: "in_stock", active: true,
      },
      {
        name: "Vinyl Wall Wrap", sku: "vinyl-wall-wrap",
        price: 560, oldPrice: null,
        category: "Printing", badge: null,
        description: "Full-colour adhesive vinyl wall graphics for offices, retail showrooms and hospitality spaces. Easy to apply and remove.",
        image:  IMG + "Printing/one%20way%20vison/3.jpg",
        images: [IMG + "Printing/one%20way%20vison/3.jpg"],
        tags: ["Vinyl", "Wall Graphics", "Office"],
        features: ["Air-release adhesive vinyl", "Repositionable up to 24 hrs", "Matte or gloss finish"],
        variants: [
          { type: "Finish", label: "Matte",    color: "#e0e0e0", price: 560, images: [] },
          { type: "Finish", label: "Gloss",    color: "#b0d0ff", price: 560, images: [] },
          { type: "Finish", label: "Textured", color: "#c8b89a", price: 680, images: [] },
          { type: "Size", label: "Per sq.ft", price: 560,  images: [] },
          { type: "Size", label: "10×8 ft",   price: 4200, images: [] },
          { type: "Size", label: "Full wall",  price: 8500, images: [] },
        ],
        stock: "in_stock", active: true,
      },
    ];

    await Product.insertMany(sampleProducts);
    res.json({
      success: true,
      message: `${sampleProducts.length} products seeded with variants.`,
      ids: sampleProducts.map(p => p.sku),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════════════════════
   🚀  START SERVER
════════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 BluePriint API running on port ${PORT}`));
