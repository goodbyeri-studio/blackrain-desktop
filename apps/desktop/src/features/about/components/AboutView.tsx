import { useEffect, useState } from "react";
import type { AppLanguagePreference } from "@/types";
import { getAppSettings } from "@services/desktop";
import { I18nProvider, useI18n } from "@/i18n";
import { getOptionalHostClient } from "@/host/client";

export function AboutView() {
  const [language, setLanguage] = useState<AppLanguagePreference>("system");

  useEffect(() => {
    let active = true;
    void getAppSettings()
      .then((settings) => {
        if (active) {
          setLanguage(settings.appLanguage);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <I18nProvider language={language}>
      <AboutViewContent />
    </I18nProvider>
  );
}

function AboutViewContent() {
  const { tx } = useI18n();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchVersion = async () => {
      try {
        const value = (await getOptionalHostClient()?.app.getBootstrap())?.version ?? __APP_VERSION__;
        if (active) {
          setVersion(value);
        }
      } catch {
        if (active) {
          setVersion(null);
        }
      }
    };

    void fetchVersion();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="about">
      <div className="about-card">
        <div className="about-header">
          <img
            className="about-icon"
            src="/app-icon.png"
            alt={tx("BlackRain icon")}
          />
          <div className="about-title">{tx("BlackRain")}</div>
        </div>
        <div className="about-version">
          {version ? tx("Version {version}", { version }) : tx("Version —")}
        </div>
        <div className="about-tagline">
          {tx("Your AI agent for getting real work done")}
        </div>
        <div className="about-divider" />
        <div className="about-footer">{tx("BlackRain · open source desktop client")}</div>
      </div>
    </div>
  );
}
