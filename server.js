const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");

const app = express();
app.use(express.json());

// Explicit CORS — allows requests from any origin (GitHub Pages, local dev, etc.)
// The OPTIONS preflight must be handled BEFORE any routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health-check — lets the front-end "wake" the server before form submit
app.get('/health', (req, res) => res.json({ ok: true }));

/* ════════════════════════════════════════════
   🔗 MONGODB ATLAS CONNECTION
════════════════════════════════════════════ */
mongoose.connect(process.env.MONGO_URI)
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
   🧾 ORDER SCHEMA
   Covers both online and offline orders entered by admin.
   orderId is auto-generated as BP-XXXX (4-digit zero-padded).
════════════════════════════════════════════ */
const OrderSchema = new mongoose.Schema(
  {
    orderId:   { type: String, unique: true },              // e.g. "BP-1043" — set in pre-save
    customer:  { type: String, required: true, trim: true },
    company:   { type: String, default: "", trim: true },
    phone:     { type: String, default: "", trim: true },
    product:   { type: String, required: true, trim: true },
    category:  { type: String, default: "Other", trim: true }, // for analytics donut
    qty:       { type: Number, default: 1 },
    value:     { type: Number, required: true },            // total order value in ₹
    status:    { type: String, enum: ["new","pending","progress","complete","cancelled"], default: "new" },
    source:    { type: String, enum: ["offline","online","whatsapp","referral"], default: "offline" },
    notes:     { type: String, default: "" },
    orderDate: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Auto-generate orderId like "BP-1042" before saving
OrderSchema.pre("save", function() {
  if (this.orderId) return;
  this.orderId = `BP-${Date.now() % 9000 + 1000}`;
});

OrderSchema.index({ customer: "text", company: "text", product: "text", orderId: "text" });

const Order = mongoose.model("Order", OrderSchema);


/* ════════════════════════════════════════════
   👤 CUSTOMER SCHEMA
   Tracks every customer who has placed an order or submitted an enquiry.
   orders / totalSpent are updated manually via PUT when orders are processed.
════════════════════════════════════════════ */
const CustomerSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    company:    { type: String, default: "", trim: true },
    phone:      { type: String, required: true, trim: true },
    email:      { type: String, default: "", trim: true, lowercase: true },
    city:       { type: String, default: "", trim: true },
    orders:     { type: Number, default: 0 },              // total order count (increment on new order)
    totalSpent: { type: Number, default: 0 },              // lifetime spend in ₹
    source:     { type: String, enum: ["walk-in", "enquiry", "referral", "online", "other"], default: "other" },
    notes:      { type: String, default: "" },
    tags:       { type: [String], default: [] },
    lastContact:{ type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
  }
);

// Text index for search by name / company / phone
CustomerSchema.index({ name: "text", company: "text", phone: "text", email: "text" });

const Customer = mongoose.model("Customer", CustomerSchema);


/* ════════════════════════════════════════════
   💬 ENQUIRY SCHEMA
   Every contact-form submission from contact.html is saved here.
   The dashboard reads from this collection — no more hardcoded array.
════════════════════════════════════════════ */
const EnquirySchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    company:  { type: String, default: "",   trim: true },
    email:    { type: String, required: true, trim: true, lowercase: true },
    phone:    { type: String, required: true, trim: true },
    city:     { type: String, default: "",   trim: true },
    services: { type: [String], default: [] },           // chips selected by user
    message:  { type: String, required: true },
    priority: { type: String, enum: ["high", "med", "low"], default: "med" },
    status:   { type: String, enum: ["new", "contacted", "quoted", "closed"], default: "new" },
    source:   { type: String, default: "contact-form" }, // where the lead came from
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

EnquirySchema.index({ name: "text", company: "text", email: "text", message: "text" });

const Enquiry = mongoose.model("Enquiry", EnquirySchema);


/* ════════════════════════════════════════════
   💬 GET /api/enquiries
   Supports:
     ?status=   new | contacted | quoted | closed
     ?priority= high | med | low
     ?q=        full-text search
     ?sort=     newest | oldest
     ?page=     (default 1)
     ?limit=    (default 20)
════════════════════════════════════════════ */
app.get("/api/enquiries", async (req, res) => {
  try {
    const { status, priority, q, sort = "newest", page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status)   filter.status   = status;
    if (priority) filter.priority = priority;
    if (q)        filter.$text    = { $search: q };

    const sortObj = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [enquiries, total] = await Promise.all([
      Enquiry.find(filter).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Enquiry.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: enquiries,
      meta: { total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum },
    });
  } catch (err) {
    console.error("GET /api/enquiries error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🔍 GET /api/enquiries/:id
════════════════════════════════════════════ */
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


/* ════════════════════════════════════════════
   ➕ POST /api/enquiries  (PUBLIC — no admin key)
   Called directly from contact.html on form submit.
════════════════════════════════════════════ */
app.post("/api/enquiries", async (req, res) => {
  try {
    const { name, company, email, phone, city, services, message, source } = req.body;

    // Basic server-side validation
    if (!name || !email || !phone || !message) {
      return res.status(400).json({ success: false, error: "name, email, phone and message are required." });
    }

    const enquiry = new Enquiry({
      name, company, email, phone, city,
      services: Array.isArray(services) ? services : (services ? [services] : []),
      message,
      source: source || "contact-form",
      priority: "med",  // default; admin can update later
      status:   "new",
    });

    await enquiry.save();

    res.status(201).json({ success: true, data: enquiry });
  } catch (err) {
    console.error("POST /api/enquiries error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   ✏️  PUT /api/enquiries/:id  (Admin — update status / priority)
════════════════════════════════════════════ */
app.put("/api/enquiries/:id", requireAdminKey, async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!enquiry) return res.status(404).json({ success: false, error: "Enquiry not found" });
    res.json({ success: true, data: enquiry });
  } catch (err) {
    console.error("PUT /api/enquiries/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🗑️  DELETE /api/enquiries/:id
════════════════════════════════════════════ */
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
   👥 GET /api/customers
   Supports:
     ?q=       full-text search (name / company / phone / email)
     ?city=    city filter
     ?source=  source filter
     ?sort=    newest | oldest | name_asc | spent_desc | orders_desc
     ?page=    page number (default 1)
     ?limit=   page size   (default 20)
════════════════════════════════════════════ */
app.get("/api/customers", async (req, res) => {
  try {
    const {
      q,
      city,
      source,
      sort  = "newest",
      page  = 1,
      limit = 20,
    } = req.query;

    const filter = {};

    if (city)   filter.city   = { $regex: new RegExp(`^${city}$`, "i") };
    if (source) filter.source = source;
    if (q)      filter.$text  = { $search: q };

    const sortMap = {
      newest:      { createdAt: -1 },
      oldest:      { createdAt:  1 },
      name_asc:    { name:       1 },
      spent_desc:  { totalSpent:-1 },
      orders_desc: { orders:    -1 },
    };
    const sortObj = sortMap[sort] || { createdAt: -1 };

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [customers, total] = await Promise.all([
      Customer.find(filter).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Customer.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: customers,
      meta: { total, page: pageNum, totalPages: Math.ceil(total / limitNum), limit: limitNum },
    });
  } catch (err) {
    console.error("GET /api/customers error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🔍 GET /api/customers/:id
════════════════════════════════════════════ */
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


/* ════════════════════════════════════════════
   ➕ POST /api/customers  (Add customer)
════════════════════════════════════════════ */
app.post("/api/customers", requireAdminKey, async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    console.error("POST /api/customers error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   ✏️  PUT /api/customers/:id  (Update customer)
════════════════════════════════════════════ */
app.put("/api/customers/:id", requireAdminKey, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!customer) return res.status(404).json({ success: false, error: "Customer not found" });
    res.json({ success: true, data: customer });
  } catch (err) {
    console.error("PUT /api/customers/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🗑️  DELETE /api/customers/:id
════════════════════════════════════════════ */
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


/* ════════════════════════════════════════════
   🧾 GET /api/orders
   ?q=      full-text search
   ?status= new|pending|progress|complete|cancelled
   ?sort=   newest|oldest|value_desc
   ?page=   (default 1)  ?limit= (default 50)
════════════════════════════════════════════ */
app.get("/api/orders", async (req, res) => {
  try {
    const { q, status, sort = "newest", page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (q)      filter.$text  = { $search: q };

    const sortMap = {
      newest:     { orderDate: -1 },
      oldest:     { orderDate:  1 },
      value_desc: { value:     -1 },
    };
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort(sortMap[sort] || { orderDate: -1 }).skip(skip).limit(limitNum).lean(),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, data: orders, meta: { total, page: pageNum, totalPages: Math.ceil(total / limitNum) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🔍 GET /api/orders/:id
════════════════════════════════════════════ */
app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   ➕ POST /api/orders  (admin only)
════════════════════════════════════════════ */
app.post("/api/orders", requireAdminKey, async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    console.error("POST /api/orders error:", err.message);
    // If orderId happened to collide (rare), retry once with a different suffix
    if (err.code === 11000 && err.message.includes("orderId")) {
      try {
        const order2 = new Order(req.body);
        order2.orderId = `BP-${Date.now() % 9000 + 1000}-${Math.floor(Math.random()*9)+1}`;
        await order2.save();
        return res.status(201).json({ success: true, data: order2 });
      } catch (err2) {
        return res.status(500).json({ success: false, error: err2.message });
      }
    }
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   ✏️  PUT /api/orders/:id  (update status / fields)
════════════════════════════════════════════ */
app.put("/api/orders/:id", requireAdminKey, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🗑️  DELETE /api/orders/:id
════════════════════════════════════════════ */
app.delete("/api/orders/:id", requireAdminKey, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    res.json({ success: true, message: "Order deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   📊 GET /api/stats
   Returns all numbers needed by the dashboard in one call:
   - totalOrders, monthlyRevenue, openEnquiries, totalCustomers
   - revenueByMonth  (last 7 months, for bar chart)
   - revenueByCategory (for donut chart)
   - recentOrders (last 5, for dashboard preview table)
════════════════════════════════════════════ */
app.get("/api/stats", async (req, res) => {
  try {
    const now       = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalOrders,
      monthlyRevenue,
      lastMonthRevenue,
      openEnquiries,
      totalCustomers,
      revenueByMonthRaw,
      revenueByCategoryRaw,
      recentOrders,
    ] = await Promise.all([
      // Total orders count
      Order.countDocuments(),

      // This month's revenue (sum of complete + progress + pending + new orders)
      Order.aggregate([
        { $match: { orderDate: { $gte: startOfMonth }, status: { $ne: "cancelled" } } },
        { $group: { _id: null, total: { $sum: "$value" } } },
      ]),

      // Last month's revenue (for % change)
      Order.aggregate([
        { $match: { orderDate: { $gte: startOfLastMonth, $lt: startOfMonth }, status: { $ne: "cancelled" } } },
        { $group: { _id: null, total: { $sum: "$value" } } },
      ]),

      // Open enquiries = status 'new'
      Enquiry.countDocuments({ status: "new" }),

      // Total customers
      Customer.countDocuments(),

      // Revenue by month — last 7 months
      Order.aggregate([
        {
          $match: {
            orderDate: { $gte: new Date(now.getFullYear(), now.getMonth() - 6, 1) },
            status: { $ne: "cancelled" },
          },
        },
        {
          $group: {
            _id: { year: { $year: "$orderDate" }, month: { $month: "$orderDate" } },
            revenue: { $sum: "$value" },
            orders:  { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),

      // Revenue by category (for donut)
      Order.aggregate([
        { $match: { orderDate: { $gte: startOfMonth }, status: { $ne: "cancelled" } } },
        { $group: { _id: "$category", revenue: { $sum: "$value" } } },
        { $sort: { revenue: -1 } },
        { $limit: 6 },
      ]),

      // Last 5 orders for dashboard preview
      Order.find().sort({ orderDate: -1 }).limit(5).lean(),
    ]);

    const thisMonth = monthlyRevenue[0]?.total || 0;
    const lastMonth = lastMonthRevenue[0]?.total || 0;
    const revenueChange = lastMonth > 0
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : 0;

    // Format month labels
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const revenueByMonth = revenueByMonthRaw.map(r => ({
      month:   MONTHS[r._id.month - 1],
      val:     r.revenue,
      orders:  r.orders,
      highlight: r._id.month === now.getMonth() + 1 && r._id.year === now.getFullYear(),
    }));

    // Format category donut (convert to percentages)
    const totalCatRevenue = revenueByCategoryRaw.reduce((s, r) => s + r.revenue, 0);
    const donutColors = ["#2980d9","#f0a500","#22a06b","#0d3b6e","#e53935","#c8d4e4"];
    const revenueByCategory = revenueByCategoryRaw.map((r, i) => ({
      label:   r._id || "Other",
      val:     totalCatRevenue > 0 ? Math.round((r.revenue / totalCatRevenue) * 100) : 0,
      revenue: r.revenue,
      color:   donutColors[i] || "#c8d4e4",
    }));

    res.json({
      success: true,
      data: {
        totalOrders,
        monthlyRevenue:  thisMonth,
        lastMonthRevenue: lastMonth,
        revenueChange,
        openEnquiries,
        totalCustomers,
        revenueByMonth,
        revenueByCategory,
        recentOrders,
      },
    });
  } catch (err) {
    console.error("GET /api/stats error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🧪 GET /api/seed  (one-time test data seeder)
   Visit once to populate DB, then remove or restrict.
════════════════════════════════════════════ */
app.get("/api/seed", async (req, res) => {
  try {
    const existingProducts  = await Product.countDocuments();
    const existingCustomers = await Customer.countDocuments();
    const existingOrders    = await Order.countDocuments();

    const seeded = [];

    if (existingProducts === 0) {
      const sampleProducts = [
        {
          name: "Backlit Flex Banner",
          price: 85, oldPrice: 110,
          category: "Printing", badge: "popular",
          description: "High-quality backlit flex for illuminated signage boards.",
          image: "https://blue-priint.github.io/assets/images/Bluepriint%20Images/Printing/Backlit-Flex/3.jpg",
          tags: ["flex", "backlit", "banner"],
          features: ["UV-resistant ink", "Glossy finish", "Custom sizes"],
          sku: "PRT-BLF-001",
        },
        {
          name: "ACP Signage Board",
          price: 320, oldPrice: null,
          category: "Signage", badge: "new",
          description: "Aluminium composite panel signs for shops and offices.",
          image: "https://blue-priint.github.io/assets/images/Bluepriint%20Images/Printing/Backlit-Flex/3.jpg",
          tags: ["ACP", "metal", "signboard"],
          features: ["3mm ACP sheet", "Digital print overlay", "Weatherproof"],
          sku: "SGN-ACP-001",
        },
        {
          name: "LED Glow Sign Board",
          price: 1200, oldPrice: 1500,
          category: "LED Screens", badge: "sale",
          description: "Custom LED neon or channel-letter glow sign boards.",
          image: "https://blue-priint.github.io/assets/images/Bluepriint%20Images/Printing/Backlit-Flex/3.jpg",
          tags: ["LED", "glow", "neon"],
          features: ["Energy efficient", "Long life LEDs", "IP65 weatherproof"],
          sku: "LED-GLW-001",
        },
      ];
      await Product.insertMany(sampleProducts);
      seeded.push(`${sampleProducts.length} products`);
    }

    if (existingCustomers === 0) {
      const sampleCustomers = [
        { name: "Arjun Kumar",  company: "Bajaj Dealership",  phone: "+91 98100 11111", email: "arjun@bajaj.com",    city: "Delhi",     orders: 8, totalSpent: 72000,  source: "referral", lastContact: new Date("2025-03-14") },
        { name: "Rahul Verma",  company: "Cut & Style Salon", phone: "+91 99100 22222", email: "rahul@style.in",     city: "Delhi",     orders: 4, totalSpent: 28000,  source: "enquiry",  lastContact: new Date("2025-03-13") },
        { name: "Vikram Singh", company: "Hero Showroom",     phone: "+91 97000 33333", email: "vikram@hero.com",    city: "Delhi",     orders: 12,totalSpent: 104000, source: "walk-in",  lastContact: new Date("2025-03-12") },
        { name: "Shalini Mehta",company: "Mehta Boutique",    phone: "+91 88000 44444", email: "shalini@mehta.in",   city: "Gurgaon",   orders: 3, totalSpent: 19500,  source: "online",   lastContact: new Date("2025-03-10") },
        { name: "Deepak Rao",   company: "Rao Foods",         phone: "+91 87000 55555", email: "deepak@raofoods.com",city: "Noida",     orders: 6, totalSpent: 54200,  source: "referral", lastContact: new Date("2025-03-09") },
        { name: "Priya Singh",  company: "Singh Pharma",      phone: "+91 96000 66666", email: "priya@singhrx.in",   city: "Faridabad", orders: 2, totalSpent: 15200,  source: "enquiry",  lastContact: new Date("2025-03-08") },
        { name: "Neha Gupta",   company: "Gupta Salon",       phone: "+91 95000 77777", email: "neha@guptasalon.in", city: "Delhi",     orders: 5, totalSpent: 32500,  source: "walk-in",  lastContact: new Date("2025-03-07") },
        { name: "Ravi Sharma",  company: "Sharma Traders",    phone: "+91 94000 88888", email: "ravi@sharma.com",    city: "Delhi",     orders: 7, totalSpent: 48000,  source: "referral", lastContact: new Date("2025-03-06") },
      ];
      await Customer.insertMany(sampleCustomers);
      seeded.push(`${sampleCustomers.length} customers`);
    }

    const existingEnquiries = await Enquiry.countDocuments();

    if (existingEnquiries === 0) {
      const sampleEnquiries = [
        { name:"Manish Kapoor", company:"Kapoor Mall",    email:"manish@kapoor.com",        phone:"+91 98100 11234", city:"Delhi",     services:["Signage Solutions","LED Screens"],      message:"Complete signage for a 3-floor mall in Janakpuri. 60,000 sq.ft. Need ACP fascia, 3D letters and digital directories.", priority:"high", status:"new"   },
        { name:"Shalini Verma", company:"Verma Salon",    email:"shalini@verma.in",          phone:"+91 97120 45678", city:"Gurgaon",   services:["Internal Branding","Printing"],         message:"Complete internal branding for new salon in DLF Phase 4 — mirror wraps, floor vinyl, menu boards, window frosting.",    priority:"med",  status:"new"   },
        { name:"Tarun Bhatia",  company:"TB Motors",      email:"tarun@tbmotors.com",        phone:"+91 88230 67890", city:"Noida",     services:["OOH Advertising","BTL / Promotions"],  message:"2 hoardings on NH8 for 6 months + 50 roll-up standees for auto expo. Need pricing by Friday.",                       priority:"high", status:"contacted" },
        { name:"Pooja Arora",   company:"Arora Sweets",   email:"pooja@arorasweets.in",      phone:"+91 99010 23456", city:"Delhi",     services:["Signage Solutions","Printing"],         message:"Opening 2 new sweet shops in Rohini and Pitampura — glow boards, ACP panels and backlit menus.",                       priority:"med",  status:"new"   },
        { name:"Nitin Saxena",  company:"Saxena Hospital",email:"nitin@saxena.hospital",     phone:"+91 95500 34567", city:"Delhi",     services:["Signage Solutions"],                   message:"Hospital wayfinding project — ~200 signs across 4 floors. ISO compliant, bilingual (Hindi + English).",                priority:"low",  status:"quoted"},
        { name:"Kavita Reddy",  company:"Reddy Fashion",  email:"kavita@reddyfashion.in",    phone:"+91 87650 45678", city:"Faridabad", services:["Internal Branding","Printing"],         message:"New flagship store launch — wall graphics, hanging danglers, window film and acrylic brand board at entrance.",        priority:"high", status:"new"   },
        { name:"Saurabh Jain",  company:"Jain Jewellers", email:"saurabh@jainjewellers.com", phone:"+91 96000 56789", city:"Delhi",     services:["Signage Solutions","LED Screens"],      message:"Luxury jewellery store redesign — gold lettering, LED neon sign for window, digital display inside.",                 priority:"med",  status:"new"   },
      ];
      await Enquiry.insertMany(sampleEnquiries);
      seeded.push(`${sampleEnquiries.length} enquiries`);
    }

    if (existingOrders === 0) {
      const now = new Date();
      const d = (daysAgo) => new Date(now - daysAgo * 86400000);
      const sampleOrders = [
        { customer:"Ravi Sharma",   company:"Sharma Traders",    phone:"+91 94000 88888", product:"ACP Fascia Sign Board",  category:"Signage",  qty:2,  value:6400,  status:"new",      source:"offline", orderDate: d(0)  },
        { customer:"Neha Gupta",    company:"Gupta Salon",       phone:"+91 95000 77777", product:"Backlit Flex Banner",    category:"Printing", qty:5,  value:4250,  status:"progress", source:"whatsapp",orderDate: d(1)  },
        { customer:"Ajay Patel",    company:"Patel Electronics", phone:"+91 93000 11111", product:"3D LED Facade Sign",     category:"LED Screens",qty:1, value:8500,  status:"complete", source:"online",  orderDate: d(2)  },
        { customer:"Sunita Mehta",  company:"Mehta Boutique",    phone:"+91 88000 44444", product:"Floor Vinyl Graphics",  category:"Printing", qty:10, value:6500,  status:"complete", source:"offline", orderDate: d(3)  },
        { customer:"Vikram Joshi",  company:"JK Enterprises",   phone:"+91 97000 33333", product:"Canvas Print",           category:"Printing", qty:3,  value:3600,  status:"pending",  source:"offline", orderDate: d(4)  },
        { customer:"Priya Singh",   company:"Singh Pharma",      phone:"+91 96000 66666", product:"One Way Vision Film",   category:"Signage",  qty:8,  value:7600,  status:"complete", source:"referral",orderDate: d(5)  },
        { customer:"Arjun Kumar",   company:"Bajaj Dealership",  phone:"+91 98100 11111", product:"Glow Sign Board",       category:"Signage",  qty:4,  value:8800,  status:"complete", source:"offline", orderDate: d(6)  },
        { customer:"Meera Nair",    company:"Nair Interiors",    phone:"+91 91000 22222", product:"Vinyl Wall Wrap",       category:"Printing", qty:20, value:11200, status:"cancelled",source:"offline", orderDate: d(7)  },
        { customer:"Rahul Verma",   company:"Verma & Sons",      phone:"+91 99100 22222", product:"Acrylic UV Print",      category:"Printing", qty:6,  value:10800, status:"complete", source:"online",  orderDate: d(8)  },
        { customer:"Deepak Rao",    company:"Rao Foods",         phone:"+91 87000 55555", product:"Roll-up Standee",       category:"Printing", qty:10, value:14000, status:"complete", source:"offline", orderDate: d(9)  },
        { customer:"Arjun Kumar",   company:"Bajaj Dealership",  phone:"+91 98100 11111", product:"ACP Fascia Panel",      category:"Signage",  qty:3,  value:9600,  status:"complete", source:"offline", orderDate: d(14) },
        { customer:"Vikram Singh",  company:"Hero Showroom",     phone:"+91 97000 33333", product:"LED Glow Sign Board",   category:"LED Screens",qty:2,value:24000, status:"complete", source:"referral",orderDate: d(20) },
        { customer:"Deepak Rao",    company:"Rao Foods",         phone:"+91 87000 55555", product:"Backlit Flex Banner",   category:"Printing", qty:8,  value:6800,  status:"complete", source:"offline", orderDate: d(30) },
        { customer:"Neha Gupta",    company:"Gupta Salon",       phone:"+91 95000 77777", product:"Mirror Wrap Vinyl",     category:"Signage",  qty:4,  value:5600,  status:"complete", source:"whatsapp",orderDate: d(40) },
        { customer:"Ravi Sharma",   company:"Sharma Traders",    phone:"+91 94000 88888", product:"Canvas Print",          category:"Printing", qty:6,  value:7200,  status:"complete", source:"offline", orderDate: d(50) },
      ];
      await Order.insertMany(sampleOrders);
      seeded.push(`${sampleOrders.length} orders`);
    }

    if (seeded.length === 0) {
      return res.json({ success: false, message: "DB already populated — seeding skipped." });
    }

    res.json({ success: true, message: `Seeded: ${seeded.join(" + ")}.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/* ════════════════════════════════════════════
   🚀 START SERVER
════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
