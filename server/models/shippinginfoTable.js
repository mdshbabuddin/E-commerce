import database from "../database/db.js";

export async function createShippingInfoTable() {
    try {
        // ✅ Ensure UUID support
        await database.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        const query = `
            CREATE TABLE IF NOT EXISTS shipping_info(
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

                order_id UUID NOT NULL UNIQUE,

                full_name VARCHAR(100) NOT NULL,
                state VARCHAR(100) NOT NULL,
                city VARCHAR(100) NOT NULL,
                country VARCHAR(100) NOT NULL,
                address TEXT NOT NULL,

                pincode VARCHAR(10) NOT NULL,
                phone VARCHAR(15) NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            );
        `;

        await database.query(query);

        // ✅ Optional indexes (future queries)
        await database.query(`
            CREATE INDEX IF NOT EXISTS idx_shipping_city 
            ON shipping_info(city);
        `);

        await database.query(`
            CREATE INDEX IF NOT EXISTS idx_shipping_pincode 
            ON shipping_info(pincode);
        `);

        console.log("✅ shipping_info table ready");
    } catch (error) {
        console.error("❌ Failed to create shipping_info table:", error.message);
        // ❌ removed process.exit
    }
}