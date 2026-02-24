const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Since we are using NextAuth JWT strategy, the token is encrypted with NEXTAUTH_SECRET
        // However, for direct backend communication if we want to be simple for now
        // we can expect a token that contains the user id.
        // In a real decoupled app, we might use a shared secret.

        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET || 'supersecret');
        req.user = { id: decoded.sub, ...decoded };
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

module.exports = { authenticate };
