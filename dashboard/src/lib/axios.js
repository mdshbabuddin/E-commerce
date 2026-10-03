import axios from "axios";

const baseURL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:4000/api/v1"
    : "/api/v1");

export const axiosInstance = axios.create({
  baseURL,
  withCredentials: true,
  headers: { "X-Client": "dashboard" },
});