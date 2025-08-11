const express = require('express');
const { getOrders, createOrder, getOrderByVendor, updateOrder, cancelOrder } = require('../controllers/orderController');
const router = express.Router();

router.get('/',getOrders);
router.post('/',createOrder);
router.get(`/:id`,getOrderByVendor);
router.post('/update',updateOrder);
router.post('/cancel',cancelOrder)

module.exports = router;
