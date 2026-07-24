export const ACTIVATED_WORKBENCH_SCHEMA_VERSION = 1 as const;

export type ActivatedWorkbenchContext = {
  schemaVersion: typeof ACTIVATED_WORKBENCH_SCHEMA_VERSION;
  activationId: string;
  workbenchId: string;
  workbenchVersion: string;
  project: { projectId: string; path: string };
  task: { taskId: string; entryId: string } | null;
  skillRoots: string[];
  plugins: Array<{ id: string; version: string }>;
  mcpServers: Array<{ id: string; pluginId: string }>;
  environmentRefs: Array<{
    kind: "providerCredential" | "managedVariable" | "systemCapability";
    referenceId: string;
  }>;
  permissions: {
    grantId: string;
    files: Array<{ path: string; access: "readOnly" | "readWrite" }>;
    networkDomains: string[];
    processIds: string[];
  };
  verifiedAt: number;
};

export type WorkbenchDeactivationResult = {
  activationId: string;
  projectPath: string;
  projectPreserved: boolean;
};

export type OfficialWorkbenchActivationResult = {
  activation: ActivatedWorkbenchContext;
  installRoot: string;
  officecliRoot: string;
  healthChecks: string[];
  projectPreserved: boolean;
};

export type WorkbenchPackageInspection = {
  packageRoot: string;
  manifestPath: string;
  manifest: {
    schemaVersion: 1;
    id: string;
    name: string;
    version: string;
    publisher: string;
    description: string;
    license: string;
    target: {
      domains: string[];
      roles: string[];
      platforms: Array<{ os: "windows"; arch: "x86_64" }>;
      blackrain: string;
    };
    skills: Array<{ path: string }>;
    plugins: Array<{ id: string; version: string }>;
    dependencies: Array<{
      id: string;
      kind: "bundled" | "managed" | "system" | "user_provided";
      version: string;
      source: string;
      checksum: string | null;
      license: string;
      installScope: "app_managed" | "system" | "user_provided";
      uninstall: "remove_if_unused" | "preserve" | "user_managed";
    }>;
    permissions: {
      files: { mode: "user-selected-folders" };
      network: { domains: string[] };
      processes: { spawn: string[] };
    };
    tasks: { source: string };
    validation: { health: string; smoke: string };
    uninstall: { preserveUserProjects: boolean };
  };
  skillRoots: string[];
  taskSource: string;
  healthSource: string;
  smokeSource: string;
  installableOnWindowsX64: boolean;
};
