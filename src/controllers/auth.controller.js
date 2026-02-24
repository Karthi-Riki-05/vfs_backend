const { prisma } = require('../lib/prisma');
const argon2 = require('argon2');

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        console.log(req.body);

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ error: "User already exists" });
        }

        const hashedPassword = await argon2.hash(password);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'Viewer' // Default role
            }
        });

        res.status(201).json({
            message: "User registered successfully",
            userId: user.id
        });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.validateUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user || !user.password) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isValid = await argon2.verify(user.password, password);

        if (!isValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
        });
    } catch (error) {
        console.error("Auth validation error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
