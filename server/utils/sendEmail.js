import nodeMailer from "nodemailer";

export const sendEmail = async({ email, subject, message}) => {


    const transporter = nodeMailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.SMTP_MAIL,
            pass: process.env.SMTP_PASSWORD,
        },
    });

     // 🔥 ADD THIS (VERY IMPORTANT)
    try {
        await transporter.verify();
        console.log("SMTP connection successful");
    } catch (err) {
        console.log("SMTP ERROR:", err); // 🔴 THIS WILL SHOW REAL PROBLEM
        throw err;
    }

    const mailOptions = {
        from: process.env.SMTP_MAIL,
        to: email,
        subject,
        html: message,
    };
    await transporter.sendMail(mailOptions);
};