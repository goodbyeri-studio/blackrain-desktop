import { getHostClient } from "./client";

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
  await getHostClient().shell.openExternal({ url });
}

export async function revealPath(path: string): Promise<void> {
  await getHostClient().shell.revealPath({ path });
}

export async function confirmDialog(
  message: string,
  options: HostDialogOptions = {},
): Promise<boolean> {
  return getHostClient().dialog.confirm({ message, ...options });
}

export async function showMessageDialog(
  message: string,
  options: Omit<HostDialogOptions, "okLabel" | "cancelLabel"> = {},
): Promise<void> {
  await getHostClient().dialog.message({ message, ...options });
}

export async function pickFiles(options: HostFilePickerOptions = {}): Promise<string[]> {
  return getHostClient().files.pick({
    kind: "file",
    multiple: options.multiple ?? false,
    defaultPath: options.defaultPath,
    title: options.title,
  });
}

export async function pickImages(options: HostFilePickerOptions = {}): Promise<string[]> {
  return getHostClient().files.pick({
    kind: "image",
    multiple: options.multiple ?? true,
    defaultPath: options.defaultPath,
    title: options.title,
  });
}

export async function pickDirectories(options: HostFilePickerOptions = {}): Promise<string[]> {
  return getHostClient().files.pick({
    kind: "directory",
    multiple: options.multiple ?? false,
    defaultPath: options.defaultPath,
    title: options.title,
  });
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
  return getHostClient().files.saveText({ content, defaultFileName });
}
