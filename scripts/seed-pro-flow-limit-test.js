// Seeds 10 Pro-context personal flows for freemember1 and verifies the
// 11th attempt is rejected with FLOW_LIMIT_REACHED. Single-shot script —
// safe to re-run (cleans up any prior `test N` flows it created first).

const flowService = require("../src/services/flow.service");
const { prisma } = require("../src/lib/prisma");

(async () => {
  const email = "freemember1_1776888613180@test.com";
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      hasPro: true,
      currentVersion: true,
      proFlowLimit: true,
      proUnlimitedFlows: true,
    },
  });
  if (!user) {
    console.error("User not found:", email);
    process.exit(1);
  }
  console.log("[seed] user:", user);

  // Clean any leftover test 1..test 11 from previous runs (hard-delete so
  // the limit count starts at 0).
  const cleaned = await prisma.flow.deleteMany({
    where: {
      ownerId: user.id,
      teamId: null,
      appContext: "pro",
      name: { in: Array.from({ length: 11 }, (_, i) => `test ${i + 1}`) },
    },
  });
  console.log(`[seed] cleaned ${cleaned.count} prior test flows`);

  const created = [];
  for (let i = 1; i <= 10; i++) {
    const name = `test ${i}`;
    try {
      const flow = await flowService.createFlow(user.id, { name }, "pro");
      created.push({ id: flow.id, name: flow.name });
      console.log(
        `[seed] +${i.toString().padStart(2, " ")}  ${name}  →  ${flow.id}`,
      );
    } catch (err) {
      console.error(`[seed] FAILED at ${name}:`, err.message);
      process.exit(2);
    }
  }
  console.log(`[seed] created ${created.length} flows`);

  // 11th — must throw FLOW_LIMIT_REACHED
  let elevenResult = "(no result)";
  try {
    await flowService.createFlow(user.id, { name: "test 11" }, "pro");
    elevenResult = "❌ UNEXPECTED SUCCESS — limit not enforced!";
  } catch (err) {
    elevenResult =
      err?.code === "FLOW_LIMIT_REACHED"
        ? `✅ correctly rejected: [${err.code}] ${err.message}`
        : `⚠ rejected with unexpected code: [${err?.code}] ${err?.message}`;
  }
  console.log(`[seed] 11th attempt: ${elevenResult}`);

  // Final state
  const count = await prisma.flow.count({
    where: {
      ownerId: user.id,
      teamId: null,
      appContext: "pro",
      deletedAt: null,
    },
  });
  console.log(`[seed] final pro_personal_flows count: ${count}`);

  await prisma.$disconnect();
  process.exit(0);
})();
