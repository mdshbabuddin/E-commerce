import jwt from "jsonwebtoken";
import { sanitizeUser } from "./sanitizeUser.js";

// The dashboard sends the header "X-Client: dashboard", so it gets its own cookie
export const getCookieName = (req) =>
    req.headers["x-client"] === "dashboard" ? "adminToken" : "token";

export const getCookieOptions = () => {
    const isProd = process.env.NODE_ENV === "production";
    const allowed = ["lax", "strict", "none"];
    const configured = (process.env.COOKIE_SAMESITE || "").toLowerCase();
    const sameSite = allowed.includes(configured)
        ? configured
        : isProd
        ? "none"
        : "lax";

    return {
        httpOnly: true,
        secure: isProd || sameSite === "none",
        sameSite,
    };
};

export const sendToken = (user, statusCode, message, res) => {
    const token = jwt.sign({ id: user.id}, process.env.JWT_SECRET_KEY, {
        expiresIn: process.env.JWT_EXPIRES_IN,
    });

    res.status(statusCode).cookie(getCookieName(res.req), token, {
        expires: new Date(Date.now() + process.env.COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
        ...getCookieOptions(),
    }).json({
        success: true,
        user: sanitizeUser(user),
        message,
    });
};