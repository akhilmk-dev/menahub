import Order from "../models/Order.js";
import axios from 'axios';
export const getVendorLineItems = async (vendorId, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
  
    // Step 1: Fetch orders that contain this vendor's line items
    const orders = await Order.find({ "line_items.vendor_id": vendorId })
      .sort({ createdAt: -1 }) // optional: sort by latest
      .skip(skip)
      .limit(limit)
      .lean();
  
    // Step 2: Flatten line items for the vendor
    const vendorLineItems = [];
  
    for (const order of orders) {
      const relevantLineItems = order.line_items.filter(item =>
        item.vendor_id?.toString() === vendorId.toString()
      );
  
      relevantLineItems.forEach(item => {
        vendorLineItems.push({
          ...item,
          order_id: order.order_id,
          order_number: order.order_number,
          payment_gate_way: order.payment_gate_way,
          fulfillment_id: order.fulfillment_id,
          shipping_address: order.shipping_address,
          customer: order.customer
        });
      });
    }
  
    // Optional: count total number of matching orders (not line items)
    const totalOrders = await Order.countDocuments({ "line_items.vendor_id": vendorId });
  
    return {
      totalOrders,
      page,
      limit,
      totalPages: Math.ceil(totalOrders / limit),
      line_items: vendorLineItems
    };
  };
  
  export const handleOrderEdit = async (orderEditPayload) => {
    try {
      const { order_id, line_items } = orderEditPayload.order_edit;
  
      // 1. Find existing order
      const order = await Order.findOne({ order_id });
  
      if (!order) {
        console.error(`Order with ID ${order_id} not found.`);
        return;
      }
  
      // 2. Fetch full order data
      const shopifyOrderResp = await axios.get(
        `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/orders/${order_id}.json`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN
          }
        }
      );
      const shopifyOrder = shopifyOrderResp.data.order;
  
      // 3. Fetch fulfillment orders to get fulfillment item IDs
      const fulfillmentResp = await axios.get(
        `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/orders/${order_id}/fulfillment_orders.json`,
        {
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
  
      const fulfillmentOrders = fulfillmentResp.data.fulfillment_orders || [];
  
      // Create a map: Shopify line_item_id → fulfillment_item_id
      const fulfillmentMap = {};
      fulfillmentOrders.forEach(fOrder => {
        fOrder.line_items.forEach(fItem => {
          fulfillmentMap[fItem.line_item_id] = fItem.id;
        });
      });
  
      // 4. Handle line item additions
      for (const item of line_items.additions) {
        const shopifyLineItemId = item.id;
        const delta = item.delta || 1;
  
        const newLineItem = shopifyOrder.line_items.find(li => li.id === shopifyLineItemId);
  
        if (newLineItem) {
          const fulfillment_item_id = fulfillmentMap[shopifyLineItemId];
  
          order.line_items.push({
            id: newLineItem.id,
            name: newLineItem.name,
            price: parseFloat(newLineItem.price),
            quantity: delta,
            sku: newLineItem.sku,
            product_id: newLineItem.product_id?.toString(),
            variant_id: newLineItem.variant_id?.toString(),
            title: newLineItem.title,
            total_discount: 0,
            deleted_date:null,
            fulfillment_item_id: fulfillment_item_id?.toString() || null,
            fulfillment_status: newLineItem?.fulfillment_statusv||"",
            vendor_name: newLineItem.vendor,
            vendor_id: "68942697132fc9edcecbc190" // replace with dynamic logic if needed
          });
        }
      }
  
      // 5. Handle line item removals
      for (const item of line_items.removals) {
        const shopifyLineItemId = item.id;
        // Use fulfillment_item_id (not internal Mongo id)
        order.line_items = order.line_items.map(
          li => {
            if(li.id !== shopifyLineItemId.toString()){
              return {...li,deleted_date:new Date().toISOString()}
            }else{
              return li
            }
          }
        );
      }
  
      // 6. Save the updated order
      const data = await order.save();
      return data;
  
    } catch (error) {
      console.error('Error handling order edit:', error?.response?.data || error.message);
    }
  };
 