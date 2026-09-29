import database from "../database/db.js";

export async function createProductReviewsTable() {
    try {
        // ✅ Ensure UUID support
        await database.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        const query = `
            CREATE TABLE IF NOT EXISTS reviews (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

                product_id UUID NOT NULL,
                user_id UUID NOT NULL,

                rating DECIMAL(2,1) NOT NULL CHECK (rating BETWEEN 0 AND 5),

                comment TEXT NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                -- ✅ Prevent duplicate reviews
                UNIQUE (product_id, user_id),

                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `;

        await database.query(query);

        // ✅ Add indexes
        await database.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_product_id 
            ON reviews(product_id);
        `);

        await database.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_user_id 
            ON reviews(user_id);
        `);

        console.log("✅ reviews table ready");
    } catch (error) {
        console.error("❌ Failed to create reviews table:", error.message);
        // ❌ removed process.exit
    }
}