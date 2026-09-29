import pkg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

const { Client } = pkg;

const database = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
});

export const connectDB = async () => {
    try {
        await database.connect();
        console.log("✅ Connected to the database successfully");
    } catch (error) {
        console.error("❌ Database connection failed:", error.message);
        process.exit(1);
    }
};

export default database;