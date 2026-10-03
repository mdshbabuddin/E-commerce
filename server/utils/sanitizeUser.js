export const sanitizeUser = ({
    password_hash,
    reset_password_token,
    reset_password_expire,
    ...safe
}) => safe;