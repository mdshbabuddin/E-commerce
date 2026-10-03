import pkg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

const { Pool  } = pkg;

const database = new Pool ({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
    max: 10,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

database.on("error", (error) => {
    console.error("❌ Unexpected database error:", error.message);
});

export const connectDB = async () => {
    try {
        await database.query("SELECT 1");
        console.log("✅ Connected to the database successfully");
    } catch (error) {
        console.error("❌ Database connection failed:", error.message);
        process.exit(1);
    }
};

export default database;