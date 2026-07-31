import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright-core";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const appEntryPath = path.resolve(desktopRoot);
const browserFixtureUrl = "https://blackrain-e2e.test/fixture";
const browserPartition = "persist:blackrain-browser-app";
const runRealAgentE2e = process.env.BLACKRAIN_ELECTRON_REAL_AGENT_E2E === "1";
const resourceReportPath = process.env.BLACKRAIN_BROWSER_RESOURCE_REPORT?.trim();
const probeStartedAt = performance.now();
const browserFixtureHtml = `<!doctype html>
  <html>
    <head><title>BlackRain Browser Fixture</title></head>
    <body>
      <main>
        <label>测试输入 <input aria-label="测试输入" value="before"></label>
        <button aria-label="应用输入">应用</button>
        <output aria-label="结果">before</output>
        <button aria-label="立即购买">立即购买</button>
        <output aria-label="购买次数">0</output>
        <label>上传文件 <input type="file" aria-label="上传文件"></label>
        <iframe title="跨域测试框架" src="https://blackrain-frame.test/frame"></iframe>
      </main>
      <section aria-hidden="true" style="height: 1800px"></section>
      <script>
        const input = document.querySelector("input");
        const output = document.querySelector("output");
        document.querySelector("button").addEventListener("click", () => {
          output.textContent = input.value;
        });
        const purchaseButton = document.querySelector('[aria-label="立即购买"]');
        const purchaseCount = document.querySelector('[aria-label="购买次数"]');
        purchaseButton.addEventListener("click", () => {
          purchaseCount.textContent = String(Number(purchaseCount.textContent) + 1);
        });
      </script>
    </body>
  </html>`;
const browserFrameHtml = `<!doctype html>
  <html>
    <head><title>BlackRain Cross Origin Frame</title></head>
    <body>
      <input aria-label="跨域输入" value="frame before">
      <button aria-label="跨域框架按钮">跨域框架按钮</button>
      <script>
        const frameInput = document.querySelector("input");
        document.querySelector("button").addEventListener("click", (event) => {
          const result = "跨域已点击 " + frameInput.value;
          event.currentTarget.setAttribute("aria-label", result);
          event.currentTarget.textContent = result;
        });
      </script>
    </body>
  </html>`;
const appDataPath = await mkdtemp(
  path.join(os.tmpdir(), "blackrain-electron-e2e-"),
);

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.NODE_OPTIONS;
delete environment.NODE_PATH;
delete environment.BLACKRAIN_ELECTRON_SMOKE;
delete environment.BLACKRAIN_ELECTRON_SMOKE_RESULT;
environment.BLACKRAIN_ELECTRON_E2E = "1";
environment.BLACKRAIN_ELECTRON_TEST_APP_DATA = appDataPath;
if (runRealAgentE2e) {
  environment.BLACKRAIN_CODEX_BIN = path.join(
    desktopRoot,
    "resources",
    "codex",
    "windows-x64",
    "bin",
    "codex.exe",
  );
}

let electronApplication;
let startupMs = 0;
let resourceBaseline;
const logStage = (stage) => {
  console.log(`[electron-e2e] ${new Date().toISOString()} ${stage}`);
};
const withStageTimeout = (promise, stage, timeoutMs = 45_000) => {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`[electron-e2e] ${stage} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
};
const pollForValue = async (probe, stage, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`[electron-e2e] ${stage} timed out after ${timeoutMs}ms`);
};
const captureResourceMetrics = () =>
  electronApplication.evaluate(({ app }) => {
    const processes = app.getAppMetrics().map((metric) => ({
      type: metric.type,
      serviceName: metric.serviceName,
      workingSetSizeKb: metric.memory?.workingSetSize ?? 0,
      peakWorkingSetSizeKb: metric.memory?.peakWorkingSetSize ?? 0,
      privateBytesKb: metric.memory?.privateBytes ?? 0,
      sharedBytesKb: metric.memory?.sharedBytes ?? 0,
    }));
    const totals = processes.reduce(
      (result, process) => ({
        workingSetSizeKb: result.workingSetSizeKb + process.workingSetSizeKb,
        peakWorkingSetSizeKb:
          result.peakWorkingSetSizeKb + process.peakWorkingSetSizeKb,
        privateBytesKb: result.privateBytesKb + process.privateBytesKb,
        sharedBytesKb: result.sharedBytesKb + process.sharedBytesKb,
      }),
      {
        workingSetSizeKb: 0,
        peakWorkingSetSizeKb: 0,
        privateBytesKb: 0,
        sharedBytesKb: 0,
      },
    );
    return {
      capturedAt: new Date().toISOString(),
      electronVersion: process.versions.electron,
      processCount: processes.length,
      totals,
      processes,
      gpuFeatureStatus: app.getGPUFeatureStatus(),
    };
  });
try {
  await access(appEntryPath);
  logStage("launching Electron");
  electronApplication = await electron.launch({
    args: [
      "--no-proxy-server",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      appEntryPath,
    ],
    cwd: desktopRoot,
    env: environment,
    timeout: 30_000,
  });
  logStage("Electron launched");

  await electronApplication.evaluate(
    async ({ session }, fixture) => {
      const pageSession = session.fromPartition(fixture.partition, { cache: true });
      await pageSession.protocol.handle("https", (request) => {
        const requestUrl = new URL(request.url);
        if (requestUrl.hostname === "blackrain-frame.test") {
          return new Response(fixture.frameHtml, {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        if (requestUrl.hostname !== "blackrain-e2e.test") {
          return new Response("Not Found", { status: 404 });
        }
        if (requestUrl.pathname === "/download") {
          return new Response("browser fixture download", {
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        return new Response(fixture.html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      });
    },
    {
      partition: browserPartition,
      html: browserFixtureHtml,
      frameHtml: browserFrameHtml,
    },
  );
  logStage("fixture protocol ready");

  const window = await electronApplication.firstWindow({ timeout: 30_000 });
  logStage("first window ready");
  await electronApplication.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      throw new Error("Electron E2E 未找到主窗口");
    }
    mainWindow.setBounds({ x: 0, y: 0, width: 1200, height: 700 });
    mainWindow.show();
  });
  await window.waitForLoadState("domcontentloaded");
  logStage("renderer ready");
  startupMs = Math.round(performance.now() - probeStartedAt);

  assert.equal(await window.title(), "BlackRain");
  assert.equal(window.url(), "blackrain://app/index.html");

  const rendererSecurity = await window.evaluate(() => ({
    hasNodeProcess: typeof globalThis.process !== "undefined",
    hasRequire: typeof globalThis.require !== "undefined",
    hasTypedApi:
      typeof globalThis.blackrain?.app.getBootstrap === "function" &&
      typeof globalThis.blackrain?.workspace.list === "function" &&
      typeof globalThis.blackrain?.workspace.add === "function" &&
      typeof globalThis.blackrain?.workspace.update === "function" &&
      typeof globalThis.blackrain?.workspace.remove === "function" &&
      typeof globalThis.blackrain?.workspace.pick === "function" &&
      typeof globalThis.blackrain?.browser.createTab === "function" &&
      typeof globalThis.blackrain?.agent.getStatus === "function" &&
      typeof globalThis.blackrain?.agent.getEvents === "function" &&
      typeof globalThis.blackrain?.agent.onEvent === "function" &&
      typeof globalThis.blackrain?.agent.startThread === "function" &&
      typeof globalThis.blackrain?.agent.resumeThread === "function" &&
      typeof globalThis.blackrain?.agent.startTurn === "function" &&
      typeof globalThis.blackrain?.agent.steerTurn === "function" &&
      typeof globalThis.blackrain?.agent.interruptTurn === "function" &&
      typeof globalThis.blackrain?.browser.listTabs === "function" &&
      typeof globalThis.blackrain?.browser.navigate === "function" &&
      typeof globalThis.blackrain?.browser.control === "function" &&
      typeof globalThis.blackrain?.browser.takeControl === "function" &&
      typeof globalThis.blackrain?.browser.respondPermission === "function" &&
      typeof globalThis.blackrain?.browser.respondSensitiveAction === "function" &&
      typeof globalThis.blackrain?.browser.resolveDownload === "function" &&
      typeof globalThis.blackrain?.browser.closeTab === "function" &&
      typeof globalThis.blackrain?.browser.setLayout === "function" &&
      typeof globalThis.blackrain?.browser.onTabsChanged === "function",
  }));
  assert.deepEqual(rendererSecurity, {
    hasNodeProcess: false,
    hasRequire: false,
    hasTypedApi: true,
  });

  await window.waitForTimeout(1_000);
  const browserUiOpened = await window.evaluate(() => {
    if (document.querySelector('[data-testid="browser-sidebar"]')) {
      return true;
    }
    const opener = document.querySelector('button[aria-label="打开浏览器"]');
    if (!(opener instanceof HTMLButtonElement)) {
      return false;
    }
    opener.click();
    return true;
  });
  if (!browserUiOpened) {
    const rendererErrors = [];
    window.on("pageerror", (error) => rendererErrors.push(error.stack ?? error.message));
    window.on("console", (message) => {
      if (message.type() === "error") {
        rendererErrors.push(message.text());
      }
    });
    await window.reload({ waitUntil: "domcontentloaded" });
    await window.waitForTimeout(1_000);
    assert.fail(`Electron renderer 错误：${rendererErrors.join(" | ").slice(0, 2000)}`);
  }
  await window.waitForFunction(
    () => document.querySelector('[data-testid="browser-sidebar"]') !== null,
  );
  assert.equal(await window.getByText("先打开一个对话").count(), 1);
  if (process.env.CI !== "true") {
    const screenshotDirectory = path.join(desktopRoot, "output", "playwright");
    await mkdir(screenshotDirectory, { recursive: true });
    await window.screenshot({
      path: path.join(screenshotDirectory, "electron-browser-sidebar.png"),
    });
  }
  const browserUiClosed = await window.evaluate(() => {
    const closer = document.querySelector('button[aria-label="收起浏览器"]');
    if (!(closer instanceof HTMLButtonElement)) {
      return false;
    }
    closer.click();
    return true;
  });
  assert.equal(browserUiClosed, true);
  await window.waitForFunction(
    () => document.querySelector('button[aria-label="打开浏览器"]') !== null,
  );

  const hostContract = await withStageTimeout(
    window.evaluate(async (fixtureUrl) => {
      const bootstrap = await globalThis.blackrain.app.getBootstrap();
      const scope = { threadId: "thread-e2e", routeKey: "browser-sidebar" };
      const browserEvents = [];
      const unsubscribe = globalThis.blackrain.browser.onTabsChanged((event) => {
        if (event.scope.threadId === scope.threadId) {
          browserEvents.push(event);
        }
      });
      const initialTab = await globalThis.blackrain.browser.createTab(scope);
      const layout = await globalThis.blackrain.browser.setLayout({
        windowGeneration: bootstrap.windowGeneration,
        layoutRevision: 1,
        ...scope,
        activeTabId: initialTab.browserTabId,
        views: [
          {
            browserTabId: initialTab.browserTabId,
            viewGeneration: initialTab.viewGeneration,
            bounds: { x: 700, y: 120, width: 900, height: 700 },
            visible: true,
            occluded: false,
          },
        ],
      });
      const tab = await globalThis.blackrain.browser.navigate({
        ...scope,
        browserTabId: initialTab.browserTabId,
        viewGeneration: initialTab.viewGeneration,
        url: fixtureUrl,
      });
      const reload = await globalThis.blackrain.browser.control({
        ...scope,
        browserTabId: tab.browserTabId,
        viewGeneration: tab.viewGeneration,
        action: "reload",
      });
      const stop = await globalThis.blackrain.browser.control({
        ...scope,
        browserTabId: tab.browserTabId,
        viewGeneration: tab.viewGeneration,
        action: "stop",
      });
      const tabs = await globalThis.blackrain.browser.listTabs(scope);

      let staleRevisionRejected = false;
      try {
        await globalThis.blackrain.browser.setLayout({
          windowGeneration: bootstrap.windowGeneration,
          layoutRevision: 1,
          ...scope,
          activeTabId: tab.browserTabId,
          views: [
            {
              browserTabId: tab.browserTabId,
              viewGeneration: tab.viewGeneration,
              bounds: { x: 700, y: 120, width: 400, height: 300 },
              visible: true,
              occluded: false,
            },
          ],
        });
      } catch {
        staleRevisionRejected = true;
      }

      unsubscribe();
      return {
        bootstrap,
        layout,
        scope,
        tab,
        reload,
        stop,
        tabs,
        browserEventCount: browserEvents.length,
        staleRevisionRejected,
      };
    }, browserFixtureUrl),
    "host contract",
  );
  assert.equal(hostContract.bootstrap.version, "0.7.68");
  assert.equal(hostContract.bootstrap.platform, "win32");
  assert.ok(hostContract.bootstrap.windowGeneration > 0);
  assert.deepEqual(hostContract.layout, {
    accepted: true,
    layoutRevision: 1,
  });
  assert.equal(hostContract.tab.url, browserFixtureUrl);
  assert.equal(hostContract.tab.title, "BlackRain Browser Fixture");
  assert.equal(hostContract.tabs.length, 1);
  assert.ok(hostContract.browserEventCount > 0);
  assert.equal(hostContract.reload.browserTabId, hostContract.tab.browserTabId);
  assert.equal(hostContract.stop.browserTabId, hostContract.tab.browserTabId);
  assert.equal(hostContract.staleRevisionRejected, true);
  logStage("host contract passed");

  const oneTabMetrics = await captureResourceMetrics();
  const workingSetSetup = await window.evaluate(async (contract) => {
    const extraTabs = [];
    for (let index = 0; index < 9; index += 1) {
      extraTabs.push(await globalThis.blackrain.browser.createTab(contract.scope));
    }
    await globalThis.blackrain.browser.setLayout({
      windowGeneration: contract.bootstrap.windowGeneration,
      layoutRevision: 2,
      ...contract.scope,
      activeTabId: contract.tab.browserTabId,
      views: [{
        browserTabId: contract.tab.browserTabId,
        viewGeneration: contract.tab.viewGeneration,
        bounds: { x: 700, y: 120, width: 900, height: 700 },
        visible: true,
        occluded: false,
      }],
    });
    let suspendedTabs = [];
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const tabs = await globalThis.blackrain.browser.listTabs(contract.scope);
      suspendedTabs = tabs.filter((tab) => tab.pageLifecycle === "suspended");
      if (suspendedTabs.length === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const resumedTab = suspendedTabs[0];
    if (!resumedTab) throw new Error("Browser working-set 未挂起后台 tab");
    const tabs = await globalThis.blackrain.browser.listTabs(contract.scope);
    return {
      extraTabs,
      resumedTab,
      liveCount: tabs.filter((tab) => tab.pageLifecycle === "live").length,
      suspendedCount: suspendedTabs.length,
    };
  }, hostContract);
  const tenTabMetrics = await captureResourceMetrics();
  const workingSetContract = await window.evaluate(async ({ contract, setup }) => {
    const resumeStartedAt = performance.now();
    await globalThis.blackrain.browser.setLayout({
      windowGeneration: contract.bootstrap.windowGeneration,
      layoutRevision: 3,
      ...contract.scope,
      activeTabId: setup.resumedTab.browserTabId,
      views: [{
        browserTabId: setup.resumedTab.browserTabId,
        viewGeneration: setup.resumedTab.viewGeneration,
        bounds: { x: 700, y: 120, width: 900, height: 700 },
        visible: true,
        occluded: false,
      }],
    });
    let resumed = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const tabs = await globalThis.blackrain.browser.listTabs(contract.scope);
      resumed = tabs.some(
        (tab) =>
          tab.browserTabId === setup.resumedTab.browserTabId &&
          tab.pageLifecycle === "live",
      );
      if (resumed) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const resumeMs = Math.round(performance.now() - resumeStartedAt);
    for (const tab of setup.extraTabs) {
      const current = (await globalThis.blackrain.browser.listTabs(contract.scope))
        .find((candidate) => candidate.browserTabId === tab.browserTabId);
      if (!current) continue;
      await globalThis.blackrain.browser.closeTab({
        ...contract.scope,
        browserTabId: current.browserTabId,
        viewGeneration: current.viewGeneration,
      });
    }
    await globalThis.blackrain.browser.setLayout({
      windowGeneration: contract.bootstrap.windowGeneration,
      layoutRevision: 4,
      ...contract.scope,
      activeTabId: contract.tab.browserTabId,
      views: [{
        browserTabId: contract.tab.browserTabId,
        viewGeneration: contract.tab.viewGeneration,
        bounds: { x: 700, y: 120, width: 900, height: 700 },
        visible: true,
        occluded: false,
      }],
    });
    return {
      liveCount: setup.liveCount,
      suspendedCount: setup.suspendedCount,
      resumed,
      resumeMs,
    };
  }, { contract: hostContract, setup: workingSetSetup });
  const afterCleanupMetrics = await captureResourceMetrics();
  assert.equal(workingSetContract.suspendedCount, 2);
  assert.equal(workingSetContract.liveCount, 8);
  assert.equal(workingSetContract.resumed, true);
  resourceBaseline = {
    startupMs,
    liveBudget: 8,
    tenTabLiveCount: workingSetContract.liveCount,
    tenTabSuspendedCount: workingSetContract.suspendedCount,
    suspendedResumeMs: workingSetContract.resumeMs,
    oneTab: oneTabMetrics,
    tenTabs: tenTabMetrics,
    afterCleanup: afterCleanupMetrics,
  };
  logStage("Browser working-set contract passed");

  const browserToolContract = await electronApplication.evaluate(
    async ({ webContents }, contract) => {
      const harness = globalThis.__blackrainElectronE2e;
      if (!harness) throw new Error("Electron E2E Browser harness 未安装");
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL() === contract.tab.url);
      if (!page) throw new Error("Browser fixture page 不存在");
      globalThis.__blackrainDebuggerDetachAudit = [];
      page.debugger.on("detach", (_event, reason) => {
        globalThis.__blackrainDebuggerDetachAudit.push({
          reason,
          at: Date.now(),
        });
      });
      if (page.isLoading()) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            page.removeListener("did-stop-loading", handleLoaded);
            reject(new Error("Browser fixture reload 超时"));
          }, 5_000);
          const handleLoaded = () => {
            clearTimeout(timeout);
            resolve();
          };
          page.once("did-stop-loading", handleLoaded);
        });
      }
      await page.executeJavaScript(`
        document.cookie = "blackrain_cookie_secret=cookie-secret-e2e; SameSite=Lax";
        localStorage.setItem("blackrain_storage_secret", "storage-secret-e2e");
      `);

      const turnId = "turn-e2e";
      harness.startBrowserTurn(contract.scope.threadId, turnId);
      try {
        const baseArguments = {
          browserTabId: contract.tab.browserTabId,
          viewGeneration: contract.tab.viewGeneration,
        };
        const call = (tool, args) =>
          harness.callBrowserTool({
            threadId: contract.scope.threadId,
            turnId,
            tool,
            arguments: args,
          });
        const snapshotResponse = await call("snapshot", baseArguments);
        const snapshotItem = snapshotResponse.contentItems?.[0];
        if (snapshotItem?.type !== "inputText") {
          throw new Error("Browser snapshot 未返回 inputText");
        }
        const snapshot = JSON.parse(snapshotItem.text);
        const findRef = (name) => {
          const line = snapshot.text
            .split("\n")
            .find(
              (candidate) =>
                candidate.includes("[ref-") && candidate.includes(`"${name}"`),
            );
          return line?.match(/\[(ref-[1-9][0-9]*)\]/)?.[1];
        };
        const inputRef = findRef("测试输入");
        const buttonRef = findRef("应用输入");
        const frameInputRef = findRef("跨域输入");
        const frameButtonRef = findRef("跨域框架按钮");
        if (!inputRef || !buttonRef || !frameInputRef || !frameButtonRef) {
          throw new Error(`Browser snapshot 缺少 fixture ref: ${snapshot.text}`);
        }

        await call("type_text", {
          ...baseArguments,
          snapshotId: snapshot.snapshotId,
          ref: inputRef,
          text: "agent typed",
        });
        await call("click", {
          ...baseArguments,
          snapshotId: snapshot.snapshotId,
          ref: buttonRef,
        });
        await call("type_text", {
          ...baseArguments,
          snapshotId: snapshot.snapshotId,
          ref: frameInputRef,
          text: "frame typed",
        });
        await call("click", {
          ...baseArguments,
          snapshotId: snapshot.snapshotId,
          ref: frameButtonRef,
        });
        await page.executeJavaScript(`
          (() => {
            setTimeout(() => {
              const button = document.createElement("button");
              button.setAttribute("aria-label", "延迟操作");
              button.textContent = "延迟操作";
              button.addEventListener("click", () => {
                document.body.dataset.delayedClicks = String(
                  Number(document.body.dataset.delayedClicks || "0") + 1
                );
              });
              document.querySelector("main").appendChild(button);
            }, 200);
          })()
        `);
        const delayedLocateResponse = await call("locate", {
          ...baseArguments,
          role: "button",
          name: "延迟操作",
          exact: true,
          state: "actionable",
          timeoutMs: 2_000,
        });
        const delayedLocateItem = delayedLocateResponse.contentItems?.[0];
        if (delayedLocateItem?.type !== "inputText") {
          throw new Error("Browser delayed locator 未返回 inputText");
        }
        const delayedLocator = JSON.parse(delayedLocateItem.text);
        await call("click", {
          ...baseArguments,
          snapshotId: delayedLocator.snapshotId,
          ref: delayedLocator.ref,
        });
        const frameLocateResponse = await call("locate", {
          ...baseArguments,
          role: "button",
          name: "跨域已点击 frame typed",
          exact: true,
          state: "visible",
          timeoutMs: 2_000,
        });
        const frameLocateItem = frameLocateResponse.contentItems?.[0];
        if (frameLocateItem?.type !== "inputText") {
          throw new Error("Browser OOPIF locator 未返回 inputText");
        }
        const frameLocator = JSON.parse(frameLocateItem.text);
        await call("hover", {
          ...baseArguments,
          snapshotId: frameLocator.snapshotId,
          ref: frameLocator.ref,
        });
        const afterFrameClickResponse = await call("snapshot", baseArguments);
        const afterFrameClickItem = afterFrameClickResponse.contentItems?.[0];
        if (afterFrameClickItem?.type !== "inputText") {
          throw new Error("Browser OOPIF 点击后 snapshot 未返回 inputText");
        }
        const afterFrameClickSnapshot = JSON.parse(afterFrameClickItem.text);
        const screenshotResponse = await call("screenshot", baseArguments);
        const screenshotItem = screenshotResponse.contentItems?.[0];
        if (screenshotItem?.type !== "inputImage") {
          throw new Error("Browser screenshot 未返回 inputImage");
        }
        const fullPageScreenshotResponse = await call("screenshot", {
          ...baseArguments,
          fullPage: true,
        });
        const fullPageScreenshotItem = fullPageScreenshotResponse.contentItems?.[0];
        if (fullPageScreenshotItem?.type !== "inputImage") {
          throw new Error("Browser full-page screenshot 未返回 inputImage");
        }
        const readPngDimensions = (imageUrl) => {
          const png = Buffer.from(imageUrl.slice(imageUrl.indexOf(",") + 1), "base64");
          if (png.length < 24 || png.toString("ascii", 12, 16) !== "IHDR") {
            throw new Error("Browser screenshot 不是有效 PNG IHDR");
          }
          return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
        };
        const dom = await page.executeJavaScript(`({
          inputValue: document.querySelector("input").value,
          outputText: document.querySelector("output").textContent,
          delayedClickCount: document.body.dataset.delayedClicks || "0"
        })`);
        const currentPage = webContents
          .getAllWebContents()
          .find((candidate) => candidate.getURL() === contract.tab.url);
        const ownerWindow = currentPage && currentPage.getOwnerBrowserWindow();
        const pageView = ownerWindow?.contentView.children.find(
          (child) => child.webContents?.id === currentPage?.id,
        );
        return {
          turnId,
          pageIdBefore: page.id,
          pageIdAfter: currentPage?.id,
          debuggerAttached: page.debugger.isAttached(),
          snapshotText: snapshot.text,
          afterFrameClickSnapshotText: afterFrameClickSnapshot.text,
          dom,
          delayedLocator,
          frameLocator,
          screenshotPrefix: screenshotItem.imageUrl.slice(0, 30),
          screenshotLength: screenshotItem.imageUrl.length,
          viewportScreenshot: readPngDimensions(screenshotItem.imageUrl),
          fullPageScreenshot: readPngDimensions(fullPageScreenshotItem.imageUrl),
          visibleAfterFullPageCapture: pageView?.getVisible(),
        };
      } catch (error) {
        harness.completeBrowserTurn(contract.scope.threadId, turnId);
        throw error;
      }
    },
    hostContract,
  );
  assert.equal(browserToolContract.pageIdAfter, browserToolContract.pageIdBefore);
  assert.equal(browserToolContract.debuggerAttached, true);
  assert.match(browserToolContract.snapshotText, /测试输入/);
  assert.match(browserToolContract.snapshotText, /应用输入/);
  assert.match(browserToolContract.snapshotText, /跨域框架按钮/);
  assert.doesNotMatch(browserToolContract.snapshotText, /cookie-secret-e2e/);
  assert.doesNotMatch(browserToolContract.snapshotText, /storage-secret-e2e/);
  assert.match(
    browserToolContract.afterFrameClickSnapshotText,
    /跨域已点击 frame typed/,
  );
  assert.deepEqual(browserToolContract.dom, {
    inputValue: "agent typed",
    outputText: "agent typed",
    delayedClickCount: "1",
  });
  assert.equal(browserToolContract.delayedLocator.name, "延迟操作");
  assert.equal(browserToolContract.frameLocator.name, "跨域已点击 frame typed");
  assert.equal(
    browserToolContract.screenshotPrefix.startsWith("data:image/png;base64,"),
    true,
  );
  assert.ok(browserToolContract.screenshotLength > 100);
  assert.ok(
    browserToolContract.fullPageScreenshot.height >
      browserToolContract.viewportScreenshot.height + 1_000,
  );
  assert.equal(browserToolContract.visibleAfterFullPageCapture, true);
  logStage("Browser tool contract passed");

  const startSensitiveClick = () =>
    electronApplication.evaluate(async ({ webContents }, contract) => {
      const harness = globalThis.__blackrainElectronE2e;
      if (!harness) throw new Error("Electron E2E Browser harness 未安装");
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL() === contract.tab.url);
      if (!page) throw new Error("Browser fixture page 不存在");
      const baseArguments = {
        browserTabId: contract.tab.browserTabId,
        viewGeneration: contract.tab.viewGeneration,
      };
      const call = (tool, args) =>
        harness.callBrowserTool({
          threadId: contract.scope.threadId,
          turnId: contract.turnId,
          tool,
          arguments: args,
        });
      const snapshotResponse = await call("snapshot", baseArguments);
      const snapshotItem = snapshotResponse.contentItems?.[0];
      if (snapshotItem?.type !== "inputText") {
        throw new Error("Browser sensitive snapshot 未返回 inputText");
      }
      const snapshot = JSON.parse(snapshotItem.text);
      const line = snapshot.text
        .split("\n")
        .find(
          (candidate) =>
            candidate.includes("[ref-") && candidate.includes('"立即购买"'),
        );
      const ref = line?.match(/\[(ref-[1-9][0-9]*)\]/)?.[1];
      if (!ref) throw new Error("Browser snapshot 缺少敏感购买 ref");
      await call("click", {
        ...baseArguments,
        snapshotId: snapshot.snapshotId,
        ref,
      });
      return page.executeJavaScript(
        'document.querySelector(\'[aria-label="购买次数"]\').textContent',
      );
    }, { ...hostContract, turnId: browserToolContract.turnId });

  const firstSensitiveClick = startSensitiveClick();
  const firstSensitiveRequest = await pollForValue(
    async () => {
      const tabs = await window.evaluate(
        (scope) => globalThis.blackrain.browser.listTabs(scope),
        hostContract.scope,
      );
      return tabs[0]?.sensitiveActionRequest ? tabs[0] : null;
    },
    "Browser sensitive action pending",
  );
  assert.equal(firstSensitiveRequest.sensitiveActionRequest.category, "purchase");
  assert.equal(firstSensitiveRequest.sensitiveActionRequest.origin, "https://blackrain-e2e.test");
  const countBeforeGrant = await electronApplication.evaluate(
    ({ webContents }, url) => {
      const page = webContents.getAllWebContents().find((item) => item.getURL() === url);
      return page?.executeJavaScript(
        'document.querySelector(\'[aria-label="购买次数"]\').textContent',
      );
    },
    browserFixtureUrl,
  );
  assert.equal(await countBeforeGrant, "0");
  await window.evaluate(
    ({ scope, tab }) => globalThis.blackrain.browser.respondSensitiveAction({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      requestId: tab.sensitiveActionRequest.requestId,
      allow: true,
    }),
    { scope: hostContract.scope, tab: firstSensitiveRequest },
  );
  assert.equal(await firstSensitiveClick, "1");

  const secondSensitiveClick = startSensitiveClick().then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
  const secondSensitiveRequest = await pollForValue(
    async () => {
      const tabs = await window.evaluate(
        (scope) => globalThis.blackrain.browser.listTabs(scope),
        hostContract.scope,
      );
      return tabs[0]?.sensitiveActionRequest ? tabs[0] : null;
    },
    "Browser second sensitive action pending",
  );
  assert.notEqual(
    secondSensitiveRequest.sensitiveActionRequest.requestId,
    firstSensitiveRequest.sensitiveActionRequest.requestId,
  );
  await window.evaluate(
    ({ scope, tab }) => globalThis.blackrain.browser.respondSensitiveAction({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      requestId: tab.sensitiveActionRequest.requestId,
      allow: false,
    }),
    { scope: hostContract.scope, tab: secondSensitiveRequest },
  );
  const deniedOutcome = await secondSensitiveClick;
  assert.equal(deniedOutcome.ok, false);
  assert.match(String(deniedOutcome.error), /用户拒绝 Browser 敏感动作/);
  const countAfterDeny = await electronApplication.evaluate(
    ({ webContents }, url) => {
      const page = webContents.getAllWebContents().find((item) => item.getURL() === url);
      return page?.executeJavaScript(
        'document.querySelector(\'[aria-label="购买次数"]\').textContent',
      );
    },
    browserFixtureUrl,
  );
  assert.equal(await countAfterDeny, "1");

  const sensitiveKeyActivation = electronApplication.evaluate(
    async ({ webContents }, contract) => {
      const harness = globalThis.__blackrainElectronE2e;
      if (!harness) throw new Error("Electron E2E Browser harness 未安装");
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL() === contract.tab.url);
      if (!page) throw new Error("Browser fixture page 不存在");
      await page.executeJavaScript(
        'document.querySelector(\'[aria-label="立即购买"]\').focus()',
      );
      await harness.callBrowserTool({
        threadId: contract.scope.threadId,
        turnId: contract.turnId,
        tool: "press_key",
        arguments: {
          browserTabId: contract.tab.browserTabId,
          viewGeneration: contract.tab.viewGeneration,
          key: "Enter",
        },
      });
      return page.executeJavaScript(
        'document.querySelector(\'[aria-label="购买次数"]\').textContent',
      );
    },
    { ...hostContract, turnId: browserToolContract.turnId },
  );
  const sensitiveKeyRequest = await pollForValue(
    async () => {
      const tabs = await window.evaluate(
        (scope) => globalThis.blackrain.browser.listTabs(scope),
        hostContract.scope,
      );
      return tabs[0]?.sensitiveActionRequest ? tabs[0] : null;
    },
    "Browser keyboard activation pending",
  );
  assert.equal(
    sensitiveKeyRequest.sensitiveActionRequest.category,
    "keyboard-activation",
  );
  await window.evaluate(
    ({ scope, tab }) => globalThis.blackrain.browser.respondSensitiveAction({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      requestId: tab.sensitiveActionRequest.requestId,
      allow: true,
    }),
    { scope: hostContract.scope, tab: sensitiveKeyRequest },
  );
  assert.equal(await sensitiveKeyActivation, "2");
  logStage("Browser sensitive action grant passed");

  const takeoverContract = await window.evaluate(async (contract) => {
    const tabsBefore = await globalThis.blackrain.browser.listTabs(contract.scope);
    const active = tabsBefore.find(
      (tab) => tab.browserTabId === contract.tab.browserTabId,
    );
    if (!active) throw new Error("接管前 Browser tab 不存在");
    const taken = await globalThis.blackrain.browser.takeControl({
      ...contract.scope,
      browserTabId: active.browserTabId,
      viewGeneration: active.viewGeneration,
    });
    return { before: active, after: taken };
  }, hostContract);
  assert.equal(takeoverContract.before.controlOwner, "agent");
  assert.equal(takeoverContract.before.agentTurnId, browserToolContract.turnId);
  assert.equal(takeoverContract.after.controlOwner, "user");
  assert.equal(takeoverContract.after.agentTurnId, null);

  const preemptionContract = await electronApplication.evaluate(
    async (_electron, contract) => {
      const harness = globalThis.__blackrainElectronE2e;
      if (!harness) throw new Error("Electron E2E Browser harness 未安装");
      const baseArguments = {
        browserTabId: contract.tab.browserTabId,
        viewGeneration: contract.tab.viewGeneration,
      };
      let sameTurnRejected = false;
      try {
        await harness.callBrowserTool({
          threadId: contract.scope.threadId,
          turnId: contract.turnId,
          tool: "screenshot",
          arguments: baseArguments,
        });
      } catch {
        sameTurnRejected = true;
      } finally {
        harness.completeBrowserTurn(contract.scope.threadId, contract.turnId);
      }

      const nextTurnId = "turn-e2e-next";
      harness.startBrowserTurn(contract.scope.threadId, nextTurnId);
      try {
        const response = await harness.callBrowserTool({
          threadId: contract.scope.threadId,
          turnId: nextTurnId,
          tool: "screenshot",
          arguments: baseArguments,
        });
        return {
          sameTurnRejected,
          nextTurnId,
          nextTurnSucceeded: response.contentItems?.[0]?.type === "inputImage",
        };
      } finally {
        harness.completeBrowserTurn(contract.scope.threadId, nextTurnId);
      }
    },
    { ...hostContract, turnId: browserToolContract.turnId },
  );
  assert.equal(preemptionContract.sameTurnRejected, true);
  assert.equal(preemptionContract.nextTurnSucceeded, true);
  const tabsAfterTurn = await window.evaluate((scope) =>
    globalThis.blackrain.browser.listTabs(scope), hostContract.scope);
  assert.equal(tabsAfterTurn[0]?.controlOwner, "user");
  assert.equal(tabsAfterTurn[0]?.agentTurnId, null);

  const finalizeContract = await electronApplication.evaluate(
    async (_electron, contract) => {
      const harness = globalThis.__blackrainElectronE2e;
      if (!harness) throw new Error("Electron E2E Browser harness 未安装");
      const turnId = "turn-e2e-finalize";
      harness.startBrowserTurn(contract.scope.threadId, turnId);
      const call = (tool, args) => harness.callBrowserTool({
        threadId: contract.scope.threadId,
        turnId,
        tool,
        arguments: args,
      });
      try {
        const createdResponse = await call("new_tab", {
          url: new URL("/finalize-fixture", contract.tab.url).href,
        });
        const createdItem = createdResponse.contentItems?.[0];
        if (createdItem?.type !== "inputText") {
          throw new Error("Browser new_tab 未返回 inputText");
        }
        const created = JSON.parse(createdItem.text);
        const finalizedResponse = await call("finalize", { keep: [] });
        const finalizedItem = finalizedResponse.contentItems?.[0];
        if (finalizedItem?.type !== "inputText") {
          throw new Error("Browser finalize 未返回 inputText");
        }
        return { created, remaining: JSON.parse(finalizedItem.text) };
      } finally {
        harness.completeBrowserTurn(contract.scope.threadId, turnId);
      }
    },
    hostContract,
  );
  assert.equal(finalizeContract.created.origin, "agent");
  assert.equal(
    finalizeContract.remaining.some(
      (tab) => tab.browserTabId === finalizeContract.created.browserTabId,
    ),
    false,
  );
  assert.equal(
    finalizeContract.remaining.some(
      (tab) => tab.browserTabId === hostContract.tab.browserTabId,
    ),
    true,
  );
  logStage("Browser takeover contract passed");

  await electronApplication.evaluate(async () => {
    const harness = globalThis.__blackrainElectronE2e;
    if (!harness) throw new Error("Electron E2E Browser harness 未安装");
    await harness.simulateSystemPowerCycle();
  });
  const powerCycleTab = await pollForValue(
    () => window.evaluate(async (scope) => {
      const tabs = await globalThis.blackrain.browser.listTabs(scope);
      const tab = tabs[0];
      return tab?.pageLifecycle === "live" && tab.debuggerStatus === "attached"
        ? tab
        : null;
    }, hostContract.scope),
    "Browser system power cycle recovery",
  );
  const powerCycleContract = await electronApplication.evaluate(
    async (_electron, contract) => {
      const harness = globalThis.__blackrainElectronE2e;
      if (!harness) throw new Error("Electron E2E Browser harness 未安装");
      const turnId = "turn-e2e-power-resume";
      harness.startBrowserTurn(contract.scope.threadId, turnId);
      try {
        const response = await harness.callBrowserTool({
          threadId: contract.scope.threadId,
          turnId,
          tool: "snapshot",
          arguments: {
            browserTabId: contract.tab.browserTabId,
            viewGeneration: contract.tab.viewGeneration,
          },
        });
        const item = response.contentItems?.[0];
        return {
          pageLifecycle: contract.tab.pageLifecycle,
          debuggerStatus: contract.tab.debuggerStatus,
          snapshotRecovered:
            item?.type === "inputText" && item.text.includes("测试输入"),
        };
      } finally {
        harness.completeBrowserTurn(contract.scope.threadId, turnId);
      }
    },
    { scope: hostContract.scope, tab: powerCycleTab },
  );
  assert.deepEqual(powerCycleContract, {
    pageLifecycle: "live",
    debuggerStatus: "attached",
    snapshotRecovered: true,
  });
  logStage("Browser simulated system power cycle passed");

  await electronApplication.evaluate(({ webContents }, expectedUrl) => {
    const page = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL() === expectedUrl);
    if (!page) throw new Error("console E2E 未找到 Browser page");
    void page.executeJavaScript(`
      console.error("browser console e2e");
      console.log("password=browser-secret");
      console.log("cookie=cookie-secret-e2e");
      console.log("access_token=transport-secret-e2e");
    `);
  }, browserFixtureUrl);
  const consoleTab = await pollForValue(
    () => window.evaluate(async (scope) => {
      const tabs = await globalThis.blackrain.browser.listTabs(scope);
      const tab = tabs[0];
      return tab?.consoleMessages?.some(
        (entry) => entry.message === "browser console e2e",
      ) && tab.consoleMessages.some(
        (entry) => entry.message === "[已隐藏可能包含敏感信息的控制台消息]",
      ) ? tab : null;
    }, hostContract.scope),
    "Browser console messages",
  );
  assert.ok(
    consoleTab.consoleMessages.some(
      (entry) => entry.message === "browser console e2e",
    ),
  );
  assert.ok(
    consoleTab.consoleMessages.some(
      (entry) => entry.message === "[已隐藏可能包含敏感信息的控制台消息]",
    ),
  );
  assert.equal(
    consoleTab.consoleMessages.some((entry) =>
      /cookie-secret-e2e|storage-secret-e2e|transport-secret-e2e/.test(entry.message),
    ),
    false,
  );

  await window.evaluate((scope) => {
    globalThis.__blackrainDebuggerRecoveringSeen = false;
    globalThis.__blackrainStopDebuggerRecoveryAudit =
      globalThis.blackrain.browser.onTabsChanged((event) => {
        if (event.scope.threadId !== scope.threadId) return;
        if (event.tabs[0]?.debuggerStatus === "recovering") {
          globalThis.__blackrainDebuggerRecoveringSeen = true;
        }
      });
  }, hostContract.scope);
  await electronApplication.evaluate(({ webContents }, expectedUrl) => {
    const page = webContents
      .getAllWebContents()
      .find((candidate) => candidate.getURL() === expectedUrl);
    if (!page?.debugger.isAttached()) {
      throw new Error(
        `debugger recovery E2E 前 debugger 未附着: ${JSON.stringify({
          audit: globalThis.__blackrainDebuggerDetachAudit ?? [],
          pages: webContents.getAllWebContents().map((candidate) => ({
            id: candidate.id,
            url: candidate.getURL(),
            destroyed: candidate.isDestroyed(),
            attached: candidate.debugger.isAttached(),
          })),
        })}`,
      );
    }
    page.debugger.detach();
  }, browserFixtureUrl);
  await pollForValue(
    () => window.evaluate(async (scope) => {
      const tabs = await globalThis.blackrain.browser.listTabs(scope);
      return globalThis.__blackrainDebuggerRecoveringSeen === true &&
        tabs[0]?.debuggerStatus === "attached";
    }, hostContract.scope),
    "Browser debugger recovery",
  );
  await window.evaluate(() => {
    globalThis.__blackrainStopDebuggerRecoveryAudit?.();
    delete globalThis.__blackrainStopDebuggerRecoveryAudit;
  });
  logStage("Browser console/debugger recovery contract passed");

  const browserPageAudit = await electronApplication.evaluate(
    async ({ BrowserWindow, webContents }, expectedUrl) => {
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL() === expectedUrl);
      if (!page) {
        return { found: false };
      }
      const preferences = page.getLastWebPreferences();
      const ownerWindow = BrowserWindow.getAllWindows()[0];
      const pageView = ownerWindow.contentView.children.find(
        (child) => child.webContents?.id === page.id,
      );
      const popupWasDenied = await page.executeJavaScript(
        'window.open("/popup", "_blank") === null',
      );
      const externalProtocolWasDenied = await page.executeJavaScript(
        'window.open("mailto:blackrain@example.test", "_blank") === null',
      );
      const geolocationPermission = await page.executeJavaScript(
        'navigator.permissions.query({ name: "geolocation" }).then((result) => result.state)',
      );
      const downloadObserved = new Promise((resolve) => {
        const handleDownload = (event, item) => {
          clearTimeout(timeout);
          resolve({ prevented: event.defaultPrevented, filename: item.getFilename() });
        };
        const timeout = setTimeout(() => {
          page.session.removeListener("will-download", handleDownload);
          resolve(null);
        }, 2_000);
        page.session.once("will-download", handleDownload);
      });
      await page.executeJavaScript(`
        (() => {
          const link = document.createElement("a");
          link.href = "/download";
          link.download = "browser-fixture.txt";
          document.body.appendChild(link);
          link.click();
          link.remove();
        })()
      `);
      return {
        found: true,
        popupWasDenied,
        externalProtocolWasDenied,
        geolocationPermission,
        download: await downloadObserved,
        storagePath: page.session.storagePath,
        bounds: pageView?.getBounds(),
        visible: pageView?.getVisible(),
        preferences: {
          sandbox: preferences.sandbox,
          contextIsolation: preferences.contextIsolation,
          nodeIntegration: preferences.nodeIntegration,
          webviewTag: preferences.webviewTag,
          preload: preferences.preload,
        },
      };
    },
    browserFixtureUrl,
  );
  assert.equal(browserPageAudit.found, true);
  assert.equal(browserPageAudit.popupWasDenied, true);
  assert.equal(browserPageAudit.externalProtocolWasDenied, true);
  let popupTab;
  for (let attempt = 0; attempt < 40 && !popupTab; attempt += 1) {
    const tabs = await window.evaluate(
      (scope) => globalThis.blackrain.browser.listTabs(scope),
      hostContract.scope,
    );
    popupTab = tabs.find(
      (tab) => tab.url === "https://blackrain-e2e.test/popup",
    );
    if (!popupTab) await window.waitForTimeout(50);
  }
  assert.ok(popupTab, "popup 应转换为同 route 的受控 tab");
  assert.equal(popupTab.url, "https://blackrain-e2e.test/popup");
  await window.evaluate(
    ({ scope, tab }) => globalThis.blackrain.browser.closeTab({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
    }),
    { scope: hostContract.scope, tab: popupTab },
  );
  assert.equal(browserPageAudit.geolocationPermission, "denied");
  assert.deepEqual(browserPageAudit.download, {
    prevented: true,
    filename: "browser-fixture.txt",
  });

  const workspaceContract = await window.evaluate(async (workspacePath) => {
    const added = await globalThis.blackrain.workspace.add({ path: workspacePath });
    const updated = await globalThis.blackrain.workspace.update({
      id: added.id,
      settings: { ...added.settings, sidebarCollapsed: true },
    });
    await globalThis.blackrain.workspace.connect({ id: added.id });
    return {
      added,
      updated,
      isDirectory: await globalThis.blackrain.workspace.isDirectory({
        path: workspacePath,
      }),
      listed: await globalThis.blackrain.workspace.list(),
    };
  }, desktopRoot);
  assert.equal(workspaceContract.added.path, desktopRoot);
  assert.equal(workspaceContract.updated.settings.sidebarCollapsed, true);
  assert.equal(workspaceContract.isDirectory, true);
  assert.equal(workspaceContract.listed.length, 1);
  const pendingDownloadTab = await window.evaluate(
    (scope) => globalThis.blackrain.browser.listTabs(scope).then((tabs) => tabs[0]),
    hostContract.scope,
  );
  assert.equal(pendingDownloadTab?.download?.status, "pending");
  assert.equal(pendingDownloadTab?.download?.filename, "browser-fixture.txt");
  const downloadCancelledTab = await window.evaluate(
    async ({ scope, tab }) => globalThis.blackrain.browser.resolveDownload({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      requestId: tab.download.requestId,
      action: "cancel",
    }),
    { scope: hostContract.scope, tab: pendingDownloadTab },
  );
  assert.equal(downloadCancelledTab.download, null);

  const downloadSavePath = path.join(appDataPath, "browser-fixture-saved.txt");
  await electronApplication.evaluate(
    async ({ dialog, webContents }, input) => {
      const page = webContents.getAllWebContents().find(
        (candidate) => candidate.getURL() === input.expectedUrl,
      );
      if (!page) throw new Error("下载保存 E2E 未找到 Browser page");
      globalThis.__blackrainOriginalShowSaveDialog = dialog.showSaveDialog;
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: input.savePath,
      });
      await page.executeJavaScript(`
        (() => {
          const link = document.createElement("a");
          link.href = "/download";
          link.download = "browser-fixture.txt";
          document.body.appendChild(link);
          link.click();
          link.remove();
        })()
      `);
    },
    { expectedUrl: browserFixtureUrl, savePath: downloadSavePath },
  );
  const savePendingTab = await pollForValue(
    () => window.evaluate(async (scope) => {
      const tabs = await globalThis.blackrain.browser.listTabs(scope);
      return tabs[0]?.download?.status === "pending" ? tabs[0] : null;
    }, hostContract.scope),
    "Browser download save pending",
  );
  await window.evaluate(
    ({ scope, tab }) => globalThis.blackrain.browser.resolveDownload({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      requestId: tab.download.requestId,
      action: "save",
    }),
    { scope: hostContract.scope, tab: savePendingTab },
  );
  const savedDownloadTab = await pollForValue(
    () => window.evaluate(async (scope) => {
      const tabs = await globalThis.blackrain.browser.listTabs(scope);
      return tabs[0]?.download?.status === "completed" ? tabs[0] : null;
    }, hostContract.scope),
    "Browser download save completed",
  );
  assert.equal(savedDownloadTab.download.status, "completed");
  assert.equal(await readFile(downloadSavePath, "utf8"), "browser fixture download");
  await electronApplication.evaluate(({ dialog }) => {
    if (globalThis.__blackrainOriginalShowSaveDialog) {
      dialog.showSaveDialog = globalThis.__blackrainOriginalShowSaveDialog;
      delete globalThis.__blackrainOriginalShowSaveDialog;
    }
  });

  const uploadPath = path.join(appDataPath, "browser-upload.txt");
  await writeFile(uploadPath, "browser fixture upload", "utf8");
  await electronApplication.evaluate(
    async ({ dialog, webContents }, input) => {
      const page = webContents.getAllWebContents().find(
        (candidate) => candidate.getURL() === input.expectedUrl,
      );
      if (!page) throw new Error("file chooser E2E 未找到 Browser page");
      globalThis.__blackrainOriginalShowOpenDialog = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [input.uploadPath],
      });
      const bounds = await page.executeJavaScript(`
        (() => {
          const rect = document.querySelector('[aria-label="上传文件"]').getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })()
      `);
      page.sendInputEvent({
        type: "mouseDown",
        x: bounds.x,
        y: bounds.y,
        button: "left",
        clickCount: 1,
      });
      page.sendInputEvent({
        type: "mouseUp",
        x: bounds.x,
        y: bounds.y,
        button: "left",
        clickCount: 1,
      });
    },
    { expectedUrl: browserFixtureUrl, uploadPath },
  );
  const fileChooserPendingTab = await pollForValue(
    () => window.evaluate(async (scope) => {
      const tabs = await globalThis.blackrain.browser.listTabs(scope);
      return tabs[0]?.fileChooserRequest ? tabs[0] : null;
    }, hostContract.scope),
    "Browser file chooser pending",
  );
  assert.equal(fileChooserPendingTab.fileChooserRequest.mode, "selectSingle");
  assert.equal(
    fileChooserPendingTab.fileChooserRequest.origin,
    "https://blackrain-e2e.test",
  );
  await window.evaluate(
    ({ scope, tab }) => globalThis.blackrain.browser.resolveFileChooser({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      requestId: tab.fileChooserRequest.requestId,
      action: "choose",
    }),
    { scope: hostContract.scope, tab: fileChooserPendingTab },
  );
  const uploadedFile = await electronApplication.evaluate(
    async ({ webContents }, expectedUrl) => {
      const page = webContents.getAllWebContents().find(
        (candidate) => candidate.getURL() === expectedUrl,
      );
      if (!page) return null;
      return page.executeJavaScript(`
        (async () => {
          const file = document.querySelector('[aria-label="上传文件"]').files[0];
          return file ? { name: file.name, text: await file.text() } : null;
        })()
      `);
    },
    browserFixtureUrl,
  );
  assert.deepEqual(uploadedFile, {
    name: "browser-upload.txt",
    text: "browser fixture upload",
  });
  await electronApplication.evaluate(({ dialog }) => {
    if (globalThis.__blackrainOriginalShowOpenDialog) {
      dialog.showOpenDialog = globalThis.__blackrainOriginalShowOpenDialog;
      delete globalThis.__blackrainOriginalShowOpenDialog;
    }
  });

  await electronApplication.evaluate(({ webContents }, expectedUrl) => {
    const page = webContents.getAllWebContents().find(
      (candidate) => candidate.getURL() === expectedUrl,
    );
    if (!page) throw new Error("权限 E2E 未找到 Browser page");
    void page.executeJavaScript(`
      globalThis.__blackrainPermissionResult = "pending";
      Notification.requestPermission().then((result) => {
        globalThis.__blackrainPermissionResult = result;
      });
    `);
  }, browserFixtureUrl);
  const permissionPendingTab = await pollForValue(
    () => window.evaluate(async (scope) => {
      const tabs = await globalThis.blackrain.browser.listTabs(scope);
      const tab = tabs[0];
      return tab?.permissionRequest?.permission === "notifications"
        ? tab
        : null;
    }, hostContract.scope),
    "Browser permission pending",
  );
  assert.equal(
    permissionPendingTab.permissionRequest.origin,
    "https://blackrain-e2e.test",
  );
  const permissionDeniedTab = await window.evaluate(
    async ({ scope, tab }) => globalThis.blackrain.browser.respondPermission({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      requestId: tab.permissionRequest.requestId,
      allow: false,
    }),
    { scope: hostContract.scope, tab: permissionPendingTab },
  );
  assert.equal(permissionDeniedTab.permissionRequest, null);
  const permissionResult = await electronApplication.evaluate(
    async ({ webContents }, expectedUrl) => {
      const page = webContents.getAllWebContents().find(
        (candidate) => candidate.getURL() === expectedUrl,
      );
      if (!page) return null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await page.executeJavaScript(
          "globalThis.__blackrainPermissionResult",
        );
        if (result !== "pending") return result;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return "pending";
    },
    browserFixtureUrl,
  );
  assert.equal(permissionResult, "denied");
  await electronApplication.evaluate(async ({ webContents }, expectedUrl) => {
    const page = webContents.getAllWebContents().find(
      (candidate) => candidate.getURL() === expectedUrl,
    );
    if (!page) throw new Error("崩溃恢复 E2E 未找到 Browser page");
    await page.executeJavaScript('document.querySelector("iframe")?.remove()');
    await new Promise((resolve) => setTimeout(resolve, 100));
    page.forcefullyCrashRenderer();
  }, browserFixtureUrl);
  const crashedTab = await pollForValue(
    () => window.evaluate(async (scope) => {
      const tabs = await globalThis.blackrain.browser.listTabs(scope);
      return tabs[0]?.crashed === true ? tabs[0] : null;
    }, hostContract.scope),
    "Browser renderer crash",
  );
  assert.equal(crashedTab.browserTabId, hostContract.tab.browserTabId);
  await window.evaluate(
    ({ scope, tab }) => globalThis.blackrain.browser.control({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
      action: "reload",
    }),
    { scope: hostContract.scope, tab: crashedTab },
  );
  await pollForValue(
    () => window.evaluate(async ({ scope, url }) => {
      const tabs = await globalThis.blackrain.browser.listTabs(scope);
      return tabs[0]?.crashed === false && tabs[0]?.url === url;
    }, { scope: hostContract.scope, url: browserFixtureUrl }),
    "Browser renderer recovery",
  );
  assert.equal(browserPageAudit.preferences.sandbox, true);
  assert.equal(browserPageAudit.preferences.contextIsolation, true);
  assert.equal(browserPageAudit.preferences.nodeIntegration, false);
  assert.equal(browserPageAudit.preferences.webviewTag, false);
  assert.equal(browserPageAudit.preferences.preload, undefined);
  assert.equal(browserPageAudit.visible, true);
  assert.equal(browserPageAudit.bounds.x, 700);
  assert.equal(browserPageAudit.bounds.y, 120);
  assert.ok(browserPageAudit.bounds.width > 0);
  assert.ok(browserPageAudit.bounds.width <= 500);
  assert.ok(browserPageAudit.bounds.height > 0);
  assert.ok(browserPageAudit.bounds.height <= 580);
  assert.ok(
    browserPageAudit.storagePath
      .replaceAll("\\", "/")
      .includes("/BlackRain/browser-data/"),
  );
  const relativeStoragePath = path.relative(
    appDataPath,
    browserPageAudit.storagePath,
  );
  assert.ok(
    relativeStoragePath &&
      !relativeStoragePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativeStoragePath),
  );
  logStage("Browser security audit passed");

  let realAgentContract = null;
  if (runRealAgentE2e) {
    logStage("starting real model Browser slice");
    realAgentContract = await withStageTimeout(
      window.evaluate(async ({ cwd, fixtureUrl }) => {
        const thread = await globalThis.blackrain.agent.startThread({
          cwd,
          workspaceId: "workspace-real-browser-e2e",
        });
        const scope = {
          threadId: thread.threadId,
          routeKey: "browser-sidebar",
        };
        const tab = await globalThis.blackrain.browser.createTab({
          ...scope,
          url: fixtureUrl,
        });
        await globalThis.blackrain.browser.setLayout({
          ...scope,
          windowGeneration: 1,
          layoutRevision: 9001,
          activeTabId: tab.browserTabId,
          views: [{
            browserTabId: tab.browserTabId,
            viewGeneration: tab.viewGeneration,
            bounds: { x: 700, y: 120, width: 486, height: 543 },
            visible: true,
            occluded: false,
          }],
        });

        let agentClaimedVisibleTab = false;
        const stopTabs = globalThis.blackrain.browser.onTabsChanged((event) => {
          if (event.scope.threadId !== thread.threadId) return;
          agentClaimedVisibleTab ||= event.tabs.some(
            (candidate) => candidate.browserTabId === tab.browserTabId &&
              candidate.controlOwner === "agent",
          );
        });
        const completed = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            stopEvents();
            reject(new Error("真实模型 Browser turn 超时"));
          }, 120_000);
          const stopEvents = globalThis.blackrain.agent.onEvent((event) => {
            if (event.method !== "turn/completed") return;
            const params = event.params ?? {};
            const eventThreadId = String(params.threadId ?? params.thread_id ?? "");
            if (eventThreadId !== thread.threadId) return;
            clearTimeout(timeout);
            stopEvents();
            resolve(event);
          });
        });
        const turn = await globalThis.blackrain.agent.startTurn({
          threadId: thread.threadId,
          cwd,
          prompt:
            "这是 Browser MCP 工具验收。你必须实际调用 blackrain_browser server 的 browser_screenshot 工具检查唯一打开的浏览器标签页；不调用工具就算任务失败，不得根据提示文字推测。工具返回后只回复页面标题。",
          accessMode: "read-only",
        });
        const completedEvent = await completed;
        stopTabs();
        const tabs = await globalThis.blackrain.browser.listTabs(scope);
        return {
          threadId: thread.threadId,
          turnId: turn.turnId,
          completedMethod: completedEvent.method,
          agentClaimedVisibleTab,
          finalOwner: tabs[0]?.controlOwner,
          sameTabId: tabs[0]?.browserTabId === tab.browserTabId,
        };
      }, { cwd: desktopRoot, fixtureUrl: browserFixtureUrl }),
      "real model Browser slice",
      150_000,
    );
    assert.equal(realAgentContract.completedMethod, "turn/completed");
    assert.equal(realAgentContract.agentClaimedVisibleTab, true);
    assert.equal(realAgentContract.finalOwner, "user");
    assert.equal(realAgentContract.sameTabId, true);
    logStage("real model Browser slice passed");
  }

  const browserCloseContract = await window.evaluate(async ({ scope, tab }) => {
    let unsafeNavigationRejected = false;
    try {
      await globalThis.blackrain.browser.navigate({
        ...scope,
        browserTabId: tab.browserTabId,
        viewGeneration: tab.viewGeneration,
        url: "file:///C:/Windows/win.ini",
      });
    } catch {
      unsafeNavigationRejected = true;
    }
    let close;
    let tabsAfterClose = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const routeTabs = await globalThis.blackrain.browser.listTabs(scope);
      if (routeTabs.length === 0) break;
      for (const routeTab of routeTabs) {
        const result = await globalThis.blackrain.browser.closeTab({
          ...scope,
          browserTabId: routeTab.browserTabId,
          viewGeneration: routeTab.viewGeneration,
        });
        if (routeTab.browserTabId === tab.browserTabId) close = result;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
      tabsAfterClose = await globalThis.blackrain.browser.listTabs(scope);
      if (tabsAfterClose.length === 0) break;
    }
    return { unsafeNavigationRejected, close, tabsAfterClose };
  }, hostContract);
  assert.equal(browserCloseContract.unsafeNavigationRejected, true);
  assert.deepEqual(browserCloseContract.close, {
    closed: true,
    browserTabId: hostContract.tab.browserTabId,
  });
  assert.deepEqual(browserCloseContract.tabsAfterClose, []);
  logStage("Browser close contract passed");

  const popupWasDenied = await window.evaluate(
    () => window.open("https://example.com", "_blank") === null,
  );
  assert.equal(popupWasDenied, true);

  await window.evaluate(() => {
    window.location.href = "https://example.com";
  });
  await window.waitForTimeout(500);
  assert.equal(window.url(), "blackrain://app/index.html");

  const recoverySeed = await window.evaluate(async (fixtureUrl) => {
    const scope = {
      threadId: "thread-recovery-e2e",
      routeKey: "browser-sidebar",
    };
    const tab = await globalThis.blackrain.browser.createTab({
      ...scope,
      url: fixtureUrl,
    });
    return { scope, tab };
  }, browserFixtureUrl);

  console.log(
    `Electron Playwright E2E 通过：${JSON.stringify({
      url: window.url(),
      rendererSecurity,
      hostContract,
      browserToolContract,
      powerCycleContract,
      browserPageAudit,
      realAgentContract,
      browserCloseContract,
      popupWasDenied,
      resourceBaseline,
    })}`,
  );

  const restartStartedAt = performance.now();
  await electronApplication.close();
  electronApplication = undefined;
  logStage("relaunching Electron for Browser recovery");
  electronApplication = await electron.launch({
    args: [
      "--no-proxy-server",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      appEntryPath,
    ],
    cwd: desktopRoot,
    env: environment,
    timeout: 30_000,
  });
  await electronApplication.evaluate(
    async ({ session }, fixture) => {
      const pageSession = session.fromPartition(fixture.partition, { cache: true });
      await pageSession.protocol.handle("https", (request) => {
        const requestUrl = new URL(request.url);
        if (requestUrl.hostname === "blackrain-frame.test") {
          return new Response(fixture.frameHtml, {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        if (requestUrl.hostname !== "blackrain-e2e.test") {
          return new Response("Not Found", { status: 404 });
        }
        return new Response(fixture.html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      });
    },
    {
      partition: browserPartition,
      html: browserFixtureHtml,
      frameHtml: browserFrameHtml,
    },
  );
  const recoveryWindow = await electronApplication.firstWindow({ timeout: 30_000 });
  await recoveryWindow.waitForLoadState("domcontentloaded");
  const recoveredTabs = await recoveryWindow.evaluate((scope) =>
    globalThis.blackrain.browser.listTabs(scope), recoverySeed.scope);
  assert.equal(recoveredTabs.length, 1);
  assert.equal(
    recoveredTabs[0]?.browserTabId,
    recoverySeed.tab.browserTabId,
  );
  assert.equal(
    recoveredTabs[0]?.viewGeneration,
    recoverySeed.tab.viewGeneration + 1,
  );
  assert.equal(recoveredTabs[0]?.url, browserFixtureUrl);
  assert.equal(recoveredTabs[0]?.controlOwner, "user");
  resourceBaseline.appRestartRecoveryMs = Math.round(
    performance.now() - restartStartedAt,
  );
  const recoveredWorkspaces = await recoveryWindow.evaluate(() =>
    globalThis.blackrain.workspace.list());
  assert.equal(recoveredWorkspaces.length, 1);
  assert.equal(recoveredWorkspaces[0]?.id, workspaceContract.added.id);
  assert.equal(recoveredWorkspaces[0]?.path, desktopRoot);
  await recoveryWindow.evaluate((id) =>
    globalThis.blackrain.workspace.remove({ id }), workspaceContract.added.id);
  await recoveryWindow.evaluate(async ({ scope, tab }) => {
    await globalThis.blackrain.browser.closeTab({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
    });
  }, { scope: recoverySeed.scope, tab: recoveredTabs[0] });
  const resourceReport = {
    recordedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      node: process.version,
    },
    ...resourceBaseline,
  };
  console.log(
    `[electron-e2e] Browser resource baseline: ${JSON.stringify(resourceReport)}`,
  );
  if (resourceReportPath) {
    const resolvedReportPath = path.isAbsolute(resourceReportPath)
      ? resourceReportPath
      : path.resolve(desktopRoot, resourceReportPath);
    await mkdir(path.dirname(resolvedReportPath), { recursive: true });
    await writeFile(
      resolvedReportPath,
      `${JSON.stringify(resourceReport, null, 2)}\n`,
      "utf8",
    );
  }
  logStage("Browser restart recovery passed");
} catch (error) {
  console.error("[electron-e2e] failed", error);
  process.exitCode = 1;
} finally {
  await electronApplication?.close().catch(() => undefined);
  await rm(appDataPath, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}
