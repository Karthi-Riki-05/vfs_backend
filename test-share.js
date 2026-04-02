const jwt = require("jsonwebtoken");
const http = require("http");

const KARTHICK_ID = "cmmiwu4ku0000s4qx8elz2l67";
const USER1_ID = "cmmjezm460000xj0z70cukxha";
const token = jwt.sign(
  { id: KARTHICK_ID, role: "admin" },
  process.env.NEXTAUTH_SECRET || "supersecret",
  { expiresIn: "1h" }
);

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "127.0.0.1", port: 5000, path, method, family: 4,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    };
    const r = http.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log("PASS: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

(async () => {
  // 1. Get available share members
  console.log("--- Step 1: Get available share members ---");
  const members = await req("GET", "/api/v1/flows/share/members");
  console.log("Members status:", members.status);
  console.log("Members:", JSON.stringify(members.data?.data?.map(m => m.name)));
  check("Get share members returns 200", members.status === 200);

  // 2. Get flows list
  console.log("\n--- Step 2: Get flows list ---");
  const flowsRes = await req("GET", "/api/v1/flows");
  const flowsData = flowsRes.data?.data;
  console.log("Flows count:", flowsData?.flows?.length);
  console.log("Has shared array:", Array.isArray(flowsData?.shared));
  check("Flows list includes shared array", Array.isArray(flowsData?.shared));

  if (!flowsData?.flows?.length) {
    console.log("No flows found — creating one for test");
    const createRes = await req("POST", "/api/v1/flows", { name: "Test Share Flow" });
    console.log("Created:", createRes.data?.data?.id);
  }

  // Re-fetch
  const flows2 = await req("GET", "/api/v1/flows");
  const testFlow = flows2.data?.data?.flows?.[0];
  if (!testFlow) {
    console.log("SKIP: No flow to test sharing with");
    process.exit(0);
  }
  console.log("Test flow:", testFlow.id, testFlow.name);
  check("Flow has accessType", testFlow.accessType === 'owner');
  check("Flow has shareCount", typeof testFlow.shareCount === 'number');

  // 3. Get flow by ID — should include permission
  console.log("\n--- Step 3: Get flow by ID ---");
  const flowById = await req("GET", "/api/v1/flows/" + testFlow.id);
  console.log("Permission:", flowById.data?.data?.permission);
  check("Flow by ID has permission field", flowById.data?.data?.permission === 'owner');

  // 4. Share flow with User1
  console.log("\n--- Step 4: Share flow ---");
  const shareRes = await req("POST", "/api/v1/flows/" + testFlow.id + "/share", {
    shares: [{ userId: USER1_ID, permission: "view" }]
  });
  console.log("Share result:", JSON.stringify(shareRes.data?.data));
  const shareResult = shareRes.data?.data;
  check("Share returns success", shareRes.status === 200 && Array.isArray(shareResult));

  // 5. Get shares
  console.log("\n--- Step 5: Get shares ---");
  const sharesRes = await req("GET", "/api/v1/flows/" + testFlow.id + "/shares");
  const sharesList = sharesRes.data?.data;
  console.log("Shares count:", sharesList?.length);
  check("Has one share", sharesList?.length === 1);

  if (sharesList?.length > 0) {
    const share = sharesList[0];
    console.log("Share:", share.id, share.permission, share.sharedWith?.name);
    check("Share has correct permission", share.permission === "view");
    check("Share has user info", !!share.sharedWith?.id);

    // 6. Update permission
    console.log("\n--- Step 6: Update permission ---");
    const updateRes = await req("PUT", "/api/v1/flows/" + testFlow.id + "/shares/" + share.id, { permission: "edit" });
    check("Update permission returns 200", updateRes.status === 200);

    // 7. Verify shared flows appear for user1
    console.log("\n--- Step 7: Check shared flows for owner ---");
    const flows3 = await req("GET", "/api/v1/flows");
    const ownerFlow = flows3.data?.data?.flows?.find(f => f.id === testFlow.id);
    console.log("Owner flow shareCount:", ownerFlow?.shareCount);
    check("Owner sees share count", ownerFlow?.shareCount === 1);

    // 8. Remove share
    console.log("\n--- Step 8: Remove share ---");
    const removeRes = await req("DELETE", "/api/v1/flows/" + testFlow.id + "/shares/" + share.id);
    check("Remove share returns 200", removeRes.status === 200);

    // Verify removed
    const shares2 = await req("GET", "/api/v1/flows/" + testFlow.id + "/shares");
    check("No shares after removal", shares2.data?.data?.length === 0);
  }

  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  if (fail > 0) process.exit(1);
})();
