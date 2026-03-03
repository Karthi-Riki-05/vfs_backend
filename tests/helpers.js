const jwt = require('jsonwebtoken');

const generateTestToken = (userId = 'test-user-id', role = 'Viewer') => {
    return jwt.sign(
        { sub: userId, email: 'test@example.com', name: 'Test User', role },
        process.env.NEXTAUTH_SECRET,
        { expiresIn: '1h' }
    );
};

const generateExpiredToken = () => {
    return jwt.sign(
        { sub: 'test-user-id', email: 'test@example.com' },
        process.env.NEXTAUTH_SECRET,
        { expiresIn: '-1h' }
    );
};

module.exports = { generateTestToken, generateExpiredToken };
