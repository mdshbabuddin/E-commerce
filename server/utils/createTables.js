import { createUsersTable } from "../models/userTable.js";
import { createOrderItemsTable } from "../models/orderItemsTable.js";
import { createOrdersTable } from "../models/ordersTable.js";
import { createPaymentsTable } from "../models/paymentsTable.js";
import { createProductReviewsTable } from "../models/productReviewsTable.js";
import { createProductsTable } from "../models/productTable.js";
import { createShippingInfoTable } from "../models/shippinginfoTable.js";

export const createTables = async () => {
    try {
        console.log("🚀 Creating tables...");

        // ✅ 1. Users (base table)
        await createUsersTable();

        // ✅ 2. Products (depends on users)
        await createProductsTable();

        // ✅ 3. Orders (depends on users)
        await createOrdersTable();

        // ✅ 4. Order Items (depends on orders + products)
        await createOrderItemsTable();

        // ✅ 5. Reviews (depends on users + products)
        await createProductReviewsTable();

        // ✅ 6. Payments (depends on orders)
        await createPaymentsTable();

        // ✅ 7. Shipping Info (depends on orders)
        await createShippingInfoTable();

        console.log("✅ All tables created successfully.");
    } catch (error) {
        console.error("❌ Error creating tables:", error.message);
        throw new Error("Failed to create tables.");
    }
};