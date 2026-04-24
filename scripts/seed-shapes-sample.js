// One-off sample-data seeder for /dashboard/shapes testing.
// Creates 4 groups and drops one shape of every supported type
// (stencil / image / html / shape) into each.
//
//   docker compose exec backend node scripts/seed-shapes-sample.js
//
// Safe to re-run: idempotent on (owner + group name) and (owner + group
// + shape name). Existing rows are skipped, not duplicated.

const { prisma } = require("../src/lib/prisma");

const TARGET_EMAIL = process.env.SEED_USER_EMAIL || "test@valuechart.com";

const SAMPLE_SVG_CIRCLE = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="#3CB371" stroke="#2E8B57" stroke-width="2"/></svg>`;

const SAMPLE_SVG_SQUARE = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect x="4" y="4" width="32" height="32" rx="6" fill="#4ECDC4"/></svg>`;

const SAMPLE_SVG_TRI = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><polygon points="20,4 36,36 4,36" fill="#FAAD14"/></svg>`;

const SAMPLE_SVG_STAR = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><polygon points="20,3 25,15 37,15 27,23 31,36 20,28 9,36 13,23 3,15 15,15" fill="#FF6B6B"/></svg>`;

// tiny 40x40 PNG (base64) — solid green square, for the "image" type
const SAMPLE_IMAGE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAYAAACM/rhtAAAAI0lEQVR42u3OMQEAAAQAMAL+3WxFYRQGKgAgIyMjIyMjI+OvDM0gAcnbl6E/AAAAAElFTkSuQmCC";

const SAMPLE_HTML_BADGE = `<div style="padding:6px 12px;border-radius:14px;background:#F0FFF4;border:1px solid #3CB371;color:#2E8B57;font-weight:600;font-family:Inter,sans-serif">Status</div>`;

const SAMPLE_HTML_CARD = `<div style="padding:12px;border-radius:8px;background:#E6F7FF;border:1px solid #1890FF;color:#003A8C;font-family:Inter,sans-serif"><b>Card</b><br/><span style="font-size:12px">Description</span></div>`;

const SAMPLE_HTML_CALLOUT = `<div style="padding:10px 14px;border-radius:8px;background:#FFFBE6;border-left:4px solid #FAAD14;color:#613400;font-family:Inter,sans-serif">⚡ Quick note</div>`;

const SAMPLE_HTML_PILL = `<div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#722ED115;color:#722ED1;font-weight:600;font-family:Inter,sans-serif;font-size:12px">Tag</div>`;

// Minimal mxGraph stencil XML (valid per draw.io stencil schema)
const STENCIL_XML_BOX = `<shape aspect="variable" h="40" w="60" strokewidth="inherit"><foreground><roundrect arcsize="20"><bounds h="40" w="60" x="0" y="0"/></roundrect><stroke/></foreground></shape>`;

const STENCIL_XML_DIAMOND = `<shape aspect="variable" h="60" w="60" strokewidth="inherit"><foreground><path><move x="30" y="0"/><line x="60" y="30"/><line x="30" y="60"/><line x="0" y="30"/><close/></path><fillstroke/></foreground></shape>`;

const STENCIL_XML_HEX = `<shape aspect="variable" h="52" w="60" strokewidth="inherit"><foreground><path><move x="15" y="0"/><line x="45" y="0"/><line x="60" y="26"/><line x="45" y="52"/><line x="15" y="52"/><line x="0" y="26"/><close/></path><fillstroke/></foreground></shape>`;

const STENCIL_XML_ARROW = `<shape aspect="variable" h="40" w="80" strokewidth="inherit"><foreground><path><move x="0" y="10"/><line x="60" y="10"/><line x="60" y="0"/><line x="80" y="20"/><line x="60" y="40"/><line x="60" y="30"/><line x="0" y="30"/><close/></path><fillstroke/></foreground></shape>`;

// Per-group preset of (4 × shape types).
// Each entry: [stencil, image, html, shape]
const GROUPS = [
  {
    name: "Flowchart Basics",
    shapes: [
      { name: "Rounded Box", type: "stencil", content: SAMPLE_SVG_SQUARE },
      { name: "Node Icon", type: "image", content: SAMPLE_IMAGE_PNG_DATA_URL },
      { name: "Status Badge", type: "html", content: SAMPLE_HTML_BADGE },
      { name: "Process Shape", type: "shape", content: STENCIL_XML_BOX },
    ],
  },
  {
    name: "Decision & Flow",
    shapes: [
      { name: "Diamond", type: "stencil", content: SAMPLE_SVG_TRI },
      {
        name: "Decision Icon",
        type: "image",
        content: SAMPLE_IMAGE_PNG_DATA_URL,
      },
      { name: "Callout Note", type: "html", content: SAMPLE_HTML_CALLOUT },
      { name: "Diamond Shape", type: "shape", content: STENCIL_XML_DIAMOND },
    ],
  },
  {
    name: "UI Components",
    shapes: [
      { name: "Button Stencil", type: "stencil", content: SAMPLE_SVG_CIRCLE },
      {
        name: "Component Image",
        type: "image",
        content: SAMPLE_IMAGE_PNG_DATA_URL,
      },
      { name: "Info Card", type: "html", content: SAMPLE_HTML_CARD },
      { name: "Hex Shape", type: "shape", content: STENCIL_XML_HEX },
    ],
  },
  {
    name: "Signs & Callouts",
    shapes: [
      { name: "Star Sign", type: "stencil", content: SAMPLE_SVG_STAR },
      { name: "Sign Image", type: "image", content: SAMPLE_IMAGE_PNG_DATA_URL },
      { name: "Tag Pill", type: "html", content: SAMPLE_HTML_PILL },
      { name: "Arrow Shape", type: "shape", content: STENCIL_XML_ARROW },
    ],
  },
];

async function upsertGroup(userId, name) {
  const existing = await prisma.shapeGroup.findFirst({
    where: { userId, name, deletedAt: null },
  });
  if (existing) return existing;
  return prisma.shapeGroup.create({
    data: {
      name,
      userId,
      appContext: "free",
      isPredefined: false,
    },
  });
}

async function upsertShape(ownerId, groupId, s) {
  const existing = await prisma.shape.findFirst({
    where: { ownerId, groupId, name: s.name, deletedAt: null },
  });
  if (existing) return { shape: existing, created: false };
  const shape = await prisma.shape.create({
    data: {
      name: s.name,
      type: s.type, // "stencil" | "image" | "html" | "shape"
      shapeType:
        s.type === "image"
          ? "img"
          : s.type === "html"
            ? "html"
            : s.type === "shape"
              ? "shape"
              : "stencil",
      content: s.content,
      textAlignment: "bottom",
      ratioLock: true,
      ownerId,
      groupId,
      appContext: "free",
      isPublic: false,
    },
  });
  return { shape, created: true };
}

(async () => {
  console.log(`[seed-shapes] Seeding for ${TARGET_EMAIL}`);
  const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!user) {
    console.error(
      `User ${TARGET_EMAIL} not found. Set SEED_USER_EMAIL env var or create the user first.`,
    );
    process.exit(1);
  }
  console.log(`[seed-shapes] userId = ${user.id}`);

  let groupsCreated = 0;
  let shapesCreated = 0;

  for (const g of GROUPS) {
    const group = await upsertGroup(user.id, g.name);
    const preExisting = await prisma.shape.count({
      where: { groupId: group.id, deletedAt: null },
    });
    if (preExisting === 0) groupsCreated++;
    console.log(`  ✔ group "${g.name}" (${group.id})`);

    for (const s of g.shapes) {
      const { shape, created } = await upsertShape(user.id, group.id, s);
      if (created) shapesCreated++;
      console.log(
        `    ${created ? "+" : "="} ${s.type.padEnd(7)} — ${shape.name}`,
      );
    }
  }

  console.log(
    `\n[seed-shapes] Done. Groups ${GROUPS.length} (+${groupsCreated} new), Shapes ${shapesCreated} new.`,
  );
  await prisma.$disconnect();
})();
