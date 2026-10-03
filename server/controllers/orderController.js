import ErrorHandler from "../middlewares/errorMiddleware.js";
import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import { generatePaymentIntent } from "../utils/generatePaymentIntent.js";

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

  const items = Array.isArray(orderedItems)
    ? orderedItems
    : JSON.parse(orderedItems);

  if (!items || items.length === 0) {
    return next(new ErrorHandler("No items in cart.", 400));
  }
  const productIds = items.map((item) => item.product.id);

  const client = await database.connect();

  try {
    await client.query("BEGIN");

    const { rows: products } = await client.query(
      `SELECT id, price, stock, name FROM products WHERE id = ANY($1::uuid[])`,
      [productIds]
    );

    let total_price = 0;
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

      const itemTotal = product.price * item.quantity;
      total_price += itemTotal;

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

    const tax_price = 0.18;
    const shipping_price = total_price >= 50 ? 0 : 2;
    total_price = Math.round(
      total_price + total_price * tax_price + shipping_price
    );

    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id, total_price, tax_price, shipping_price) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, total_price, tax_price, shipping_price]
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
        total_price,
      });
    }

    const paymentResponse = await generatePaymentIntent(
      orderId,
      total_price,
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
      total_price,
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

export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  const { status } = req.body;
  if (!status) {
    return next(new ErrorHandler("Provide a valid status for order.", 400));
  }
  const { orderId } = req.params;
  const results = await database.query(
    `
    SELECT * FROM orders WHERE id = $1
    `,
    [orderId]
  );

  if (results.rows.length === 0) {
    return next(new ErrorHandler("Invalid order ID.", 404));
  }

  const updatedOrder = await database.query(
    `
    UPDATE orders SET order_status = $1 WHERE id = $2 RETURNING *
    `,
    [status, orderId]
  );

  if (status === "Delivered") {
    await database.query(
      `
      UPDATE payments SET payment_status = 'Paid'
      WHERE order_id = $1 AND payment_type = 'COD' AND payment_status = 'Pending'
      `,
      [orderId]
    );
  }

  res.status(200).json({
    success: true,
    message: "Order status updated.",
    updatedOrder: updatedOrder.rows[0],
  });
});

export const deleteOrder = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const results = await database.query(
    `
        DELETE FROM orders WHERE id = $1 RETURNING *
        `,
    [orderId]
  );
  if (results.rows.length === 0) {
    return next(new ErrorHandler("Invalid order ID.", 404));
  }

  res.status(200).json({
    success: true,
    message: "Order deleted.",
    order: results.rows[0],
  });
});