// Mock Prisma client for tests
const mockPrisma = {
    user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
    },
    flow: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
    },
    shape: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
    },
    shapeGroup: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
    },
    subscription: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    plan: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    team: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
    },
    teamMember: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
    },
    teamInvite: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    chatGroup: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    chatGroupUser: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        delete: jest.fn(),
    },
    chatMessage: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
    },
    chatMessageUser: {
        createMany: jest.fn(),
        updateMany: jest.fn(),
    },
    issueItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
    },
    transactionLog: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
    },
    flowLimit: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
    },
    passwordReset: {
        findFirst: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
    },
    offer: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
    },
    promoCode: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
    feedbackQuery: {
        findMany: jest.fn(),
        count: jest.fn(),
    },
    userFreeTrial: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    },
    userAction: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
    },
    $disconnect: jest.fn(),
    $transaction: jest.fn((fns) => {
        if (typeof fns === 'function') {
            return fns(mockPrisma);
        }
        return Promise.all(fns);
    }),
};

jest.mock('../src/lib/prisma', () => ({
    prisma: mockPrisma,
}));

// Mock OpenAI
jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => ({
        chat: {
            completions: {
                create: jest.fn().mockResolvedValue({
                    choices: [{ message: { content: '<xml>test</xml>' } }],
                }),
            },
        },
    }));
});

// Mock Google Generative AI
jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: jest.fn().mockResolvedValue({
                response: {
                    text: () => '```json\n{"nodes":[],"edges":[]}\n```',
                },
            }),
        }),
    })),
}));

// Mock email utility
jest.mock('../src/utils/email', () => ({
    sendTeamInviteEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

// Mock stripe - use manual mock since stripe may not be installed locally
try {
    require.resolve('stripe');
    jest.mock('stripe', () => {
        return jest.fn().mockImplementation(() => ({
            checkout: {
                sessions: {
                    create: jest.fn().mockResolvedValue({
                        id: 'cs_test_123',
                        url: 'https://checkout.stripe.com/test',
                    }),
                },
            },
            webhooks: {
                constructEvent: jest.fn(),
            },
        }));
    });
} catch {
    // stripe not installed locally, mock the service's getStripe method instead
}

// Set test env vars
process.env.NEXTAUTH_SECRET = 'test-secret-for-jwt-verification-minimum-length';
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';

module.exports = { mockPrisma };
