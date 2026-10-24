import database from "../database/db.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// amountInPaise must be a WHOLE number. Example: Rs 286.50 = 28650 paise.
export async function generatePaymentIntent(orderId, amountInPaise, db = database) {
  try {
    if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
      throw new Error(`Invalid payment amount: ${amountInPaise}`);
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPaise,
      currency: "inr",
      metadata: { orderId: String(orderId) },
    });

    await db.query(
      "INSERT INTO payments (order_id, payment_type, payment_status, payment_intent_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [orderId, "Online", "Pending", paymentIntent.id]
    );

    return { success: true, clientSecret: paymentIntent.client_secret };
  } catch (error) {
    console.error("Payment Error:", error.message || error);
    return { success: false, message: "Payment Failed." };
  }
}