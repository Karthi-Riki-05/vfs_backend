const http = require("http");

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "127.0.0.1", port: 5000, path, method, family: 4,
      headers: { "Content-Type": "application/json" },
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
  // 1. Test forgot password with valid email
  console.log("--- Step 1: Forgot password (valid email) ---");
  const res1 = await req("POST", "/api/v1/users/forgot-password", { email: "karthick.webronic@gmail.com" });
  console.log("Status:", res1.status, "Response:", JSON.stringify(res1.data));
  check("Forgot password returns 200", res1.status === 200);
  check("Returns success message", res1.data?.success === true);

  // 2. Test forgot password with non-existent email (should still return 200)
  console.log("\n--- Step 2: Forgot password (non-existent email) ---");
  const res2 = await req("POST", "/api/v1/users/forgot-password", { email: "nonexistent@example.com" });
  console.log("Status:", res2.status);
  check("Non-existent email returns 200 (no reveal)", res2.status === 200);

  // 3. Test reset password with invalid token
  console.log("\n--- Step 3: Reset password (invalid token) ---");
  const res3 = await req("POST", "/api/v1/users/reset-password", { token: "invalidtoken", password: "newpassword123" });
  console.log("Status:", res3.status);
  check("Invalid token returns error", res3.status !== 200);

  // 4. Test reset password with missing fields
  console.log("\n--- Step 4: Reset password (missing password) ---");
  const res4 = await req("POST", "/api/v1/users/reset-password", { token: "sometoken" });
  console.log("Status:", res4.status);
  check("Missing password returns 400", res4.status === 400);

  console.log("\n=== " + pass + " passed, " + fail + " failed ===");
  if (fail > 0) process.exit(1);
})();
