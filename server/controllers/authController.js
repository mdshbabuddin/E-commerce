import ErrorHandler from "../middlewares/errorMiddleware.js";
import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import bcrypt from "bcrypt";
import { sendToken, getCookieName, getCookieOptions } from "../utils/jwtToken.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";
import { generateEmailTemplate } from "../utils/generateForgotPasswordEmailTemplate.js";
import { generateResetPasswordToken } from "../utils/generateResetPasswordToken.js";
import { sendEmail } from "../utils/sendEmail.js";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";

export const register = catchAsyncErrors(async (req, res, next) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password){
        return next(new ErrorHandler("Please provide all required fields.", 400));
    }

    if (
        password.length < 8 ||
        password.length > 16 
     ) {
        return next(
            new ErrorHandler("Password must be between 8 and 16 characters.", 400)
        );
    }

    const isAlreadyRegistered = await database.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
    );

    if(isAlreadyRegistered.rows.length > 0){
        return next(new ErrorHandler("User already registered with this email.", 400));
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await database.query(
        "INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING *",
        [name, email, hashedPassword]
    );
    sendToken(user.rows[0], 201, "User registration successfully.", res);
}); 

export const login = catchAsyncErrors(async(req, res, next) => {
    const {email, password} = req.body;
    if (!email || !password){
        return next(new ErrorHandler("Please provide email and password.", 400));
    }
    const user = await database.query(`SELECT * FROM users WHERE email = $1`,[
        email,
    ]);
    if (user.rows.length === 0) {
        return next(new ErrorHandler("Invalid email and password.", 401));
    }
    const isPasswordMatch = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!isPasswordMatch) {
        return next(new ErrorHandler("Invalid email and password.", 401));
    }
    if (req.headers["x-client"] === "dashboard" && user.rows[0].role !== "Admin") {
        return next(new ErrorHandler("Admin access only.", 403));
    }
    sendToken(user.rows[0], 200, "Logged In.", res);
} );

export const getUser = catchAsyncErrors(async(req, res, next) => {
    const { user } = req;
    res.status(200).json({
        success: true,
        user: sanitizeUser(user),
    });
} );

export const logout = catchAsyncErrors(async(req, res, next) => {
    res.status(200).cookie(getCookieName(req), "", {
        expires: new Date(Date.now()),
        ...getCookieOptions(),
    })
    .json ({
        success:true,
        message: "Logged out successfully.",
    });
} );

export const forgotPassword = catchAsyncErrors(async (req, res, next) => {
    const {email} = req.body;
    const {frontendUrl} = req.query;

    // Only allow our own websites in the reset link
    const allowedUrls = [process.env.FRONTEND_URL, process.env.DASHBOARD_URL].filter(Boolean);
    const baseUrl = allowedUrls.includes(frontendUrl) ? frontendUrl : process.env.FRONTEND_URL;
    if (!baseUrl) {
        return next(new ErrorHandler("Server is not configured correctly.", 500));
    }

    const genericMessage =
        "If an account exists with this email, a password reset link has been sent.";

    let userResult = await database.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
    );
    if (userResult.rows.length === 0) {
        return res.status(200).json({
            success: true,
            message: genericMessage,
        });
    }
    const user = userResult.rows[0];
    const { hashedToken, resetPasswordExpireTime, resetToken } =
        generateResetPasswordToken();

    await database.query(`UPDATE users SET reset_password_token = $1, reset_password_expire = to_timestamp($2) WHERE email = $3`, [hashedToken, resetPasswordExpireTime / 1000, email]
    );

    const resetPasswordUrl = `${baseUrl}/password/reset/${resetToken}`;

    const message = generateEmailTemplate(resetPasswordUrl);

    try {
        await sendEmail({
            email: user.email,
            subject: "Ecommerce Password Recovery",
            message,
        });
        res.status(200).json({
            success: true,
            message: genericMessage,
        });
    } catch (error) {
        await database.query(
            `UPDATE users SET reset_password_token = NULL, reset_password_expire = NULL WHERE email = $1`,
            [email]
        );
        return next(new ErrorHandler("Email could not be sent.", 500));
    }
});

export const resetPassword = catchAsyncErrors(async (req, res, next) => {
    const {token} = req.params;
    const resetPasswordToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
    const user = await database.query("SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expire > NOW()",
        [resetPasswordToken]
    );
    if( user.rows.length === 0){
        return next(new ErrorHandler("Passwords do not match.", 400));
    }
    if (
        req.body.password?.length < 8 ||
        req.body.password?.length > 16 ||
        req.body.confirmPassword?.length < 8 ||
        req.body.confirmPassword?.length > 16
    ) {
        return next(
            new ErrorHandler("Password must be between 8 and 16 characters.", 400)
        );
    }
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const updatedUser = await database.query(
        `UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expire = NULL WHERE id = $2
        RETURNING *`,
        [hashedPassword, user.rows[0].id]
    );
    sendToken(updatedUser.rows[0], 200, "Password reset successfully", res);
});

export const updatePassword = catchAsyncErrors(async (req, res, next) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
        return next(new ErrorHandler("Please provide all required fields.", 400));
    }
    const isPasswordMatch = await bcrypt.compare(
        currentPassword,
        req.user.password_hash
    );
    if (!isPasswordMatch) {
        return next(new ErrorHandler("Current Password is incorrect.", 401));
    }
    if (newPassword !== confirmPassword) {
        return next(new ErrorHandler("New password and confirm does not match", 400));
    }
    if (
        newPassword.length < 8 ||
        newPassword.length > 16 ||
        confirmPassword.length < 8 ||
        confirmPassword.length > 16
    ) {
        return next(
            new ErrorHandler("Password must be between 8 and 16 characters.", 400)
        );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await database.query(
        `UPDATE users SET password_hash = $1 WHERE id = $2`,
        [hashedPassword, req.user.id]
    );
    res.status(200).json({
        success: true,
        message: "Password updated successfully.",
    });
})

export const updateProfile = catchAsyncErrors(async (req, res, next) => {
    const { name, email } = req.body;
    if (!name || !email) {
        return next(new ErrorHandler("Please provide all required fields.", 400));
    }
    if (name.trim().length === 0 || email.trim().length === 0) {
        return next(new ErrorHandler("Name and email cannot be empty.", 400));
    }
    let avatarData = {};
    if (req.files && req.files.avatar) {
        const {avatar} = req.files;
        if( req.user?.avatar?.public_id){
            await cloudinary.uploader.destroy(req.user.avatar.public_id);
        }
        const newProfileImage = await cloudinary.uploader.upload(avatar.tempFilePath, {
            folder: "ecommerce_avatars",
            width: 150,
            crop: "scale",
        });
        avatarData = {
            public_id: newProfileImage.public_id,
            url: newProfileImage.secure_url,
        };
    }
    let user;
    if (Object.keys(avatarData).length === 0) {
        user = await database.query(
            `UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *`,
            [name, email, req.user.id]
        );
    } else {
        user = await database.query(
            `UPDATE users SET name = $1, email = $2, avatar = $3 WHERE id = $4 RETURNING *`,
            [name, email, avatarData, req.user.id]
        );
    }
    res.status(200).json({
        success: true,
        message: "Profile updated successfully.",
        user: sanitizeUser(user.rows[0])
    });
});