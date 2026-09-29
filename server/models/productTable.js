import database from "../database/db.js";

export async function createProductsTable() {
    try {
        // ✅ Ensure UUID support
        await database.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        const query = `
            CREATE TABLE IF NOT EXISTS products(
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

                name VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,

                price DECIMAL(10,2) NOT NULL CHECK (price >= 0),

                category VARCHAR(100) NOT NULL,

                -- ✅ Better rating system
                average_rating DECIMAL(2,1) DEFAULT 0 CHECK (average_rating BETWEEN 0 AND 5),
                total_reviews INT DEFAULT 0 CHECK (total_reviews >= 0),

                images JSONB DEFAULT '[]'::JSONB,

                stock INT NOT NULL CHECK (stock >= 0),

                created_by UUID NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
            );
        `;

        await database.query(query);

        // ✅ Indexes for performance
        await database.query(`
            CREATE INDEX IF NOT EXISTS idx_products_category 
            ON products(category);
        `);

        await database.query(`
            CREATE INDEX IF NOT EXISTS idx_products_name 
            ON products(name);
        `);

        await database.query(`
            CREATE INDEX IF NOT EXISTS idx_products_created_by 
            ON products(created_by);
        `);

        console.log("✅ products table ready");
    } catch (error) {
        console.error("❌ Failed to create products table:", error.message);
        // ❌ removed process.exit
    }
}