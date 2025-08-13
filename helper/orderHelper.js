import Order from "../models/Order.js";
import axios from 'axios';
export const getVendorOrders = async (vendorId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  // Step 1: Get orders that include at least one line item for the vendor
  const orders = await Order.find({ "line_items.vendor_id": vendorId })
    .sort({ createdAt: -1 }) // Optional: latest first
    .skip(skip)
    .limit(limit)
    .lean();

  // Step 2: Filter out non-vendor line items in each order
  const filteredOrders = orders.map(order => {
    const vendorLineItems = order.line_items.filter(item =>
      item.vendor_id?.toString() === vendorId.toString()
    );

    return {
      ...order,
      line_items: vendorLineItems
    };
  });

  // Step 3: Count total matching orders (not line items)
  const totalOrders = await Order.countDocuments({ "line_items.vendor_id": vendorId });

  return {
    totalOrders,
    page,
    limit,
    totalPages: Math.ceil(totalOrders / limit),
    orders: filteredOrders
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
        const existsInDB = order.line_items?.find(li=>li.id == shopifyLineItemId);
  
        if (newLineItem && !existsInDB) {
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
        }else{
          const index = order.line_items.findIndex(
            li => li.id.toString() === shopifyLineItemId.toString()
          );
        
          if (index !== -1) {
            const fulfillment_item_id = fulfillmentMap[shopifyLineItemId];
        
            order.line_items[index] = {
              ...order.line_items[index], // keep other existing fields
              name: newLineItem.name,
              price: parseFloat(newLineItem.price),
              quantity: Number(newLineItem?.quantity) + Number(delta),
              sku: newLineItem.sku,
              product_id: newLineItem.product_id?.toString(),
              variant_id: newLineItem.variant_id?.toString(),
              title: newLineItem.title,
              fulfillment_item_id: fulfillment_item_id?.toString() || null,
              fulfillment_status: newLineItem?.fulfillment_status || "",
              vendor_name: newLineItem.vendor,
              vendor_id: "68942697132fc9edcecbc190"
            };
          }
        }
      }
  
      // 5. Handle line item removals
      for (const item of line_items.removals) {
        const shopifyLineItemId = item.id;
        // Use fulfillment_item_id (not internal Mongo id)
        order.line_items = order.line_items.map(
          li => {
            if(li.id == shopifyLineItemId.toString()){
              if(li?.quantity - item?.delta <=0){
                return {...li,deleted_date:new Date().toISOString()}
              }else{
                return {...li,quantity:li?.quantity - item?.delta}
              }
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
 