const { prisma } = require("../src/lib/prisma");

async function check() {
  const user = await prisma.user.findUnique({
    where: { email: "mrx@test.com" }
  });
  
  if (!user) {
    console.log("User not found");
    return;
  }
  
  console.log("User details:", {
    id: user.id,
    email: user.email,
    currentVersion: user.currentVersion
  });

  const flows = await prisma.flow.findMany({
    where: { ownerId: user.id },
    select: { 
      id: true, 
      name: true, 
      appContext: true, 
      teamId: true, 
      createdAt: true 
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Found ${flows.length} flows:`);
  console.log(flows);
}

check().catch(console.error).finally(() => prisma.$disconnect());
