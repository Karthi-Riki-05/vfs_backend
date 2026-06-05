const { prisma } = require("../src/lib/prisma");

async function fix() {
  const user = await prisma.user.findUnique({
    where: { email: "mrx@test.com" }
  });
  
  if (!user) {
    console.log("User not found");
    return;
  }
  
  const result = await prisma.flow.updateMany({
    where: { 
      ownerId: user.id,
      appContext: 'free'
    },
    data: {
      appContext: 'team'
    }
  });

  console.log(`Updated ${result.count} flows to appContext: 'team' for mrx@test.com.`);
}

fix().catch(console.error).finally(() => prisma.$disconnect());
