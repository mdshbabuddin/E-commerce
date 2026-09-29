import database from "../database/db.js";

export async function createOrderItemsTable() {
    try {
        // ✅ Ensure UUID extension exists
        await database.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        const query = `
            CREATE TABLE IF NOT EXISTS order_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id UUID NOT NULL,
                product_id UUID NOT NULL,
                quantity INT NOT NULL CHECK (quantity > 0),
                price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
                image TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            );
        `;

        await database.query(query);

        // ✅ Add indexes (important for performance)
        await database.query(`
            CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
            ON order_items(order_id);
        `);

        await database.query(`
            CREATE INDEX IF NOT EXISTS idx_order_items_product_id 
            ON order_items(product_id);
        `);

        console.log("✅ order_items table ready");
    } catch (error) {
        console.error("❌ Failed to create order_items table:", error.message);
        // ❌ removed process.exit
    }
}