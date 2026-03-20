npm init -y
npm install express mongoose cors

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

/* 🔗 CONNECT TO MONGODB ATLAS */
mongoose.connect("mongodb+srv://admin:Strong!12@cluster0.zfckuvh.mongodb.net/bluepriint?retryWrites=true&w=majority")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

/* 📦 PRODUCT SCHEMA */
const ProductSchema = new mongoose.Schema({
  name: String,
  price: String,
  category: String,
  image: String,
  stock: String
});

const Product = mongoose.model("Product", ProductSchema);

/* ➕ ADD PRODUCT */
app.post("/add-product", async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.send("Product Saved");
  } catch (err) {
    res.status(500).send(err);
  }
});

/* 📥 GET PRODUCTS */
app.get("/products", async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

/* 🚀 START SERVER */
app.listen(3000, () => console.log("Server running on port 3000"));
