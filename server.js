

dashboard.html
html


server (2).js
255 lines

js


shop.js
231 lines

js

connect my dashboard.html to shop.js and server.js align all three, also the costumer info in dashboard is not linked with server check that too

4:21 PM

Identified misaligned APIs and architected comprehensive integration fixes
Identified misaligned APIs and architected comprehensive integration fixes
Now I have a full picture of all three files. Here's what's broken:

shop.js is broken — it accidentally contains the entire server-side Mongoose/Express code. Only the first 2 lines are correct.
dashboard.html ADMIN_API_BASE — returns '' in production (should point to the Render URL like shop.js does).
Customers are hardcoded — no /api/customers endpoint in server.js, and dashboard loads from a static array instead of the API.
Product preview link opens shop.html generically — should pass the product ID.
Let me fix all three files:


Architected three-file integration linking dashboard, shop, and server components
Architected three-file integration linking dashboard, shop, and server components
Now I have everything I need. Let me build all three fixed files:


Created 2 files
Created 2 files
Now let me build the fixed dashboard.html with all the customer API wiring:


Edited 4 files, ran a command
Edited 4 files, ran a command
Now update the customers page HTML — add the search filter wiring, an "Add Customer" button, and the Actions column header:


Update customers page - wire search, add Actions column, add Add Customer button
Update customers page - wire search, add Actions column, add Add Customer button
Now add the Customer Modal HTML (insert it just before the product modal):


Add Customer modal HTML before the existing Product modal
Add Customer modal HTML before the existing Product modal
Now wire up the customer modal close on ESC and outside click, and add loadCustomersFromAPI() to init:


Edited 2 files
Edited 2 files
Now fix the product preview button to pass the product ID to shop.html:


Fix product preview button to pass product ID as URL param to shop.html
Fix product preview button to pass product ID as URL param to shop.html
Now copy all three files to outputs:


Copy files to outputs and verify key changes
Copy files to outputs and verify key changes
All checks pass. Let me present the files:


Presented 3 files
Presented 3 files
Here's everything that was fixed across all three files:

server.js — New Customer model + full CRUD routes Added a proper CustomerSchema (name, company, phone, email, city, orders, totalSpent, source, notes, lastContact) and five new routes: GET /api/customers, GET /api/customers/:id, POST, PUT, DELETE. The seed endpoint also now seeds sample customers when the DB is empty.

shop.js — Complete rewrite (was broken) The old file accidentally had the entire server.js Mongoose/Express code copy-pasted in after the first 2 lines. It's now a clean, fully client-side script with:

API_BASE auto-detection (localhost vs Render — matches server.js)
fetchProducts() and fetchProductById() — fetch wrappers aligned to your API envelope
applyFilters(), filterByCategory(), onSearchInput(), onSortChange(), filterByMaxPrice(), goToPage() — all filter/sort/page functions
openQuickView(id) — calls GET /api/products/:id for the modal
Cart system (localStorage) with add/remove/quantity/WhatsApp checkout
URL param support (?id=, ?cat=, ?q=) so the dashboard's product preview button (shop.html?id=...) works
dashboard.html — 6 fixes

ADMIN_API_BASE now points to https://bluepriint-test.onrender.com in production instead of returning an empty string — matches shop.js
Customer API layer — apiCustomers(), loadCustomersFromAPI(), updateCustomerCount() added
renderCustomers() now renders live API data with email, formatted last-contact date, and edit/delete action buttons
filterCustomers(q) wired to the customer search input (was previously unconnected)
Customer modal — full Add/Edit modal with all fields, saveCustomer(), deleteCustomer() wired to the server
init() now loads products and customers in parallel via Promise.all, and the product "👁 preview" button opens shop.html?id=PRODUCT_ID
Server
JS 
Shop
JS 
Dashboard
Code · HTML 
Claude reached its tool-use limit for this turn.





Claude is AI and can make mistakes. Please double-check responses.
Server · JS
Copy

const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
 
const app = express();
app.use(express.json());
app.use(cors());
 
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
   🧪 GET /api/seed  (one-time test data seeder)
   Visit once to populate DB, then remove or restrict.
════════════════════════════════════════════ */
app.get("/api/seed", async (req, res) => {
  try {
    const existingProducts = await Product.countDocuments();
    const existingCustomers = await Customer.countDocuments();
 
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
 





