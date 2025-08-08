const express = require('express');
const { getOrders, createOrder, getOrderByVendor, updateOrder } = require('../controllers/orderController');
const router = express.Router();

router.get('/',getOrders);
router.post('/',createOrder);
router.get(`/:id`,getOrderByVendor);
router.post('/update',updateOrder);

module.exports = router;
