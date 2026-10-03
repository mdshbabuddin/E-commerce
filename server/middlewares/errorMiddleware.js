class ErrorHandler extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

export const errorMiddleware = (err, req, res, next) => {
    // Log the original error first, so you can still see the real cause in the terminal
    console.log(err);

    err.message = err.message || "Internal Server Error";
    err.statusCode = err.statusCode || 500;

    // PostgreSQL error codes are TEXT, so they must be compared with quotes
    if (err.code === "23505") {
        err = new ErrorHandler("Duplicate field value entered", 400);
    } else if (["22P02", "23514", "23502"].includes(err.code)) {
        err = new ErrorHandler("Invalid input.", 400);
    } else if (err.code === "22001") {
        err = new ErrorHandler("One of the values you entered is too long.", 400);
    } else if (["23503", "23001"].includes(err.code)) {
        err = new ErrorHandler(
            "This item is linked to other records and cannot be changed or deleted.",
            409
        );
    }

    if (err.name === "JsonWebTokenError") {
        const message = "Invalid token. Please log in again.";
        err = new ErrorHandler(message, 401);
    }

    if (err.name === "TokenExpiredError") {
        const message = "Your token has expired. Please log in again.";
        err = new ErrorHandler(message, 401);
    }

    let errorMessage = err.errors
        ? Object.values(err.errors)
        .map((val) => val.message)
        .join(" ")
        : err.message;

    // In production, hide the details of unexpected server errors
    if (
        process.env.NODE_ENV === "production" &&
        err.statusCode === 500 &&
        !(err instanceof ErrorHandler)
    ) {
        errorMessage = "Internal Server Error";
    }

    return res.status(err.statusCode).json({
        success: false,
        message: errorMessage,
    });
};

export default ErrorHandler;