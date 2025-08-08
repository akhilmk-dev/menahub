const express = require('express');
const { getOrders, createOrder, getOrderByVendor } = require('../controllers/orderController');
const router = express.Router();

router.get('/',getOrders);
router.post('/',createOrder);
router.get(`/:id`,getOrderByVendor);

module.exports = router;
