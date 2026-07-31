import { connectBrowserClient } from "../../../../resources/browser-client/browser-client.mjs";

const config = JSON.parse(process.env.BLACKRAIN_BROWSER_CLIENT_BOOTSTRAP ?? "null");
const client = await connectBrowserClient(config);
try {
  const tabs = await client.call({
    sessionId: config.codexSessionId,
    turnId: process.env.BLACKRAIN_BROWSER_CLIENT_TURN_ID,
    tool: "list_tabs",
    arguments: {},
  });
  process.stdout.write(JSON.stringify({ clientId: client.clientId, tabs }));
} finally {
  client.close();
}
