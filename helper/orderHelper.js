import Order from "../models/Order.js";
import axios from 'axios';
import RemovedLineItem from "../models/RemovedLineItem.js";

export const getVendorOrders = async (vendorId, page = 0, limit = 10,search, financial_status,sortBy) => {
  const skip = page * limit;

  let sort = { createdAt: -1 };
   if (sortBy) {
      sort = {};
      const sortParams = sortBy.split(',');
      sortParams.forEach(param => {
         const [field, order] = param.split(':');
         sort[field] = order === 'asc' ? 1 : -1;
      });
   }

 let filter = {
  deleted_at: { $in: [null, undefined] }
 };
 
    // 🔍 Search filter
    if (search) {
       const regex = new RegExp(search, 'i');
       filter.$or = [
          { order_number: regex },
          { 'customer.firstname': regex },
          { 'customer.lastname': regex }
       ];
    }
 
    // 🏷️ Vendor filter (match orders where at least one line_item has this vendor_id)
    if (vendorId) {
       filter['line_items'] = {
          $elemMatch: { vendor_id :vendorId}
       };
    }
 
    // 💳 Financial status filter
    if (financial_status) {
       filter.financial_status = financial_status;
    }

    // 🧾 Fetch matching orders
    const orders = await Order.find(filter)
       .sort(sort)
       .skip(skip)
       .limit(limit)
       .lean(); // use lean for performance if you're not modifying Mongoose doc methods
 
    const total = await Order.countDocuments(filter);
    
 
    // 🔁 Filter out unrelated line_items if vendor_id is used
    const filteredOrders = orders.map(order => {
       if (vendorId) {
          order.line_items = order.line_items.filter(item => item.vendor_id == vendorId);
       }
       return order;
  });

  return {
    status: 'success',
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    data: filteredOrders
  };
};
  
export const handleOrderEdit = async (orderEditPayload) => {
  try {
    const { order_id, line_items } = orderEditPayload;

    let order = await Order.findOne({ order_id });

    if (!order) {
      console.error(`Order with ID ${order_id} not found.`);
      return;
    }

    const shopifyOrderResp = await axios.get(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/orders/${order_id}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN
        }
      }
    );
    const shopifyOrder = shopifyOrderResp?.data?.order;

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

    const fulfillmentMap = {};
    fulfillmentOrders.forEach(fOrder => {
      fOrder.line_items.forEach(fItem => {
        fulfillmentMap[fItem.line_item_id] = fItem.id;
      });
    });

    // -------- Handle additions --------
    for (const item of line_items.additions) {
      const shopifyLineItemId = item.id;
      const delta = item.delta || 1;
    
      const newLineItem = shopifyOrder.line_items.find(li => li.id == shopifyLineItemId);
      const existsInDB = order.line_items?.find(li => li.id == shopifyLineItemId);
    
      if (!newLineItem) continue;
    
      // 📦 Get product metafields
      let vendorId = null;
      let vendorName = newLineItem.vendor || null;
    
      try {
        const metafieldResp = await axios.get(
          `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${newLineItem.product_id}/metafields.json`,
          {
            headers: {
              'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN
            }
          }
        );
    
        const metafields = metafieldResp?.data?.metafields || [];
        vendorId = metafields.find(mf => mf.key === 'vendorid')?.value || null;
        vendorName = metafields.find(mf => mf.key === 'vendor')?.value || vendorName;
      } catch (err) {
        console.warn(`Failed to fetch metafields for product ${newLineItem.product_id}`, err?.response?.data || err.message);
      }
    
      const fulfillment_item_id = fulfillmentMap[shopifyLineItemId];
    
      if (!existsInDB) {
        // Add new line item
        order.line_items.push({
          id: item.id,
          name: newLineItem.name,
          price: parseFloat(newLineItem.price),
          quantity: delta,
          sku: newLineItem.sku,
          product_id: newLineItem.product_id?.toString(),
          variant_id: newLineItem.variant_id?.toString(),
          title: newLineItem.title,
          total_discount: 0,
          deleted_date: null,
          fulfillment_item_id: fulfillment_item_id?.toString() || null,
          fulfillment_status: newLineItem?.fulfillment_status || "",
          vendor_name: vendorName,
          vendor_id: vendorId
        });
      } else {
        const index = order.line_items.findIndex(
          li => li.id?.toString() === shopifyLineItemId?.toString()
        );
    
        if (index !== -1) {
          order.line_items[index] = {
            ...order.line_items[index],
            id: item?.id,
            name: newLineItem.name,
            price: parseFloat(newLineItem.price),
            quantity: Number(existsInDB?.quantity) + Number(delta),
            sku: newLineItem.sku,
            product_id: newLineItem.product_id?.toString(),
            variant_id: newLineItem.variant_id?.toString(),
            title: newLineItem.title,
            fulfillment_item_id: fulfillment_item_id?.toString() || null,
            deleted_date: existsInDB?.deleted_date || null,
            fulfillment_status: newLineItem?.fulfillment_status || "",
            vendor_name: vendorName,
            vendor_id: vendorId
          };
        }
      }
    }
    
    // -------- Handle removals --------
    for (const item of line_items.removals) {
      const shopifyLineItemId = item.id;

      order.line_items = await Promise.all(
        order.line_items.map(async (li) => {
          if (li.id?.toString() === shopifyLineItemId?.toString()) {
            const newQty = li.quantity - item.delta;

            const existingRemoved = await RemovedLineItem.findOne({
              order_id,
              line_item_id: li.id
            });

            if (newQty <= 0) {
              if (existingRemoved) {
                existingRemoved.quantity += li.quantity;
                await existingRemoved.save();
              } else {
                await RemovedLineItem.create({
                  order_id: order_id,
                  line_item_id: li.id,
                  name: li.name,
                  price: li.price,
                  quantity: li.quantity,
                  sku: li.sku,
                  product_id: li.product_id,
                  variant_id: li.variant_id,
                  title: li.title,
                  vendor_id: li.vendor_id,
                  vendor_name: li.vendor_name
                });
              }
              return null;
            } else {
              if (existingRemoved) {
                existingRemoved.quantity += item.delta;
                await existingRemoved.save();
              } else {
                await RemovedLineItem.create({
                  order_id: order_id,
                  line_item_id: li.id,
                  name: li.name,
                  price: li.price,
                  quantity: item.delta,
                  sku: li.sku,
                  product_id: li.product_id,
                  variant_id: li.variant_id,
                  title: li.title,
                  vendor_id: li.vendor_id,
                  vendor_name: li.vendor_name
                });
              }

              return {
                ...li,
                quantity: newQty
              };
            }
          }
          return li;
        })
      );

      order.line_items = order.line_items.filter(Boolean);
    }

    // -------- Save with retry on VersionError --------
    try {
      const data = await order.save();
      return data;
    } catch (error) {
      if (error.name === 'VersionError') {
        console.warn(`VersionError: Refetching and retrying save for order ${order_id}`);
        const freshOrder = await Order.findOne({ order_id });

        if (!freshOrder) {
          throw new Error(`Order with ID ${order_id} not found during retry.`);
        }

        freshOrder.line_items = order.line_items;
        const retriedSave = await freshOrder.save();
        return retriedSave;
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('Error handling order edit:', error);
    throw error;
  }
};

 