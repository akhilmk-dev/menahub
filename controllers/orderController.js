
const { handleOrderEdit, getVendorOrders } = require('../helper/orderHelper');
const Order = require('../models/Order');
const catchAsync = require('../utils/catchAsync');
const axios = require('axios');
const { NotFoundError } = require('../utils/customErrors');

// get all orders
exports.getOrders = catchAsync(async (req, res, next) => {
   const page = parseInt(req.query.page) || 1;
   const limit = parseInt(req.query.limit) || 20;
   const skip = (page - 1) * limit;

   let sort = { createdAt: -1 }; 
   if (req.query.sortBy) {
      sort = {};
      const sortParams = req.query.sortBy.split(',');
      sortParams.forEach(param => {
         const [field, order] = param.split(':');
         sort[field] = order === 'asc' ? 1 : -1;
      });
   }

   const search = req.query.search;
   let filter = {};

   if (search) {
      const regex = new RegExp(search, 'i'); 
      filter = {
         $or: [
            { order_number: regex },
            { 'customer.firstname': regex },
            { 'customer.lastname': regex }
         ]
      };
   }

   const orders = await Order.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit);

   const total = await Order.countDocuments(filter);

   res.status(200).json({
      status: 'success',
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: orders,
   });
});


//create order
exports.createOrder = catchAsync(async (req, res, next) => {
   const order = req.body;
   const data = {
      "order_id": order?.id || "",
      "fulfillment_id": "",
      "cancel_reason": null,
      "cancelled_at": null,
      "created_at": order?.created_at || null,
      "email": order?.email || "",
      "name": order?.name || "",
      "order_number": order?.order_number || "",
      "payment_gate_way": order?.payment_gateway_names[0] || null,
      "phone": order?.phone || "",
      "financial_status": order?.financial_status || "",
      "fulfillment_status": order?.fulfillment_status || "",
      "total_discounts": order?.total_discounts || null,
      "total_price": order?.total_price || null,
      "total_tax": order?.total_tax || null,
      "subtotal_price":order?.subtotal_price || null,
      "shipping_address": {
         "first_name": order?.shipping_address?.first_name || null,
         "last_name": order?.shipping_address?.last_name || null,
         "address1": order?.shipping_address?.address1 || null,
         "address2": order?.shipping_address?.address2 || null,
         "company": order?.shipping_address?.company || null,
         "phone": order?.shipping_address?.phone || null,
         "city": order?.shipping_address?.city || null,
         "country": order?.shipping_address?.country || null,
         "country_code": order?.shipping_address?.country_code || null,
         "latitude": order?.shipping_address?.latitude || null,
         "longitude": order?.shipping_address?.longitude || null
      },
      "customer": {
         "id": order?.customer?.id || null,
         "created_at": order?.customer?.created_at || null,
         "first_name": order?.customer?.first_name || null,
         "last_name": order?.customer?.last_name || null,
         "email": order?.customer?.email || null,
         "currency": order?.customer?.currency || null,
         "default_address": {
            "id": order?.customer?.default_address?.id || null,
            "first_name": order?.customer?.default_address?.first_name || null,
            "last_name": order?.customer?.default_address?.last_name || null,
            "address1": order?.customer?.default_address?.address1 || null,
            "address2": null,
            "city": order?.customer?.default_address?.city || null,
            "country": order?.customer?.default_address?.country || null,
            "country_code": order?.customer?.default_address?.country_code || null,
            "phone": order?.customer?.default_address?.phone || null
         }
      },

      "line_items": order?.line_items?.map(item => (
         {
            "id": item?.id,
            "name": item?.name || null,
            "price": item?.price || null,
            "product_id": item?.product_id || null,
            "sku": item?.sku || null,
            "total_discount": item?.total_discount || null,
            "title": item?.title || null,
            "quantity": item?.quantity || "",
            "variant_id": item?.variant_id,
            "vendor_name": item?.vendor,
            "deleted_date":null,
            "fulfillment_status":item?.fulfillment_status || "",
            "fulfillment_item_id": "",
            "vendor_id": "68942697132fc9edcecbc190"
         }
      )
      )
   }

   const response = await axios.get(`${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/orders/${data?.order_id}/fulfillment_orders.json`, {
      headers: {
         'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN,
         'Content-Type': 'application/json',
      }
   });
   
   data.fulfillment_id = response?.data?.fulfillment_orders[0]?.id
   const finalData = data.line_items?.map(item => ({ ...item, fulfillment_item_id: item?.id }))
   const newOrder = new Order({ ...data, line_items: finalData });
   await newOrder.save();
   res.status(200).json({ message: "new order created" })

});

//get all orders by id
exports.getOrderByVendor = catchAsync(async (req, res, next) => {
   const vendorId = req.params.id
   const page = parseInt(req.query.page) || 1;
   const limit = parseInt(req.query.limit) || 10;

   const result = await getVendorOrders(vendorId, page, limit);
   res.status(200).json({ status: "success", message: "orders fetched successfully", data: result })
});

//update order
exports.updateOrder = catchAsync(async (req, res, next) => {
   const orderEditPayload = req.body;

   const response = await handleOrderEdit(orderEditPayload);

   res.status(200).json({ status: "success", message: "Order updated successfully", data: response?.data });
});

//Cancell order
exports.cancelOrder = catchAsync(async(req,res,next)=>{
     const orderCancelPayload = req.body;
     const order = await Order.findOne({ order_id: orderCancelPayload.id });
     order.cancelled_at = orderCancelPayload?.cancelled_at;
     order.cancel_reason = orderCancelPayload?.cancel_reason;
     order.financial_status = orderCancelPayload?.financial_status;
     const now = new Date();
     order.line_items = order.line_items.map(item => ({
       ...item,
       deleted_date: now
     }));
     const data= await order.save();
     res.status(200).json({ status: "success", message: "Order Cancelled successfully", data: data });
})

// get full order details
exports.getOrderById = catchAsync(async(req,res,next)=>{
   const data = await Order.findById(req.params.id);
   if(!data){
      return NotFoundError("Order not found")
   }
   return res.status(200).json({status:"success",messgae:"Product details fetched successfully",data:data})
})