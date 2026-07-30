import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright-core";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const appEntryPath = path.resolve(desktopRoot);
const browserFixtureUrl = "http://blackrain-e2e.test/fixture";
const browserPartition = "persist:blackrain-browser-app";
const browserFixtureHtml = `<!doctype html>
  <html>
    <head><title>BlackRain Browser Fixture</title></head>
    <body>
      <main>
        <label>测试输入 <input aria-label="测试输入" value="before"></label>
        <button aria-label="应用输入">应用</button>
        <output aria-label="结果">before</output>
      </main>
      <script>
        const input = document.querySelector("input");
        const output = document.querySelector("output");
        document.querySelector("button").addEventListener("click", () => {
          output.textContent = input.value;
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

let electronApplication;
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
      await pageSession.protocol.handle("http", (request) => {
        const requestUrl = new URL(request.url);
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
    { partition: browserPartition, html: browserFixtureHtml },
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

  assert.equal(await window.title(), "BlackRain");
  assert.equal(window.url(), "blackrain://app/index.html");

  const rendererSecurity = await window.evaluate(() => ({
    hasNodeProcess: typeof globalThis.process !== "undefined",
    hasRequire: typeof globalThis.require !== "undefined",
    hasTypedApi:
      typeof globalThis.blackrain?.app.getBootstrap === "function" &&
      typeof globalThis.blackrain?.browser.createTab === "function" &&
      typeof globalThis.blackrain?.agent.getStatus === "function" &&
      typeof globalThis.blackrain?.agent.startThread === "function" &&
      typeof globalThis.blackrain?.agent.resumeThread === "function" &&
      typeof globalThis.blackrain?.agent.startTurn === "function" &&
      typeof globalThis.blackrain?.agent.interruptTurn === "function" &&
      typeof globalThis.blackrain?.browser.listTabs === "function" &&
      typeof globalThis.blackrain?.browser.navigate === "function" &&
      typeof globalThis.blackrain?.browser.control === "function" &&
      typeof globalThis.blackrain?.browser.closeTab === "function" &&
      typeof globalThis.blackrain?.browser.setLayout === "function" &&
      typeof globalThis.blackrain?.browser.onTabsChanged === "function",
  }));
  assert.deepEqual(rendererSecurity, {
    hasNodeProcess: false,
    hasRequire: false,
    hasTypedApi: true,
  });

  const browserEntry = window.getByRole("button", { name: "打开浏览器" });
  await window.waitForTimeout(1_000);
  if ((await browserEntry.count()) === 0) {
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
  assert.equal(
    await browserEntry.count(),
    1,
    `Electron renderer 未挂载 Browser UI：${(await window.locator("body").innerText()).slice(0, 500)}`,
  );
  await browserEntry.evaluate((element) => element.click());
  await window.getByTestId("browser-sidebar").waitFor({ state: "attached" });
  assert.equal(await window.getByText("先打开一个对话").count(), 1);
  if (process.env.CI !== "true") {
    const screenshotDirectory = path.join(desktopRoot, "output", "playwright");
    await mkdir(screenshotDirectory, { recursive: true });
    await window.screenshot({
      path: path.join(screenshotDirectory, "electron-browser-sidebar.png"),
    });
  }
  await window
    .getByRole("button", { name: "收起浏览器" })
    .evaluate((element) => element.click());
  await browserEntry.waitFor({ state: "attached" });

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
  assert.equal(hostContract.staleRevisionRejected, true);
  logStage("host contract passed");

  const browserToolContract = await electronApplication.evaluate(
    async ({ webContents }, contract) => {
      const harness = globalThis.__blackrainElectronE2e;
      if (!harness) throw new Error("Electron E2E Browser harness 未安装");
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL() === contract.tab.url);
      if (!page) throw new Error("Browser fixture page 不存在");
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
        if (!inputRef || !buttonRef) {
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
        const screenshotResponse = await call("screenshot", baseArguments);
        const screenshotItem = screenshotResponse.contentItems?.[0];
        if (screenshotItem?.type !== "inputImage") {
          throw new Error("Browser screenshot 未返回 inputImage");
        }
        const dom = await page.executeJavaScript(`({
          inputValue: document.querySelector("input").value,
          outputText: document.querySelector("output").textContent
        })`);
        const currentPage = webContents
          .getAllWebContents()
          .find((candidate) => candidate.getURL() === contract.tab.url);
        return {
          pageIdBefore: page.id,
          pageIdAfter: currentPage?.id,
          debuggerAttached: page.debugger.isAttached(),
          snapshotText: snapshot.text,
          dom,
          screenshotPrefix: screenshotItem.imageUrl.slice(0, 30),
          screenshotLength: screenshotItem.imageUrl.length,
        };
      } finally {
        harness.completeBrowserTurn(contract.scope.threadId, turnId);
      }
    },
    hostContract,
  );
  assert.equal(browserToolContract.pageIdAfter, browserToolContract.pageIdBefore);
  assert.equal(browserToolContract.debuggerAttached, true);
  assert.match(browserToolContract.snapshotText, /测试输入/);
  assert.match(browserToolContract.snapshotText, /应用输入/);
  assert.deepEqual(browserToolContract.dom, {
    inputValue: "agent typed",
    outputText: "agent typed",
  });
  assert.equal(
    browserToolContract.screenshotPrefix.startsWith("data:image/png;base64,"),
    true,
  );
  assert.ok(browserToolContract.screenshotLength > 100);
  logStage("Browser tool contract passed");

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
        'window.open("https://example.com", "_blank") === null',
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
  assert.equal(browserPageAudit.geolocationPermission, "denied");
  assert.deepEqual(browserPageAudit.download, {
    prevented: true,
    filename: "browser-fixture.txt",
  });
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
    const close = await globalThis.blackrain.browser.closeTab({
      ...scope,
      browserTabId: tab.browserTabId,
      viewGeneration: tab.viewGeneration,
    });
    const tabsAfterClose = await globalThis.blackrain.browser.listTabs(scope);
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

  console.log(
    `Electron Playwright E2E 通过：${JSON.stringify({
      url: window.url(),
      rendererSecurity,
      hostContract,
      browserToolContract,
      browserPageAudit,
      browserCloseContract,
      popupWasDenied,
    })}`,
  );
} finally {
  await electronApplication?.close().catch(() => undefined);
  await rm(appDataPath, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}
