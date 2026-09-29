import database from "../database/db.js";

export async function createUsersTable() {
    try {
        // ✅ Ensure UUID support
        await database.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        const query = `
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

                name VARCHAR(100) NOT NULL CHECK (CHAR_LENGTH(name) >= 3),

                email VARCHAR(100) NOT NULL UNIQUE,

                password_hash TEXT NOT NULL,

                role VARCHAR(20) DEFAULT 'User'
                CHECK (role IN ('User', 'Admin', 'Seller')),

                avatar JSONB DEFAULT NULL,

                reset_password_token TEXT DEFAULT NULL,
                reset_password_expire TIMESTAMP DEFAULT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await database.query(query);

        // ✅ Case-insensitive email index
        await database.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
            ON users (LOWER(email));
        `);

        console.log("✅ users table ready");
    } catch (error) {
        console.error("❌ Failed to create users table:", error.message);
        // ❌ removed process.exit
    }
}