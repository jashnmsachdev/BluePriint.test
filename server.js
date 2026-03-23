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
   `image`  → primary/cover photo (used by shop card + cart)
   `images` → additional gallery photos (used by Quick View
               left/right carousel added in shop.html)
─────────────────────────────────────────────────────────── */
const ProductSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    price:       { type: Number, required: true },
    oldPrice:    { type: Number, default: null },
    category:    { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    image:       { type: String, default: "" },   // primary photo
    images:      { type: [String], default: [] }, // extra gallery photos
    badge:       { type: String, enum: ["popular", "sale", "new", "custom", null], default: null },
    tags:        { type: [String], default: [] },
    features:    { type: [String], default: [] },
    sku:         { type: String, default: "", trim: true },
    stock:       { type: String, default: "In Stock" },
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
   One-time sample data. Visit once, then remove or protect.
════════════════════════════════════════════════════════════ */
app.get("/api/seed", async (req, res) => {
  try {
    const existing = await Product.countDocuments();
    if (existing > 0) {
      return res.json({
        success: false,
        message: `DB already has ${existing} products — seeding skipped.`,
      });
    }

    const sampleProducts = [
      {
        name: "Backlit Flex Banner",
        price: 85, oldPrice: 110,
        category: "Printing", badge: "popular",
        description: "High-quality backlit flex for illuminated signage boards.",
        image:  "https://blue-priint.github.io/assets/images/Bluepriint%20Images/Printing/Backlit-Flex/3.jpg",
        images: [],
        tags: ["flex", "backlit", "banner"],
        features: ["UV-resistant ink", "Glossy finish", "Custom sizes"],
        sku: "PRT-BLF-001",
      },
      {
        name: "ACP Signage Board",
        price: 320,
        category: "Signage", badge: "new",
        description: "Aluminium composite panel signs for shops and offices.",
        image:  "https://blue-priint.github.io/assets/images/Bluepriint%20Images/Printing/Backlit-Flex/3.jpg",
        images: [],
        tags: ["ACP", "metal", "signboard"],
        features: ["3mm ACP sheet", "Digital print overlay", "Weatherproof"],
        sku: "SGN-ACP-001",
      },
      {
        name: "LED Glow Sign Board",
        price: 1200, oldPrice: 1500,
        category: "LED Screens", badge: "sale",
        description: "Custom LED neon or channel-letter glow sign boards.",
        image:  "https://blue-priint.github.io/assets/images/Bluepriint%20Images/Printing/Backlit-Flex/3.jpg",
        images: [],
        tags: ["LED", "glow", "neon"],
        features: ["Energy efficient", "Long life LEDs", "IP65 weatherproof"],
        sku: "LED-GLW-001",
      },
    ];

    await Product.insertMany(sampleProducts);
    res.json({ success: true, message: `${sampleProducts.length} sample products seeded.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════════════════════
   🚀  START SERVER
════════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 BluePriint API running on port ${PORT}`));
