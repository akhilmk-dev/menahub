
const Order = require('../models/Order');
const catchAsync = require('../utils/catchAsync');
const axios = require('axios');

exports.getOrders = catchAsync(async (req, res, next) => {
   console.log(req.body)
});

exports.createOrder = catchAsync(async (req, res, next) => {
   const order = req.body;
   const data = {
      "order_id": order?.id || "",
      "fulfillment_id": "",
      "cancel_reason": null,
      "cancel_at": null,
      "created_at": order?.created_at || null,
      "email": order?.email || "",
      "name": order?.name || "",
      "order_number": order?.order_number || "",
      "payment_gate_way": order?.payment_gateway_names[0] || null,
      "phone": order?.phone || "",
      "total_discounts": order?.total_discounts || null,
      "total_price": order?.total_price || null,
      "total_tax": order?.total_tax || null,
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
            "name": item?.name || null,
            "price": item?.price || null,
            "product_id": item?.product_id || null,
            "sku": item?.sku || null,
            "total_discount": item?.total_discount || null,
            "title": item?.title || null,
            "quantity": item?.quantity || "",
            "variant_id": item?.variant_id,
            "vendor_name": item?.vendor,
            "fulfillment_item_id": "",
            "vendor_id": "68942697132fc9edcecbc190",
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
         }
      )
      )
   }
  
   const response = await axios.get(`${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/orders/${data?.order_id}/fulfillment_orders.json`,{
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN,
        'Content-Type': 'application/json',
      }
    });
   data.fulfillment_id = response?.data?.fulfillment_orders[0]?.id
   const finalData = data.line_items?.map(item=>({...item,fulfillment_item_id:item?.id}))
   console.log({...data,line_items:finalData});
   const newOrder = new Order({...data,line_items:finalData});
   await newOrder.save();
   res.status(200).json({message:"new order created"})

});
