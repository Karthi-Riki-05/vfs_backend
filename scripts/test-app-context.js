#!/usr/bin/env node
// Test script to verify that app_context is assigned correctly via controllers.

const flowController = require("../src/controllers/flow.controller");
const projectController = require("../src/controllers/project.controller");

async function testAppContext() {
  console.log("Testing app_context assignment...");

  let capturedContext = null;

  // We will mock the service to just capture the appContext passed to it
  const flowService = require("../src/services/flow.service");
  const originalCreateFlow = flowService.createFlow;
  
  flowService.createFlow = async (userId, data, appContext) => {
    capturedContext = appContext;
    return { id: "test-flow", appContext };
  };

  const projectService = require("../src/services/project.service");
  const originalCreateProject = projectService.createProject;

  projectService.createProject = async (userId, data, appContext) => {
    capturedContext = appContext;
    return { id: "test-project", appContext };
  };

  const mockRes = {
    status: () => mockRes,
    json: () => {}
  };

  // Test 1: Team app (x-app-context header is 'team')
  // Free user in Team app
  const req1 = {
    user: { id: "user1", currentVersion: "free" },
    headers: { "x-app-context": "team" },
    body: { name: "Test Flow" }
  };
  
  await flowController.createFlow(req1, mockRes, () => {});
  if (capturedContext === "team") {
    console.log("✅ Test 1 Passed: Free user in Team app gets 'team' context.");
  } else {
    console.error(`❌ Test 1 Failed: Expected 'team', got '${capturedContext}'`);
  }

  // Test 2: Pro app (x-app-context header is 'pro')
  // Pro user in Pro app
  const req2 = {
    user: { id: "user2", currentVersion: "pro" },
    headers: { "x-app-context": "pro" },
    body: { name: "Test Flow" }
  };
  
  await flowController.createFlow(req2, mockRes, () => {});
  if (capturedContext === "pro") {
    console.log("✅ Test 2 Passed: Pro user in Pro app gets 'pro' context.");
  } else {
    console.error(`❌ Test 2 Failed: Expected 'pro', got '${capturedContext}'`);
  }

  // Test 3: Free app (no header, fallback to currentVersion)
  const req3 = {
    user: { id: "user3", currentVersion: "free" },
    headers: {},
    body: { name: "Test Flow" }
  };
  
  await flowController.createFlow(req3, mockRes, () => {});
  if (capturedContext === "free") {
    console.log("✅ Test 3 Passed: Free user without header gets 'free' context.");
  } else {
    console.error(`❌ Test 3 Failed: Expected 'free', got '${capturedContext}'`);
  }

  // Test 4: Project Creation in Team App
  const req4 = {
    user: { id: "user1", currentVersion: "free" },
    headers: { "x-app-context": "team" },
    body: { name: "Test Project", teamId: "team-id-123" }
  };

  // Note: project controller overwrites appContext to 'team' if teamId is present
  await projectController.createProject(req4, mockRes, () => {});
  if (capturedContext === "team") {
    console.log("✅ Test 4 Passed: Project creation gets 'team' context.");
  } else {
    console.error(`❌ Test 4 Failed: Expected 'team', got '${capturedContext}'`);
  }

  // Restore mocks
  flowService.createFlow = originalCreateFlow;
  projectService.createProject = originalCreateProject;

  console.log("Tests complete.");
}

testAppContext().catch(console.error);
