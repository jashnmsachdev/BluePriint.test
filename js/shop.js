async function loadProducts() {

const res = await fetch("/api/products");

const data = await res.json();

const container = document.getElementById("products");

data.forEach(product => {

container.innerHTML += `
<div class="product">

<img src="${product.image}" />

<h3>${product.name}</h3>

<p>₹${product.price}</p>

</div>
`;

});

}

loadProducts();
