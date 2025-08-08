import Order from "../models/Order.js";

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
  