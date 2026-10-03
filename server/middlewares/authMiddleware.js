import jwt from "jsonwebtoken";
import { catchAsyncErrors } from "./catchAsyncError.js";
import ErrorHandler from "./errorMiddleware.js";
import database from "../database/db.js";
import { getCookieName } from "../utils/jwtToken.js";

export const isAuthenticated = catchAsyncErrors( async( req, res, next ) => {
    const isDashboard = req.headers["x-client"] === "dashboard";
    const token = req.cookies[getCookieName(req)];
    if(!token) {
        return next(new ErrorHandler("Please login to access this resource.", 401));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    const user = await database.query("SELECT * FROM users WHERE id = $1 LIMIT 1",
        [decoded.id]
    );
    if (!user.rows[0]) {
        return next(new ErrorHandler("User not found. Please login again.", 401));
    }
    req.user = user.rows[0];

    if (isDashboard && req.user.role !== "Admin") {
        return next(new ErrorHandler("Admin access only.", 403));
    }
    next();
})

export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)){
            return next(
            new ErrorHandler(
            `Role: ${req.user.role} is not allowed to access this resource.`,
            403
            )
        );
        }
        next();
    };
};