const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production'
        ? ['warn', 'error']
        : ['query', 'info', 'warn', 'error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});

// Graceful shutdown helper
const disconnectPrisma = async () => {
    await prisma.$disconnect();
};

module.exports = { prisma, disconnectPrisma };
