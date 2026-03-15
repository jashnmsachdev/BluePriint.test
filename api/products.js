import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

export default async function handler(req, res) {

const client = new MongoClient(uri);

try {

await client.connect();

const db = client.db("bluepriint");
const products = db.collection("products");

if (req.method === "GET") {

const allProducts = await products.find({}).toArray();

res.status(200).json(allProducts);

}

} catch (error) {

res.status(500).json({ error: error.message });

} finally {

await client.close();

}

}
