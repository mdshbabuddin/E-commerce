export const sendEmail = async ({ email, subject, message }) => {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "api-key": process.env.BREVO_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            sender: {
                name: process.env.BREVO_SENDER_NAME || "MyShop",
                email: process.env.SMTP_MAIL,
            },
            to: [{ email }],
            subject,
            htmlContent: message,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.log("EMAIL ERROR:", response.status, errorText);
        throw new Error(`Email service error: ${response.status}`);
    }

    console.log("Email sent successfully");
};