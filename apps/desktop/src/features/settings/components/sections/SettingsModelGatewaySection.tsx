import { useCallback, useEffect, useMemo, useState } from "react";
import Plus from "lucide-react/dist/esm/icons/plus";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import Power from "lucide-react/dist/esm/icons/power";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import PlugZap from "lucide-react/dist/esm/icons/plug-zap";
import Play from "lucide-react/dist/esm/icons/play";
import Square from "lucide-react/dist/esm/icons/square";
import KeyRound from "lucide-react/dist/esm/icons/key-round";
import type {
  AppSettings,
  ModelGatewayModelConfig,
  ModelGatewayProviderConfig,
  ModelGatewayProviderSecretStatus,
  ModelGatewayRuntimeStatus,
} from "@/types";
import { useI18n } from "@/i18n";
import {
  modelGatewayDaemonStart,
  modelGatewayDaemonStatus,
  modelGatewayDaemonStop,
  modelGatewayProviderSecretClear,
  modelGatewayProviderSecretSet,
  modelGatewayProviderSecretStatus,
  refreshModelGatewayProviderModels,
  testModelGatewayProvider,
} from "@/services/tauri";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsToggleSwitch,
} from "@/features/design-system/components/settings/SettingsPrimitives";

type SettingsModelGatewaySectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

type ProviderDraft = {
  name: string;
  id: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKey: string;
  modelsText: string;
};

const EMPTY_DRAFT: ProviderDraft = {
  name: "",
  id: "",
  baseUrl: "",
  apiKeyEnv: "",
  apiKey: "",
  modelsText: "",
};

type ProviderStatus = {
  ok: boolean;
  message: string;
};

function normalizeProviderId(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function publicModelId(provider: ModelGatewayProviderConfig, modelId: string): string {
  if (provider.id === "deepseek" || modelId.includes("/")) {
    return modelId;
  }
  return `${provider.id}/${modelId}`;
}

function modelBelongsToProvider(
  provider: ModelGatewayProviderConfig,
  modelId: string | null,
): boolean {
  if (!modelId) {
    return false;
  }
  return provider.models.some((model) => publicModelId(provider, model.id) === modelId);
}

function parseModelLines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [idPart, displayPart, descriptionPart] = line
        .split("|")
        .map((part) => part.trim());
      const id = idPart || `model-${index + 1}`;
      return {
        id,
        displayName: displayPart || id,
        description: descriptionPart || "",
        isDefault: index === 0,
      };
    });
}

function providerProbeInput(provider: ModelGatewayProviderConfig) {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKeyEnv: provider.apiKeyEnv,
  };
}

function messageFromError(error: unknown) {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

export function SettingsModelGatewaySection({
  appSettings,
  onUpdateAppSettings,
}: SettingsModelGatewaySectionProps) {
  const { tx } = useI18n();
  const [draft, setDraft] = useState<ProviderDraft>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [busyProviderId, setBusyProviderId] = useState<string | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeStatus, setRuntimeStatus] =
    useState<ModelGatewayRuntimeStatus | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [busySecretProviderId, setBusySecretProviderId] = useState<string | null>(null);
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [secretStatuses, setSecretStatuses] = useState<
    Record<string, ModelGatewayProviderSecretStatus>
  >({});
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderStatus>>(
    {},
  );
  const [draftBusy, setDraftBusy] = useState(false);
  const gateway = appSettings.modelGateway;
  const allModels = useMemo(
    () =>
      gateway.providers.flatMap((provider) =>
        provider.models.map((model) => ({
          provider,
          model,
          publicId: publicModelId(provider, model.id),
        })),
      ),
    [gateway.providers],
  );
  const enabledProviders = useMemo(
    () => gateway.providers.filter((provider) => provider.enabled),
    [gateway.providers],
  );
  const enabledProviderCount = enabledProviders.length;
  const configuredEnabledProviderCount = enabledProviders.filter(
    (provider) => secretStatuses[provider.id]?.configured,
  ).length;
  const secretStatusCheckPending = enabledProviders.some(
    (provider) => !secretStatuses[provider.id],
  );
  const totalModelCount = gateway.providers.reduce(
    (total, provider) => total + provider.models.length,
    0,
  );
  const enabledModelCount = enabledProviders.reduce(
    (total, provider) => total + provider.models.length,
    0,
  );
  const readiness = (() => {
    if (!gateway.enabled) {
      return {
        ok: false,
        message: tx("Model gateway is disabled."),
      };
    }
    if (enabledProviderCount === 0) {
      return {
        ok: false,
        message: tx("Enable at least one provider before starting the gateway."),
      };
    }
    if (secretStatusCheckPending) {
      return {
        ok: false,
        message: tx("Checking provider API key status."),
      };
    }
    if (configuredEnabledProviderCount === 0) {
      return {
        ok: false,
        message: tx("Save an API key for at least one enabled provider."),
      };
    }
    if (enabledModelCount === 0) {
      return {
        ok: false,
        message: tx("Add or refresh at least one model before starting new conversations."),
      };
    }
    return {
      ok: true,
      message: tx("Gateway is ready to start."),
    };
  })();
  const canStartGateway = gateway.enabled && !runtimeBusy && readiness.ok;
  const updateGateway = (nextGateway: AppSettings["modelGateway"]) =>
    onUpdateAppSettings({ ...appSettings, modelGateway: nextGateway });

  const refreshRuntimeStatus = useCallback(async () => {
    setRuntimeError(null);
    try {
      setRuntimeStatus(await modelGatewayDaemonStatus());
    } catch (error) {
      setRuntimeError(messageFromError(error));
    }
  }, []);

  useEffect(() => {
    void refreshRuntimeStatus();
  }, [gateway.enabled, gateway.port, refreshRuntimeStatus]);

  const refreshSecretStatuses = useCallback(async () => {
    try {
      const statuses = await Promise.all(
        gateway.providers.map(async (provider) => [
          provider.id,
          await modelGatewayProviderSecretStatus(provider.id),
        ] as const),
      );
      setSecretStatuses(Object.fromEntries(statuses));
    } catch (error) {
      setRuntimeError(messageFromError(error));
    }
  }, [gateway.providers]);

  useEffect(() => {
    void refreshSecretStatuses();
  }, [refreshSecretStatuses]);

  const handleToggleGateway = (enabled: boolean) => {
    void updateGateway({ ...gateway, enabled });
  };

  const handleToggleProvider = (providerId: string) => {
    const providers = gateway.providers.map((provider) =>
      provider.id === providerId
        ? { ...provider, enabled: !provider.enabled }
        : provider,
    );
    void updateGateway({ ...gateway, providers });
  };

  const handlePortChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    const port = Number.isFinite(parsed)
      ? Math.min(65535, Math.max(1, parsed))
      : 8899;
    void updateGateway({ ...gateway, port });
  };

  const handleDeleteProvider = (providerId: string) => {
    void modelGatewayProviderSecretClear(providerId).catch(() => undefined);
    const providers = gateway.providers.filter((provider) => provider.id !== providerId);
    const nextDefault = allModels.find((entry) => entry.provider.id !== providerId)?.publicId ?? null;
    void updateGateway({
      ...gateway,
      providers,
      defaultModel:
        gateway.defaultModel &&
        allModels.some(
          (entry) =>
            entry.publicId === gateway.defaultModel &&
            entry.provider.id !== providerId,
        )
          ? gateway.defaultModel
          : nextDefault,
    });
  };

  const handleSelectDefaultModel = (modelId: string) => {
    void onUpdateAppSettings({
      ...appSettings,
      modelGateway: { ...gateway, defaultModel: modelId },
      lastComposerModelId: modelId,
    });
  };

  const handleAddProvider = async () => {
    const name = draft.name.trim();
    const id = normalizeProviderId(draft.id || name, `provider-${gateway.providers.length + 1}`);
    const baseUrl = draft.baseUrl.trim();
    const apiKeyEnv =
      draft.apiKeyEnv.trim() ||
      `${id.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase()}_API_KEY`;
    const apiKey = draft.apiKey.trim();
    const models = parseModelLines(draft.modelsText);

    if (!name || !baseUrl || models.length === 0) {
      setDraftError(tx("Name, base URL, and at least one model are required."));
      return;
    }
    if (gateway.providers.some((provider) => provider.id === id)) {
      setDraftError(tx("Provider id already exists."));
      return;
    }

    const provider: ModelGatewayProviderConfig = {
      id,
      name,
      kind: "openai-compatible",
      baseUrl,
      apiKeyEnv,
      enabled: true,
      models,
    };
    const firstPublicModel = publicModelId(provider, models[0].id);
    setDraftBusy(true);
    try {
      await updateGateway({
        ...gateway,
        defaultModel: gateway.defaultModel ?? firstPublicModel,
        providers: [...gateway.providers, provider],
      });
      if (apiKey) {
        const status = await modelGatewayProviderSecretSet(id, apiKey);
        setSecretStatuses((current) => ({ ...current, [id]: status }));
      }
      setDraft(EMPTY_DRAFT);
      setDraftError(null);
    } catch (error) {
      setDraftError(messageFromError(error));
    } finally {
      setDraftBusy(false);
    }
  };

  const handleSaveProviderSecret = async (provider: ModelGatewayProviderConfig) => {
    const apiKey = (secretDrafts[provider.id] ?? "").trim();
    if (!apiKey) {
      setProviderStatus((current) => ({
        ...current,
        [provider.id]: {
          ok: false,
          message: tx("API key is required."),
        },
      }));
      return;
    }
    setBusySecretProviderId(provider.id);
    try {
      const status = await modelGatewayProviderSecretSet(provider.id, apiKey);
      setSecretStatuses((current) => ({ ...current, [provider.id]: status }));
      setSecretDrafts((current) => ({ ...current, [provider.id]: "" }));
      setProviderStatus((current) => ({
        ...current,
        [provider.id]: {
          ok: true,
          message: tx("API key saved."),
        },
      }));
    } catch (error) {
      setProviderStatus((current) => ({
        ...current,
        [provider.id]: {
          ok: false,
          message: messageFromError(error),
        },
      }));
    } finally {
      setBusySecretProviderId(null);
    }
  };

  const handleClearProviderSecret = async (provider: ModelGatewayProviderConfig) => {
    setBusySecretProviderId(provider.id);
    try {
      const status = await modelGatewayProviderSecretClear(provider.id);
      setSecretStatuses((current) => ({ ...current, [provider.id]: status }));
      setSecretDrafts((current) => ({ ...current, [provider.id]: "" }));
      setProviderStatus((current) => ({
        ...current,
        [provider.id]: {
          ok: true,
          message: tx("API key cleared."),
        },
      }));
    } catch (error) {
      setProviderStatus((current) => ({
        ...current,
        [provider.id]: {
          ok: false,
          message: messageFromError(error),
        },
      }));
    } finally {
      setBusySecretProviderId(null);
    }
  };

  const handleStartGateway = async () => {
    setRuntimeBusy(true);
    setRuntimeError(null);
    try {
      setRuntimeStatus(await modelGatewayDaemonStart());
    } catch (error) {
      setRuntimeError(messageFromError(error));
      void refreshRuntimeStatus();
    } finally {
      setRuntimeBusy(false);
    }
  };

  const handleStopGateway = async () => {
    setRuntimeBusy(true);
    setRuntimeError(null);
    try {
      setRuntimeStatus(await modelGatewayDaemonStop());
    } catch (error) {
      setRuntimeError(messageFromError(error));
      void refreshRuntimeStatus();
    } finally {
      setRuntimeBusy(false);
    }
  };

  const pickNextDefaultModel = (
    provider: ModelGatewayProviderConfig,
    models: ModelGatewayModelConfig[],
  ) => {
    if (gateway.defaultModel && !modelBelongsToProvider(provider, gateway.defaultModel)) {
      return gateway.defaultModel;
    }
    const defaultModel = models.find((model) => model.isDefault) ?? models[0] ?? null;
    if (!defaultModel) {
      return gateway.defaultModel;
    }
    return publicModelId(provider, defaultModel.id);
  };

  const handleTestProvider = async (provider: ModelGatewayProviderConfig) => {
    setBusyProviderId(provider.id);
    try {
      const result = await testModelGatewayProvider(providerProbeInput(provider));
      setProviderStatus((current) => ({
        ...current,
        [provider.id]: {
          ok: result.ok,
          message: result.ok
            ? tx("Connected. {count} models found.").replace(
                "{count}",
                String(result.modelCount),
              )
            : result.message,
        },
      }));
    } catch (error) {
      setProviderStatus((current) => ({
        ...current,
        [provider.id]: {
          ok: false,
          message: messageFromError(error),
        },
      }));
    } finally {
      setBusyProviderId(null);
    }
  };

  const handleRefreshProviderModels = async (
    provider: ModelGatewayProviderConfig,
  ) => {
    setBusyProviderId(provider.id);
    try {
      const models = await refreshModelGatewayProviderModels(providerProbeInput(provider));
      const nextDefaultModel = pickNextDefaultModel(provider, models);
      const providers = gateway.providers.map((item) =>
        item.id === provider.id ? { ...item, models } : item,
      );
      await onUpdateAppSettings({
        ...appSettings,
        modelGateway: {
          ...gateway,
          providers,
          defaultModel: nextDefaultModel,
        },
        lastComposerModelId:
          appSettings.lastComposerModelId === gateway.defaultModel
            ? nextDefaultModel
            : appSettings.lastComposerModelId,
      });
      setProviderStatus((current) => ({
        ...current,
        [provider.id]: {
          ok: true,
          message: tx("Model list refreshed. {count} models found.").replace(
            "{count}",
            String(models.length),
          ),
        },
      }));
    } catch (error) {
      setProviderStatus((current) => ({
        ...current,
        [provider.id]: {
          ok: false,
          message: messageFromError(error),
        },
      }));
    } finally {
      setBusyProviderId(null);
    }
  };

  return (
    <SettingsSection
      title={tx("Model Gateway")}
      subtitle={tx("Manage provider registry used by BlackRain Gateway and the model picker.")}
    >
      <SettingsToggleRow
        title={tx("Enable model gateway")}
        subtitle={tx("Codex talks to one local BlackRain Gateway provider; vendors stay behind the gateway.")}
      >
        <SettingsToggleSwitch
          pressed={gateway.enabled}
          onClick={() => handleToggleGateway(!gateway.enabled)}
          aria-label={tx("Enable model gateway")}
        />
      </SettingsToggleRow>

      <div className="settings-gateway-runtime">
        <div className="settings-gateway-runtime-main">
          <div className="settings-gateway-provider-title-row">
            <div className="settings-gateway-provider-title">
              {tx("BlackRain Gateway runtime")}
            </div>
            <span className="settings-mobile-remote-badge">
              {runtimeStatus?.state ?? tx("unknown")}
            </span>
          </div>
          <div className="settings-gateway-provider-meta">
            <span>{runtimeStatus?.baseUrl ?? `http://127.0.0.1:${gateway.port}/v1`}</span>
            <span>{tx("port")} {runtimeStatus?.port ?? gateway.port}</span>
            {runtimeStatus?.pid ? <span>PID {runtimeStatus.pid}</span> : null}
            {runtimeStatus?.logPath ? <span>{runtimeStatus.logPath}</span> : null}
          </div>
          <div className="settings-help">
            {tx("Providers")}: {runtimeStatus?.providerCount ?? gateway.providers.length} ·{" "}
            {tx("Models")}:{" "}
            {runtimeStatus?.modelCount ?? totalModelCount}
          </div>
          <div
            className={
              readiness.ok
                ? "settings-gateway-readiness"
                : "settings-gateway-readiness settings-gateway-readiness--error"
            }
          >
            {readiness.message}
          </div>
          {runtimeStatus?.lastError ? (
            <div className="settings-gateway-provider-status settings-gateway-provider-status--error">
              {runtimeStatus.lastError}
            </div>
          ) : null}
          {runtimeError ? (
            <div className="settings-gateway-provider-status settings-gateway-provider-status--error">
              {runtimeError}
            </div>
          ) : null}
        </div>
        <div className="settings-gateway-provider-actions">
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void handleStartGateway()}
            disabled={!canStartGateway}
          >
            <Play aria-hidden />
            {runtimeBusy ? tx("Starting") : tx("Start")}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void handleStopGateway()}
            disabled={runtimeBusy}
          >
            <Square aria-hidden />
            {tx("Stop")}
          </button>
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void refreshRuntimeStatus()}
            disabled={runtimeBusy}
          >
            <RefreshCw aria-hidden />
            {tx("Refresh")}
          </button>
        </div>
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="model-gateway-port">
          {tx("Gateway port")}
        </label>
        <div className="settings-field-row">
          <input
            id="model-gateway-port"
            className="settings-input"
            type="number"
            min={1}
            max={65535}
            value={gateway.port}
            onChange={(event) => handlePortChange(event.target.value)}
          />
        </div>
        <div className="settings-help">
          {tx("Changing the port requires restarting BlackRain Gateway.")}
        </div>
      </div>

      <div className="settings-field">
        <label className="settings-field-label" htmlFor="model-gateway-default-model">
          {tx("Default model")}
        </label>
        <div className="settings-field-row">
          {allModels.length > 0 ? (
            <select
              id="model-gateway-default-model"
              className="settings-select"
              value={gateway.defaultModel ?? ""}
              onChange={(event) => handleSelectDefaultModel(event.target.value)}
            >
              {allModels.map(({ provider, model, publicId }) => (
                <option key={publicId} value={publicId}>
                  {provider.name} / {model.displayName || model.id}
                </option>
              ))}
            </select>
          ) : (
            <div className="settings-gateway-empty" id="model-gateway-default-model">
              {tx("No models configured. Add models manually or refresh a provider model list.")}
            </div>
          )}
        </div>
        <div className="settings-help">
          {tx("This also updates the composer default model for new conversations.")}
        </div>
      </div>

      <div className="settings-divider" />

      <div className="settings-field">
        <div className="settings-field-label settings-field-label--section">
          {tx("Providers")}
        </div>
        <div className="settings-gateway-provider-list">
          {gateway.providers.length === 0 ? (
            <div className="settings-gateway-empty">
              {tx("No providers configured. Add an OpenAI-compatible provider below.")}
            </div>
          ) : null}
          {gateway.providers.map((provider) => {
            const canDelete = gateway.providers.length > 1;
            const isBusy = busyProviderId === provider.id;
            const isSecretBusy = busySecretProviderId === provider.id;
            const status = providerStatus[provider.id];
            const secretStatus = secretStatuses[provider.id];
            return (
              <div className="settings-gateway-provider" key={provider.id}>
                <div className="settings-gateway-provider-main">
                  <div className="settings-gateway-provider-title-row">
                    <div className="settings-gateway-provider-title">{provider.name}</div>
                    <span className="settings-mobile-remote-badge">
                      {provider.enabled ? tx("enabled") : tx("disabled")}
                    </span>
                  </div>
                  <div className="settings-gateway-provider-meta">
                    <span>{provider.id}</span>
                    <span>{provider.baseUrl}</span>
                    <span>{tx("env")} {provider.apiKeyEnv}</span>
                  </div>
                  <div
                    className={
                      secretStatus && !secretStatus.configured
                        ? "settings-gateway-provider-status settings-gateway-provider-status--error"
                        : "settings-gateway-provider-status"
                    }
                  >
                    {secretStatus
                      ? secretStatus.message
                      : tx("Checking API key status.")}
                  </div>
                  <div className="settings-gateway-secret-row">
                    <input
                      className="settings-input"
                      type="password"
                      value={secretDrafts[provider.id] ?? ""}
                      placeholder={
                        secretStatus?.configured
                          ? tx("Enter a new API key to replace the saved key")
                          : tx("Paste provider API key")
                      }
                      aria-label={`${provider.name} ${tx("API key")}`}
                      onChange={(event) =>
                        setSecretDrafts((current) => ({
                          ...current,
                          [provider.id]: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void handleSaveProviderSecret(provider)}
                      disabled={isSecretBusy}
                    >
                      <KeyRound aria-hidden />
                      {isSecretBusy ? tx("Saving") : tx("Save key")}
                    </button>
                    <button
                      type="button"
                      className="ghost settings-button-compact"
                      onClick={() => void handleClearProviderSecret(provider)}
                      disabled={isSecretBusy || !secretStatus?.configured}
                    >
                      <Trash2 aria-hidden />
                      {tx("Clear key")}
                    </button>
                  </div>
                  <div className="settings-gateway-models">
                    {provider.models.length > 0 ? (
                      provider.models.map((model) => (
                        <span className="settings-gateway-model-chip" key={model.id}>
                          {publicModelId(provider, model.id)}
                        </span>
                      ))
                    ) : (
                      <span className="settings-gateway-empty">
                        {tx("No models configured for this provider.")}
                      </span>
                    )}
                  </div>
                  {status ? (
                    <div
                      className={
                        status.ok
                          ? "settings-gateway-provider-status"
                          : "settings-gateway-provider-status settings-gateway-provider-status--error"
                      }
                    >
                      {status.message}
                    </div>
                  ) : null}
                </div>
                <div className="settings-gateway-provider-actions">
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={() => void handleTestProvider(provider)}
                    disabled={isBusy}
                  >
                    <PlugZap aria-hidden />
                    {isBusy ? tx("Testing") : tx("Test")}
                  </button>
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={() => void handleRefreshProviderModels(provider)}
                    disabled={isBusy}
                  >
                    <RefreshCw aria-hidden />
                    {isBusy ? tx("Refreshing") : tx("Refresh")}
                  </button>
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={() => handleToggleProvider(provider.id)}
                    disabled={isBusy}
                  >
                    <Power aria-hidden />
                    {provider.enabled ? tx("Disable") : tx("Enable")}
                  </button>
                  <button
                    type="button"
                    className="ghost settings-button-compact"
                    onClick={() => handleDeleteProvider(provider.id)}
                    disabled={!canDelete || isBusy}
                  >
                    <Trash2 aria-hidden />
                    {tx("Delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-field settings-gateway-add">
        <div className="settings-field-label settings-field-label--section">
          {tx("Add OpenAI-compatible provider")}
        </div>
        <div className="settings-gateway-grid">
          <label className="settings-gateway-field">
            <span>{tx("Name")}</span>
            <input
              className="settings-input"
              value={draft.name}
              placeholder="Qwen"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="settings-gateway-field">
            <span>{tx("Provider id")}</span>
            <input
              className="settings-input"
              value={draft.id}
              placeholder="qwen"
              onChange={(event) => setDraft({ ...draft, id: event.target.value })}
            />
          </label>
          <label className="settings-gateway-field">
            <span>{tx("Base URL")}</span>
            <input
              className="settings-input"
              value={draft.baseUrl}
              placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
            />
          </label>
          <label className="settings-gateway-field">
            <span>{tx("API key")}</span>
            <input
              className="settings-input"
              type="password"
              value={draft.apiKey}
              placeholder="sk-..."
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
            />
          </label>
          <label className="settings-gateway-field">
            <span>{tx("Env fallback")}</span>
            <input
              className="settings-input"
              value={draft.apiKeyEnv}
              placeholder="QWEN_API_KEY"
              onChange={(event) => setDraft({ ...draft, apiKeyEnv: event.target.value })}
            />
          </label>
        </div>
        <label className="settings-gateway-field">
          <span>{tx("Models")}</span>
          <textarea
            className="settings-agents-textarea settings-agents-textarea--compact"
            value={draft.modelsText}
            placeholder="qwen3-coder-plus|Qwen3 Coder Plus|coding model"
            onChange={(event) => setDraft({ ...draft, modelsText: event.target.value })}
          />
        </label>
        {draftError ? <div className="settings-agents-error">{draftError}</div> : null}
        <div className="settings-field-actions">
          <button
            type="button"
            className="primary settings-button-compact"
            onClick={() => void handleAddProvider()}
            disabled={draftBusy}
          >
            <Plus aria-hidden />
            {draftBusy ? tx("Saving") : tx("Add provider")}
          </button>
        </div>
      </div>
    </SettingsSection>
  );
}
