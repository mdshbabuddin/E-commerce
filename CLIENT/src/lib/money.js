// Money helpers for the customer site (INR).
// IMPORTANT: these rules must match the server (orderController.js):
//   shipping Rs 50, free when subtotal is Rs 500 or more, GST 18% added on top.
// The server is the final authority; this file only shows the same numbers on screen.

export const FREE_SHIPPING_ABOVE = 500;
export const SHIPPING_FEE = 50;
export const GST_PERCENT = 18;

const toPaise = (rupees) => Math.round(Number(rupees) * 100);

// 1234.5 -> "₹1,234.50"  (Indian number style)
export const formatINR = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(amount) || 0);

// Works in paise (whole numbers) so there are no decimal errors.
export const calculateCartTotals = (cart) => {
  const items = Array.isArray(cart) ? cart : [];
  const subtotalPaise = items.reduce(
    (sum, item) => sum + toPaise(item.product.price) * item.quantity,
    0
  );
  const shippingPaise =
    subtotalPaise >= FREE_SHIPPING_ABOVE * 100 ? 0 : SHIPPING_FEE * 100;
  const taxPaise = Math.round((subtotalPaise * GST_PERCENT) / 100);

  return {
    subtotal: subtotalPaise / 100,
    shipping: shippingPaise / 100,
    tax: taxPaise / 100,
    total: (subtotalPaise + taxPaise + shippingPaise) / 100,
  };
};