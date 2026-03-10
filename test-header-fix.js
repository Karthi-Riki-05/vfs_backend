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
      hostname: "127.0.0.1", port: 5000, path, method,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    };
    const r = http.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
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
  const sb = await req("GET", "/api/v1/chat/sidebar");
  const sd = sb.data;

  // Find the Tanlux group and the Test team
  const tanluxGroup = sd.groups.find((g) => g.title === "Tanlux");
  const testTeam = sd.teams.find((t) => t.name === "Test");

  console.log("--- Sidebar State ---");
  console.log("Groups:", sd.groups.map((g) => g.title + " (id=" + g.id + ", members=" + g._count.members + ")").join(", "));
  console.log("Teams:", sd.teams.map((t) => t.name).join(", "));
  console.log("Contacts:", sd.contacts.map((c) => c.name + " (convId=" + c.conversationId + ")").join(", "));
  console.log("");

  // KEY TEST: Does any contact link to the Tanlux group?
  const contactLinkedToTanlux = sd.contacts.find((c) => c.conversationId === (tanluxGroup && tanluxGroup.id));
  console.log("--- DM Detection Logic ---");
  console.log("Contact linked to Tanlux group?", contactLinkedToTanlux ? "YES (would be treated as DM)" : "NO (treated as group)");

  // The Tanlux group should NOT be linked as a contact's DM
  // It should only be linked if it's the ONLY 2-member group with that contact
  // But since we also have the DM group, the DM group should be linked instead

  // Check: Is there a separate DM for User1?
  const user1Contact = sd.contacts.find((c) => c.id === USER1_ID);
  console.log("User1 contact conversationId:", user1Contact ? user1Contact.conversationId : "N/A");
  console.log("");

  // Now simulate what the frontend does:
  // When "Tanlux" is selected, selectedIsDm should be false
  // When the DM is selected (if it exists), selectedIsDm should be true

  console.log("--- Frontend Header Simulation ---");

  // Simulate selecting "Tanlux" group
  if (tanluxGroup) {
    const isDm = sd.contacts.some((c) => c.conversationId === tanluxGroup.id);
    const headerName = isDm ? (sd.contacts.find((c) => c.conversationId === tanluxGroup.id).name) : tanluxGroup.title;
    const headerStatus = isDm ? "Online/Offline" : tanluxGroup._count.members + " members";
    check("Tanlux header shows group name", headerName === "Tanlux");
    check("Tanlux header shows member count", headerStatus === "2 members");
    console.log("  -> Header: " + headerName + " - " + headerStatus);
  } else {
    check("Tanlux group exists", false);
  }

  // Simulate selecting "Test" team
  if (testTeam && testTeam.conversationId) {
    const teamGroup = sd.allGroups.find((g) => g.id === testTeam.conversationId);
    if (teamGroup) {
      const isDm = sd.contacts.some((c) => c.conversationId === teamGroup.id);
      const headerName = isDm ? "WRONG" : teamGroup.title;
      check("Test team header shows team name", headerName === "Test");
      console.log("  -> Header: " + headerName + " - " + teamGroup._count.members + " members");
    }
  }

  // Simulate selecting User1 DM (if it exists)
  if (user1Contact && user1Contact.conversationId) {
    const dmGroup = sd.allGroups.find((g) => g.id === user1Contact.conversationId);
    if (dmGroup) {
      const isDm = sd.contacts.some((c) => c.conversationId === dmGroup.id);
      const contact = sd.contacts.find((c) => c.conversationId === dmGroup.id);
      const headerName = isDm ? (contact.name || contact.email) : dmGroup.title;
      check("User1 DM header shows user name", headerName === "User1");
      check("User1 DM detected as DM", isDm === true);
      console.log("  -> Header: " + headerName + " - Online/Offline");
    }
  } else {
    console.log("  No DM exists for User1 yet (will be created on click)");
    // Create a DM to test
    const dmRes = await req("POST", "/api/v1/chat/groups", { title: "User1", memberIds: [USER1_ID] });
    const dmId = dmRes.data.id;

    // Re-fetch sidebar
    const sb2 = await req("GET", "/api/v1/chat/sidebar");
    const sd2 = sb2.data;
    const u1c = sd2.contacts.find((c) => c.id === USER1_ID);
    check("User1 DM linked after creation", u1c && u1c.conversationId === dmId);

    // Now check: is Tanlux STILL not treated as DM?
    const tanlux2 = sd2.groups.find((g) => g.title === "Tanlux");
    const tanluxIsDm = sd2.contacts.some((c) => c.conversationId === (tanlux2 && tanlux2.id));
    check("Tanlux NOT treated as DM (after DM created)", tanluxIsDm === false);

    // Check the DM IS treated as DM
    const dmIsDm = sd2.contacts.some((c) => c.conversationId === dmId);
    check("User1 DM IS treated as DM", dmIsDm === true);

    console.log("  Tanlux linked as DM?", tanluxIsDm);
    console.log("  User1 DM linked?", dmIsDm, "id:", dmId);

    // Clean up
    await req("DELETE", "/api/v1/chat/groups/" + dmId);
  }

  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  if (fail > 0) process.exit(1);
})();
