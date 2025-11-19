const express = require('express');
const { createProduct, getProducts, deleteProduct, getProductById, updateProduct } = require('../controllers/productController');
const router = express.Router();

// POST /api/products
router.post("/", createProduct);
router.get("/",getProducts);
router.delete('/delete/:productId',deleteProduct);
router.get('/:productId',getProductById);
router.put('/update/:productId',updateProduct);

module.exports = router
