import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env") });

if (process.env.NODE_ENV === "dev") {
    dotenv.config({
        path: path.join(rootDir, ".env.local"),
        override: true,
    });
}