import { getOptionalHostClient } from "./client";

export type HostDialogKind = "info" | "warning" | "error";
export type HostDialogOptions = {
  title?: string;
  kind?: HostDialogKind;
  okLabel?: string;
  cancelLabel?: string;
};

export type HostFilePickerOptions = {
  multiple?: boolean;
  defaultPath?: string;
  title?: string;
};

export async function openExternal(url: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host) {
    await host.shell.openExternal({ url });
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function revealPath(path: string): Promise<void> {
  const host = getOptionalHostClient();
  if (host) {
    await host.shell.revealPath({ path });
    return;
  }
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

export async function confirmDialog(
  message: string,
  options: HostDialogOptions = {},
): Promise<boolean> {
  const host = getOptionalHostClient();
  if (host) return host.dialog.confirm({ message, ...options });
  const { ask } = await import("@tauri-apps/plugin-dialog");
  return ask(message, options);
}

export async function showMessageDialog(
  message: string,
  options: Omit<HostDialogOptions, "okLabel" | "cancelLabel"> = {},
): Promise<void> {
  const host = getOptionalHostClient();
  if (host) {
    await host.dialog.message({ message, ...options });
    return;
  }
  const { message: showMessage } = await import("@tauri-apps/plugin-dialog");
  await showMessage(message, options);
}

export async function pickFiles(
  options: HostFilePickerOptions = {},
): Promise<string[]> {
  const host = getOptionalHostClient();
  if (host) {
    return host.files.pick({
      kind: "file",
      multiple: options.multiple ?? false,
      defaultPath: options.defaultPath,
      title: options.title,
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selection = await open({ ...options, directory: false });
  if (!selection) return [];
  return Array.isArray(selection) ? selection : [selection];
}

export async function pickImages(
  options: HostFilePickerOptions = {},
): Promise<string[]> {
  const host = getOptionalHostClient();
  if (host) {
    return host.files.pick({
      kind: "image",
      multiple: options.multiple ?? true,
      defaultPath: options.defaultPath,
      title: options.title,
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selection = await open({
    ...options,
    multiple: options.multiple ?? true,
    filters: [{
      name: "Images",
      extensions: [
        "png",
        "jpg",
        "jpeg",
        "gif",
        "webp",
        "bmp",
        "tiff",
        "tif",
        "heic",
        "heif",
      ],
    }],
  });
  if (!selection) return [];
  return Array.isArray(selection) ? selection : [selection];
}

export async function pickDirectories(
  options: HostFilePickerOptions = {},
): Promise<string[]> {
  const host = getOptionalHostClient();
  if (host) {
    return host.files.pick({
      kind: "directory",
      multiple: options.multiple ?? false,
      defaultPath: options.defaultPath,
      title: options.title,
    });
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selection = await open({ ...options, directory: true });
  if (!selection) return [];
  return Array.isArray(selection) ? selection : [selection];
}

export async function pickFile(
  options: Omit<HostFilePickerOptions, "multiple"> = {},
): Promise<string | null> {
  return (await pickFiles({ ...options, multiple: false }))[0] ?? null;
}

export async function pickDirectory(
  options: Omit<HostFilePickerOptions, "multiple"> = {},
): Promise<string | null> {
  return (await pickDirectories({ ...options, multiple: false }))[0] ?? null;
}

export async function saveTextFile(
  content: string,
  defaultFileName: string,
): Promise<string | null> {
  const host = getOptionalHostClient();
  if (host) return host.files.saveText({ content, defaultFileName });
  const { save } = await import("@tauri-apps/plugin-dialog");
  const selection = await save({
    title: "Export plan as Markdown",
    defaultPath: defaultFileName,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (!selection) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_text_file", { path: selection, content });
  return selection;
}
