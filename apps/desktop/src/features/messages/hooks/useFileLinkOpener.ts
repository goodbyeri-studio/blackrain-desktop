import { useCallback } from "react";
import type { MouseEvent } from "react";
import { useI18n } from "@/i18n";
import { revealPath } from "../../../host/desktop";
import { showContextMenu, type ContextMenuEntry } from "../../../host/contextMenu";
import * as Sentry from "@sentry/react";
import { pushErrorToast } from "../../../services/toasts";
import type { OpenAppTarget } from "../../../types";
import {
  type ParsedFileLocation,
  formatFileLocation,
  toFileUrl,
} from "../../../utils/fileLinks";
import {
  isAbsolutePath,
  joinWorkspacePath,
  revealInFileManagerLabel,
} from "../../../utils/platformPaths";
import { resolveMountedWorkspacePath } from "../utils/mountedWorkspacePaths";

function resolveFilePath(path: string, workspacePath?: string | null) {
  const trimmed = path.trim();
  if (!workspacePath) {
    return trimmed;
  }
  const mountedWorkspacePath = resolveMountedWorkspacePath(trimmed, workspacePath);
  if (mountedWorkspacePath) {
    return mountedWorkspacePath;
  }
  if (isAbsolutePath(trimmed)) {
    return trimmed;
  }
  return joinWorkspacePath(workspacePath, trimmed);
}

function resolveFileLinkContext(
  fileLocation: ParsedFileLocation,
  workspacePath?: string | null,
) {
  return {
    fileLocation,
    rawPathLabel: formatFileLocation(
      fileLocation.path,
      fileLocation.line,
      fileLocation.column,
    ),
    resolvedPath: resolveFilePath(fileLocation.path, workspacePath),
  };
}

export function useFileLinkOpener(
  workspacePath: string | null,
  _openTargets: OpenAppTarget[],
  _selectedOpenAppId: string,
) {
  const { tx } = useI18n();
  const reportOpenError = useCallback(
    (error: unknown, context: Record<string, string | null>) => {
      const message = error instanceof Error ? error.message : String(error);
      Sentry.captureException(
        error instanceof Error ? error : new Error(message),
        {
          tags: {
            feature: "file-link-open",
          },
          extra: context,
        },
      );
      pushErrorToast({
        title: tx("Couldn’t open file"),
        message,
      });
      console.warn("Failed to open file link", { message, ...context });
    },
    [tx],
  );

  const openFileLink = useCallback(
    async (targetLocation: ParsedFileLocation) => {
      const { rawPathLabel, resolvedPath } = resolveFileLinkContext(
        targetLocation,
        workspacePath,
      );
      try {
        await revealPath(resolvedPath);
      } catch (error) {
        reportOpenError(error, {
          rawPath: rawPathLabel,
          resolvedPath,
          workspacePath,
          targetId: "file-manager",
          targetKind: "finder",
          targetAppName: null,
          targetCommand: null,
        });
      }
    },
    [reportOpenError, workspacePath],
  );

  const showFileLinkMenu = useCallback(
    async (event: MouseEvent, targetLocation: ParsedFileLocation) => {
      event.preventDefault();
      event.stopPropagation();
      const { fileLocation, resolvedPath } = resolveFileLinkContext(
        targetLocation,
        workspacePath,
      );
      const items: ContextMenuEntry[] = [
        {
          id: "open",
          label: revealInFileManagerLabel(),
          enabled: true,
          onSelect: async () => {
            await openFileLink(fileLocation);
          },
        },
        {
          id: "download",
          label: tx("Download Linked File"),
          enabled: false,
          onSelect: () => undefined,
        },
        {
          id: "copy-link",
          label: tx("Copy Link"),
          onSelect: async () => {
            const link = toFileUrl(resolvedPath, fileLocation.line, fileLocation.column);
            try {
              await navigator.clipboard.writeText(link);
            } catch {
              // Clipboard failures are non-fatal here.
            }
          },
        },
      ];
      await showContextMenu(event, items);
    },
    [openFileLink, workspacePath, tx],
  );

  return { openFileLink, showFileLinkMenu };
}
