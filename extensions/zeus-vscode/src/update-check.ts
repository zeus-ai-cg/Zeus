import * as vscode from "vscode";
import { getConfig } from "./config";
import { zeusLog } from "./log";
import { isNewerVersion } from "./semver";

// Auto-update nudge: on activation (after a delay so we never slow startup)
// the extension asks the Zeus web app which VSIX version is current. If the
// feed knows about a newer build, the user gets a prompt with a direct jump
// to the download page. Everything is best-effort — any failure (offline,
// feed not configured, non-JSON) is swallowed; updates must never become a
// source of noise or errors.

const UPDATE_CHECK_DELAY_MS = 15_000;
const DISMISSED_VERSION_KEY = "updatePrompt.dismissedVersion";

export function scheduleUpdateCheck(context: vscode.ExtensionContext): void {
  const timer = setTimeout(() => {
    void checkForExtensionUpdate(context);
  }, UPDATE_CHECK_DELAY_MS);
  timer.unref?.();
}

async function checkForExtensionUpdate(context: vscode.ExtensionContext): Promise<void> {
  try {
    const { apiBaseUrl } = getConfig();
    const res = await fetch(`${apiBaseUrl}/api/vscode/latest`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { available?: boolean; version?: string };
    if (!body.available || !body.version) return;

    const local = vscode.extensions.getExtension("zeusai.zeus-ai")?.packageJSON?.version as
      | string
      | undefined;
    if (!local || !isNewerVersion(body.version, local)) return;

    // "Later" hides the prompt for this specific version until the next one.
    if (context.globalState.get<string>(DISMISSED_VERSION_KEY) === body.version) return;

    const choice = await vscode.window.showInformationMessage(
      `Zeus AI ${body.version} is available — this build adds improvements and fixes.`,
      "Open Download Page",
      "Later",
    );
    if (choice === "Open Download Page") {
      const { apiBaseUrl: base } = getConfig();
      await vscode.env.openExternal(vscode.Uri.parse(`${base}/download#install`));
    }
    if (choice) {
      await context.globalState.update(DISMISSED_VERSION_KEY, body.version);
    }
  } catch (error) {
    zeusLog(`[update-check] skipped: ${String(error)}`);
  }
}
