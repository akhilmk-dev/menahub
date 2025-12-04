import axios from "axios";
import Product from "../models/Product.js";
import catchAsync from "../utils/catchAsync.js";

export const createProduct = async (req, res) => {
  try {
    const { product, collectionIds } = req.body;  

    // Remove metafields (Shopify won't accept inside product payload)
    const cleanProduct = { ...product };
    delete cleanProduct.metafields;

    // Enable inventory tracking on variants
    if (!cleanProduct.variants || !cleanProduct.variants.some(v => v.option1 || v.option2 || v.option3)) {
      cleanProduct.variants = [
        {
          price: product.price || "0.00",
          sku: "DEFAULT",
          inventory_quantity: 0,
          inventory_management: "shopify",
        }
      ];
    } else {
      cleanProduct.variants = cleanProduct.variants.map(v => ({
        ...v,
        inventory_management: "shopify"
      }));
    }

    // --- Create product in Shopify ---
    const productResponse = await axios.post(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products.json`,
      { product: cleanProduct },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const shopifyProduct = productResponse.data.product;
    console.log(shopifyProduct,"show.....")
    const productId = shopifyProduct.id;
    const variants = shopifyProduct.variants;

    // --- Assign product to multiple collections ---
    if (Array.isArray(collectionIds) && collectionIds.length > 0) {
      for (const cid of collectionIds) {
        await axios.post(
          `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/collects.json`,
          {
            collect: {
              product_id: productId,
              collection_id: Number(cid),
            },
          },
          {
            headers: {
              "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    // --- Calculate total stock across all variants ---
    const totalStock = variants.reduce(
      (sum, v) => sum + (v.inventory_quantity || 0),
      0
    );

    // --- Save product to MongoDB ---
    const newProduct = new Product({
      shopifyId: productId,
      title: shopifyProduct.title,
      price: variants[0]?.price || 0,
      vendor_name: shopifyProduct.vendor,
      collectionIds: collectionIds || [],
      stock: totalStock,
    });

    await newProduct.save();

    res.status(201).json({
      message: "Product created successfully",
      product: newProduct,
    });

  } catch (err) {
    console.error(err.response?.data || err.message);

    res.status(err.response?.status || 500).json({
      error: "Failed to create product",
      details: err.response?.data || err.message,
    });
  }
};

export const getProducts = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 0;
  const limit = parseInt(req.query.limit) || 10;
  const skip = page * limit;

  const { search, vendor_name , sortBy } = req.query;

  // Default sort (latest products first)
  let sort = { createdAt: -1 };

  // Sorting by user input (e.g., price, title, etc.)
  if (sortBy) {
     sort = {};
     const sortParams = sortBy.split(',');
     sortParams.forEach(param => {
        const [field, order] = param.split(':');
        sort[field] = order === 'asc' ? 1 : -1;
     });
  }

  // Filter criteria
  let filter = {
     deleted_at: { $in: [null, undefined] }
  };

  // Search filter (matches product title, description, or SKU)
  if (search) {
     const regex = new RegExp(search, 'i');
     filter.$or = [
        { title: regex },
        { body_html: regex },
        { sku: regex }
     ];
  }

  // Filter by vendor_name (if provided)
  if (vendor_name) {
     filter.vendor_name = vendor_name;
  }

  // Fetch matching products from the database
  const products = await Product.find(filter)
     .sort(sort)
     .skip(skip)
     .limit(limit)
     .lean(); 

  // Get total count of matching products
  const total = await Product.countDocuments(filter);

  // Send paginated response with product data
  res.status(200).json({
     status: 'success',
     page,
     limit,
     total,
     totalPages: Math.ceil(total / limit),
     data: products,
  });
});

export const deleteProduct = async (req, res) => {
  const { productId } = req.params; 

  if (!productId) {
    return res.status(500).json({ message: "Product ID is required" });
  }

  try {
    // 1 Delete product from Shopify
    const apiUrl = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${productId}.json`;
    await axios.delete(apiUrl, {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });

    //  Delete product from MongoDB
    const deletedProduct = await Product.findOneAndDelete({ shopifyId: productId });

    res.status(200).json({
      message: "Product deleted successfully",
      product: deletedProduct || null,
    });
  } catch (err) {
    console.error("Error deleting product:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      message: "Failed to delete product",
      details: err.response?.data || err.message,
    });
  }
};

export const getProductById = async(req,res)=>{
  const {productId} = req.params
  if(!productId){
     return res.status(500).json({message:"productId is required"})
  }
  try {
    const apiUrl = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${productId}.json`;
    const response = await axios.get(apiUrl, {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });
    const {collectionIds} = await Product.findOne({shopifyId:productId})
    return res.status(200).json({message:"Product details fetched successfully",data:{data:response.data.product,collectionIds:collectionIds}})
  } catch (error) {
    console.log(error)
  }
}

export const updateProduct = async (req, res) => {
  const { productId } = req.params;
  const { product, collectionIds, imagesToKeep } = req.body;

  if (!productId) {
    return res.status(400).json({ message: "productId is required" });
  }

  try {
    // ---------------- CLEAN PRODUCT DATA ----------------
    const cleanProduct = { ...product };

    // Remove metafields (Shopify doesn't allow update here)
    delete cleanProduct.metafields;

    // Shopify deletes all images if empty array is sent — prevent that
    if (!cleanProduct.images || cleanProduct.images.length === 0) {
      delete cleanProduct.images;
    }

    // Enable Shopify inventory management
    if (cleanProduct.variants && cleanProduct.variants.length > 0) {
      cleanProduct.variants = cleanProduct.variants.map((v) => ({
        ...v,
        inventory_management: "shopify",
      }));
    }

    // ---------------- UPDATE PRODUCT (BASIC FIELDS) ----------------
    const apiUrl = `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${productId}.json`;

    const shopifyRes = await axios.put(
      apiUrl,
      { product: cleanProduct },
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    const updatedShopifyProduct = shopifyRes.data.product;

    // ----------------------- IMAGE LOGIC ------------------------
    // Get existing images
    const existingRes = await axios.get(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/products/${productId}/images.json`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        },
      }
    );

    // ---------------- UPDATE INVENTORY LEVELS ----------------
    const locationId = Number(process.env.SHOPIFY_LOCATION_ID);
    let totalStock = 0;

    for (const variant of updatedShopifyProduct.variants) {
      const match = cleanProduct.variants?.find(
        (v) => v.sku === variant.sku || v.option1 === variant.option1
      );

      const qtyToSet = match?.inventory_quantity ?? 0;

      await axios.post(
        `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/inventory_levels/set.json`,
        {
          location_id: locationId,
          inventory_item_id: variant.inventory_item_id,
          available: qtyToSet,
        },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      totalStock += qtyToSet;
    }

    // ---------------- UPDATE COLLECTION IDS ----------------
    const existingCollectsRes = await axios.get(
      `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/collects.json?product_id=${productId}`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
        },
      }
    );

    const existingCollects = existingCollectsRes.data.collects;

    // Remove any old collections not in new list
    for (const collect of existingCollects) {
      if (!collectionIds?.includes(Number(collect.collection_id))) {
        await axios.delete(
          `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/collects/${collect.id}.json`,
          {
            headers: {
              "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
            },
          }
        );
      }
    }

    // Add new collection mappings
    for (const cid of collectionIds || []) {
      const exists = existingCollects.some(
        (c) => Number(c.collection_id) === Number(cid)
      );

      if (!exists) {
        await axios.post(
          `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/collects.json`,
          {
            collect: {
              product_id: Number(productId),
              collection_id: Number(cid),
            },
          },
          {
            headers: {
              "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    // ---------------- UPDATE MONGODB ----------------
    const updatedProduct = await Product.findOneAndUpdate(
      { shopifyId: productId },
      {
        title: updatedShopifyProduct.title,
        price: updatedShopifyProduct.variants?.[0]?.price || null,
        vendor_name: updatedShopifyProduct.vendor,
        collectionIds: collectionIds || [],
        stock: totalStock,
      },
      { new: true }
    );

    res.status(200).json({
      message: "Product updated successfully",
      data: {
        shopify: updatedShopifyProduct,
        mongo: updatedProduct,
      },
    });

  } catch (err) {
    console.error("UPDATE ERROR:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: "Failed to update product",
      details: err.response?.data || err.message,
    });
  }
};

export const shopifyProductDeleteWebhook = async (req, res) => {
  try {
    const data = req.body; 
    const shopifyProductId = data.id;  

    if (!shopifyProductId) {
      return res.status(400).json({ message: "Shopify product ID missing" });
    }

    // Delete from MongoDB
    const deleted = await Product.findOneAndDelete({ shopifyId: shopifyProductId });

    // console.log(" Shopify Deleted Product:", shopifyProductId);
    // console.log("Mongo Deleted:", deleted);

    // Important: Respond with 200 so Shopify knows webhook succeeded
    return res.status(200).json({ success: true, message: "Product deleted locally" });

  } catch (error) {
    console.error("SHOPIFY DELETE WEBHOOK ERROR:", error);
    return res.status(500).json({ message: "Error processing webhook" });
  }
};



// // STEP 2 — Get shop locations
// const locationsResponse = await axios.get(
//   `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/locations.json`,
//   {
//     headers: {
//       "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
//     },
//   }
// );
// const locationId = locationsResponse.data.locations[0].id;

// // STEP 3 — Set inventory level NOW VALID
// const quantity = Number(product.variants?.[0]?.inventory_quantity || 0);

// await axios.post(
//   `${process.env.SHOPIFY_BASE_URL}/admin/api/2025-07/inventory_levels/set.json`,
//   {
//     location_id: locationId,
//     inventory_item_id: inventoryItemId,
//     available: quantity,
//   },
//   {
//     headers: {
//       "X-Shopify-Access-Token": process.env.SHOPIFY_TOKEN,
//       "Content-Type": "application/json",
//     },
//   }
// );