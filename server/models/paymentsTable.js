import database from "../database/db.js";

export async function createPaymentsTable() {
    try {
        // ✅ Ensure UUID support
        await database.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        const query = `
            CREATE TABLE IF NOT EXISTS payments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

                order_id UUID NOT NULL UNIQUE,

                payment_type VARCHAR(20) NOT NULL
                CHECK (payment_type IN ('Online', 'COD', 'UPI', 'Card')),

                payment_status VARCHAR(20) NOT NULL DEFAULT 'Pending'
                CHECK (payment_status IN ('Paid', 'Pending', 'Failed')),

                payment_intent_id VARCHAR(255) UNIQUE,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            );
        `;

        await database.query(query);

        // ✅ Add index for filtering payments
        await database.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_status 
            ON payments(payment_status);
        `);

        console.log("✅ payments table ready");
    } catch (error) {
        console.error("❌ Failed to create payments table:", error.message);
        // ❌ removed process.exit
    }
}