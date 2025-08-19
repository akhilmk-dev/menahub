const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  id: {type: String},
  name: { type: String },
  price: { type: Number },
  product_id: {type: String },
  sku: { type: String },
  total_discount: { type: Number, default: 0 },
  title: { type: String },
  quantity: { type: Number },
  variant_id: { type:String },
  vendor_name: { type: String },
  fulfillment_item_id:{type:String},
  fulfillment_status: {type:String},
  deleted_date:{type:String},
  vendor_id: { type: String }
}, { _id: true });

const orderSchema = new mongoose.Schema({
  order_id: { type: String, unique: true },
  fulfillment_id:{type:String},
  cancel_reason: { type: String, default: null },
  cancelled_at: { type: Date, default: null },
  contact_email: { type: String },
  created_at: { type: Date, default: Date.now },
  updated_at: {type:Date, default: Date.now},
  email: { type: String },
  name: { type: String },
  order_number: { type: String },
  payment_gate_way: { type: String },
  phone: { type: String },
  currency: {type: String},
  financial_status: {type:String},
  fulfillment_status: {type:String},
  total_discounts: { type: Number, default: 0 },
  total_price: { type: Number },
  total_tax: { type: Number, default: 0 },
  subtotal_price: {type:Number,default:0},
  shipping_address:{type: String},
  customer: {type:String},
  shipping_address:{
    first_name: { type: String },
    last_name: { type: String },
    address1: { type: String },
    address2: { type: String, default: null },
    company: { type: String, default: null },
    phone: { type: String },
    city: { type: String },
    country: { type: String },
    country_code: { type: String },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  customer: {
    id: { type: Number },
    created_at: { type: Date },
    first_name: { type: String },
    last_name: { type: String },
    email: { type: String },
    currency: { type: String },
    default_address: {
      id: { type: Number },
      first_name: { type: String },
      last_name: { type: String },
      address1: { type: String },
      address2: { type: String, default: null },
      city: { type: String },
      country: { type: String },
      country_code: { type: String },
      phone: { type: String }
    }
  },
  line_items: [lineItemSchema],
});

module.exports = mongoose.model('Order', orderSchema);
