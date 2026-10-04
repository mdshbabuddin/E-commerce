import express from "express";
import { config } from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";
import fs from "fs"; // B31
import { createTables } from "./utils/createTables.js";
import database, { connectDB } from "./database/db.js";
import ErrorHandler, { errorMiddleware } from "./middlewares/errorMiddleware.js"; // B31
import authRouter from "./router/authRoutes.js";
import productRouter from "./router/productRoutes.js";
import adminRouter from "./router/adminRoutes.js";
import orderRouter from "./router/orderRoutes.js";
import Stripe from "stripe";

const app = express();
app.set("trust proxy", 1);

// ✅ Load env
config({ path: "./config.env" });

// ✅ Stop at startup if an important setting is missing
const requiredEnv = [
    "PORT",
    "FRONTEND_URL",
    "DASHBOARD_URL",
    "JWT_SECRET_KEY",
    "JWT_EXPIRES_IN",
    "COOKIE_EXPIRES_IN",
    "DB_USER",
    "DB_HOST",
    "DB_NAME",
    "DB_PASSWORD",
    "DB_PORT",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "SMTP_MAIL",
    "BREVO_API_KEY",
    "CLOUDINARY_CLIENT_NAME",
    "CLOUDINARY_CLIENT_API",
    "CLOUDINARY_CLIENT_SECRET",
];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
    console.error(`❌ Missing environment variables: ${missingEnv.join(", ")}`);
    process.exit(1);
}
for (const name of ["FRONTEND_URL", "DASHBOARD_URL"]) {
    if (process.env[name].endsWith("/")) {
        console.error(`❌ ${name} must not end with "/". Remove the last slash.`);
        process.exit(1);
    }
}

// B31: make sure the temporary upload folder exists (git does not save empty folders)
fs.mkdirSync("./uploads", { recursive: true });

// ✅ Safe CORS setup
const allowedOrigins = [process.env.FRONTEND_URL, process.env.DASHBOARD_URL];

app.use(
    cors({
        origin: allowedOrigins,
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    })
);

app.post(
    "/api/v1/payment/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        const sig = req.headers["stripe-signature"];
        let event;
        try {
            event = Stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (error) {
            return res.status(400).send(`Webhook Error: ${error.message || error}`);
        }

        if (event.type === "payment_intent.succeeded") {
            const paymentIntentId = event.data.object.id;
            const client = await database.connect();
            try {
                await client.query("BEGIN");
                const paymentUpdate = await client.query(
                    `UPDATE payments SET payment_status = 'Paid'
                     WHERE payment_intent_id = $1 AND payment_status <> 'Paid'
                     RETURNING order_id`,
                    [paymentIntentId]
                );
                // Only the first time the payment becomes Paid
                if (paymentUpdate.rows.length > 0) {
                    await client.query(
                        `UPDATE orders SET paid_at = NOW() WHERE id = $1`,
                        [paymentUpdate.rows[0].order_id]
                    );
                }
                await client.query("COMMIT");
            } catch (error) {
                await client.query("ROLLBACK");
                return res.status(500).send("Error updating payment and order.");
            } finally {
                client.release();
            }
        }

        if (event.type === "payment_intent.payment_failed") {
            const paymentIntentId = event.data.object.id;
            try {
                await database.query(
                    `UPDATE payments SET payment_status = 'Failed'
                     WHERE payment_intent_id = $1 AND payment_status = 'Pending'`,
                    [paymentIntentId]
                );
            } catch (error) {
                return res.status(500).send("Error updating failed payment.");
            }
        }
        res.status(200).send({ received: true });
    }
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    fileUpload({
        tempFileDir: "./uploads",
        useTempFiles: true,
    })
);

app.get("/api/v1/health", (req, res) => {
    res.status(200).json({ success: true, message: "OK" });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/product", productRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/order", orderRouter);

// ✅ Proper startup function
const startServer = async () => {
    try {
        await connectDB();      // 🔥 FIRST
        await createTables();   // 🔥 SECOND
        console.log("✅ App initialized successfully");
    } catch (error) {
        console.error("❌ App startup failed:", error.message);
        process.exit(1);
    }
};

startServer();

// B31: unknown URLs get a clean JSON 404 instead of an HTML page
app.use((req, res, next) => {
    next(new ErrorHandler("Route not found.", 404));
});

app.use(errorMiddleware);

export default app;