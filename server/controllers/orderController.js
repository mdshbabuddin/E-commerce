import ErrorHandler from "../middlewares/errorMiddleware.js";
import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import { generatePaymentIntent } from "../utils/generatePaymentIntent.js";

// ---------------------------------------------------------------
// MONEY RULES (INR)
// All maths is done in PAISE (whole numbers, 1 rupee = 100 paise).
// This avoids tiny decimal errors like 0.1 + 0.2 = 0.30000000000000004
// ---------------------------------------------------------------
const FREE_SHIPPING_ABOVE_PAISE = 500 * 100; // subtotal Rs 500 or more -> free shipping
const SHIPPING_FEE_PAISE = 50 * 100; // otherwise Rs 50
const GST_PERCENT = 18; // 18% GST added on top of the subtotal

const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const toRupeesText = (paise) => (paise / 100).toFixed(2); // for saving in the database

export const placeNewOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    full_name,
    state,
    city,
    country,
    address,
    pincode,
    phone,
    orderedItems,
    payment_method,
  } = req.body;
  if (
    !full_name ||
    !state ||
    !city ||
    !country ||
    !address ||
    !pincode ||
    !phone
  ) {
    return next(
      new ErrorHandler("Please provide complete shipping details.", 400)
    );
  }

  const paymentMethod = payment_method === "COD" ? "COD" : "Card";

  let items;
  try {
    items = Array.isArray(orderedItems) ? orderedItems : JSON.parse(orderedItems);
  } catch {
    return next(new ErrorHandler("Invalid cart data.", 400));
  }

  if (!Array.isArray(items) || items.length === 0) {
    return next(new ErrorHandler("No items in cart.", 400));
  }

  // Every item must have a product id and a whole-number quantity of 1 or more
  for (const item of items) {
    if (
      !item?.product?.id ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return next(new ErrorHandler("Invalid cart item.", 400));
    }
  }

  const productIds = items.map((item) => item.product.id);

  const client = await database.connect();

  try {
    await client.query("BEGIN");

    const { rows: products } = await client.query(
      `SELECT id, price, stock, name FROM products WHERE id = ANY($1::uuid[])`,
      [productIds]
    );

    let subtotalPaise = 0;
    const values = [];
    const placeholders = [];

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const product = products.find((p) => p.id === item.product.id);

      if (!product) {
        throw new ErrorHandler(
          `Product not found for ID: ${item.product.id}`,
          404
        );
      }

      if (item.quantity > product.stock) {
        throw new ErrorHandler(
          `Only ${product.stock} units available for ${product.name}`,
          400
        );
      }

      // Reduce stock now, only if enough is still left
      const stockUpdate = await client.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
        [item.quantity, product.id]
      );
      if (stockUpdate.rowCount === 0) {
        throw new ErrorHandler(
          `Only ${product.stock} units available for ${product.name}`,
          400
        );
      }

      // Price always comes from the database, never from the browser
      subtotalPaise += toPaise(product.price) * item.quantity;

      values.push(
        null,
        product.id,
        item.quantity,
        product.price,
        item.product.images?.[0]?.url || "",
        product.name
      );

      const offset = index * 6;

      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${
          offset + 5
        }, $${offset + 6})`
      );
    }

    const shippingPaise =
      subtotalPaise >= FREE_SHIPPING_ABOVE_PAISE ? 0 : SHIPPING_FEE_PAISE;
    const taxPaise = Math.round((subtotalPaise * GST_PERCENT) / 100);
    const totalPaise = subtotalPaise + taxPaise + shippingPaise;

    // tax_price now stores the tax AMOUNT in rupees (before, it stored the rate 0.18)
    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id, total_price, tax_price, shipping_price) VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        req.user.id,
        toRupeesText(totalPaise),
        toRupeesText(taxPaise),
        toRupeesText(shippingPaise),
      ]
    );

    const orderId = orderResult.rows[0].id;

    for (let i = 0; i < values.length; i += 6) {
      values[i] = orderId;
    }

    await client.query(
      `
      INSERT INTO order_items (order_id, product_id, quantity, price, image, title)
      VALUES ${placeholders.join(", ")} RETURNING *
      `,
      values
    );

    await client.query(
      `
      INSERT INTO shipping_info (order_id, full_name, state, city, country, address, pincode, phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
      `,
      [orderId, full_name, state, city, country, address, pincode, phone]
    );

    // Amounts sent back to the browser, in rupees
    const amounts = {
      subtotal_price: subtotalPaise / 100,
      tax_price: taxPaise / 100,
      shipping_price: shippingPaise / 100,
      total_price: totalPaise / 100,
    };

    if (paymentMethod === "COD") {
      await client.query(
        `INSERT INTO payments (order_id, payment_type, payment_status) VALUES ($1, $2, $3) RETURNING *`,
        [orderId, "COD", "Pending"]
      );

      await client.query(`UPDATE orders SET paid_at = NOW() WHERE id = $1`, [
        orderId,
      ]);

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Order placed successfully. Pay with cash on delivery.",
        paymentMethod: "COD",
        paymentIntent: null,
        ...amounts,
      });
    }

    // Stripe wants the amount in paise (whole number)
    const paymentResponse = await generatePaymentIntent(
      orderId,
      totalPaise,
      client
    );

    if (!paymentResponse.success) {
      throw new ErrorHandler("Payment failed. Try again.", 500);
    }

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Order placed successfully. Please proceed to payment.",
      paymentMethod: "Card",
      paymentIntent: paymentResponse.clientSecret,
      ...amounts,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

export const fetchSingleOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const isAdmin = req.user.role === "Admin";
  const result = await database.query(
    `
    SELECT 
 o.*, 
 p.payment_type,
 p.payment_status,
 COALESCE(
 json_agg(
json_build_object(
'order_item_id', oi.id,
'order_id', oi.order_id,
'product_id', oi.product_id,
'quantity', oi.quantity,
'price', oi.price
 )
 ) FILTER (WHERE oi.id IS NOT NULL), '[]'
 ) AS order_items,
 json_build_object(
 'full_name', s.full_name,
 'state', s.state,
 'city', s.city,
 'country', s.country,
 'address', s.address,
 'pincode', s.pincode,
 'phone', s.phone
 ) AS shipping_info
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN shipping_info s ON o.id = s.order_id
LEFT JOIN payments p ON o.id = p.order_id
WHERE o.id = $1 AND (o.buyer_id = $2 OR $3::boolean)
GROUP BY o.id, s.id, p.id;
`,
    [orderId, req.user.id, isAdmin]
  );

  if (result.rows.length === 0) {
    return next(new ErrorHandler("Order not found.", 404));
  }

  res.status(200).json({
    success: true,
    message: "Order fetched.",
    orders: result.rows[0],
  });
});

export const fetchMyOrders = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(
    `
        SELECT o.*, 
 p.payment_type,
 p.payment_status,
 COALESCE(
 json_agg(
  json_build_object(
 'order_item_id', oi.id,
 'order_id', oi.order_id,
 'product_id', oi.product_id,
 'quantity', oi.quantity,
 'price', oi.price,
 'image', oi.image,
 'title', oi.title
  ) 
 ) FILTER (WHERE oi.id IS NOT NULL), '[]'
 ) AS order_items,
json_build_object(
 'full_name', s.full_name,
 'state', s.state,
 'city', s.city,
 'country', s.country,
 'address', s.address,
 'pincode', s.pincode,
 'phone', s.phone
 ) AS shipping_info 
 FROM orders o
 LEFT JOIN order_items oi ON o.id = oi.order_id
 LEFT JOIN shipping_info s ON o.id = s.order_id
 LEFT JOIN payments p ON o.id = p.order_id
WHERE o.buyer_id = $1 AND o.paid_at IS NOT NULL
GROUP BY o.id, s.id, p.id
        `,
    [req.user.id]
  );

  res.status(200).json({
    success: true,
    message: "All your orders are fetched.",
    myOrders: result.rows,
  });
});

export const fetchAllOrders = catchAsyncErrors(async (req, res, next) => {
  const result = await database.query(`
            SELECT o.*,
 p.payment_type,
 p.payment_status,
 COALESCE(json_agg(
 json_build_object(
 'order_item_id', oi.id,
 'order_id', oi.order_id,
 'product_id', oi.product_id,
 'quantity', oi.quantity,
 'price', oi.price,
 'image', oi.image,
 'title', oi.title
)
) FILTER (WHERE oi.id IS NOT NULL), '[]' ) AS order_items, json_build_object(
'full_name', s.full_name,
 'state', s.state,
 'city', s.city,
 'country', s.country,
 'address', s.address,
 'pincode', s.pincode,
 'phone', s.phone 
) AS shipping_info
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN shipping_info s ON o.id = s.order_id
LEFT JOIN payments p ON o.id = p.order_id
WHERE o.paid_at IS NOT NULL
GROUP BY o.id, s.id, p.id
        `);

  res.status(200).json({
    success: true,
    message: "All orders fetched.",
    orders: result.rows,
  });
});

const ALLOWED_TRANSITIONS = {
  Processing: ["Shipped", "Cancelled"],
  Shipped: ["Delivered", "Cancelled"],
  Delivered: [],
  Cancelled: [],
};

export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  const status = req.body?.status;
  if (!status || !Object.keys(ALLOWED_TRANSITIONS).includes(status)) {
    return next(
      new ErrorHandler(
        "Status must be Processing, Shipped, Delivered or Cancelled.",
        400
      )
    );
  }
  const { orderId } = req.params;

  const client = await database.connect();
  try {
    await client.query("BEGIN");

    // FOR UPDATE locks this order row, so two admins cannot change it at the same time
    const results = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (results.rows.length === 0) {
      throw new ErrorHandler("Invalid order ID.", 404);
    }

    const currentStatus = results.rows[0].order_status;

    if (currentStatus === status) {
      await client.query("COMMIT");
      return res.status(200).json({
        success: true,
        message: "Order status updated.",
        updatedOrder: results.rows[0],
      });
    }

    if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(status)) {
      throw new ErrorHandler(
        `An order that is ${currentStatus} cannot be changed to ${status}.`,
        400
      );
    }

    const updatedOrder = await client.query(
      `UPDATE orders SET order_status = $1 WHERE id = $2 RETURNING *`,
      [status, orderId]
    );

    if (status === "Cancelled") {
      // Put the reserved stock back
      await client.query(
        `UPDATE products p SET stock = p.stock + oi.quantity
         FROM order_items oi
         WHERE oi.order_id = $1 AND oi.product_id = p.id`,
        [orderId]
      );
    }

    if (status === "Delivered") {
      await client.query(
        `UPDATE payments SET payment_status = 'Paid'
         WHERE order_id = $1 AND payment_type = 'COD' AND payment_status = 'Pending'`,
        [orderId]
      );
    }

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Order status updated.",
      updatedOrder: updatedOrder.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

export const deleteOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;

  const client = await database.connect();
  try {
    await client.query("BEGIN");

    const found = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (found.rows.length === 0) {
      throw new ErrorHandler("Invalid order ID.", 404);
    }

    // Stock is only given back if the goods were not delivered or already returned by a cancel
    if (["Processing", "Shipped"].includes(found.rows[0].order_status)) {
      await client.query(
        `UPDATE products p SET stock = p.stock + oi.quantity
         FROM order_items oi
         WHERE oi.order_id = $1 AND oi.product_id = p.id`,
        [orderId]
      );
    }

    const results = await client.query(
      `DELETE FROM orders WHERE id = $1 RETURNING *`,
      [orderId]
    );

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Order deleted.",
      order: results.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});