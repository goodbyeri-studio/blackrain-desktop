import { dialog, type BrowserWindow, type MessageBoxOptions } from "electron";
import {
  DialogConfirmInputSchema,
  DialogMessageInputSchema,
  type DialogConfirmInput,
} from "../../shared/desktop";

export class DesktopDialogService {
  constructor(
    private readonly provider: Pick<typeof dialog, "showMessageBox"> = dialog,
  ) {}

  async confirm(ownerWindow: BrowserWindow, input: unknown): Promise<boolean> {
    const request = DialogConfirmInputSchema.parse(input);
    const result = await this.provider.showMessageBox(
      ownerWindow,
      messageBoxOptions(request, true),
    );
    return result.response === 0;
  }

  async message(ownerWindow: BrowserWindow, input: unknown): Promise<void> {
    const request = DialogMessageInputSchema.parse(input);
    await this.provider.showMessageBox(
      ownerWindow,
      messageBoxOptions(request, false),
    );
  }
}

function messageBoxOptions(
  request: DialogConfirmInput,
  confirm: boolean,
): MessageBoxOptions {
  return {
    type: request.kind ?? "info",
    title: request.title,
    message: request.message,
    buttons: confirm
      ? [request.okLabel ?? "OK", request.cancelLabel ?? "Cancel"]
      : ["OK"],
    defaultId: 0,
    cancelId: confirm ? 1 : 0,
    noLink: true,
  };
}
