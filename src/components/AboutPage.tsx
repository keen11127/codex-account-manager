import { Badge, Button, Spinner } from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  ArrowDownload20Regular,
  CheckmarkCircle20Regular,
  Desktop20Regular,
  FolderOpen20Regular,
  Globe20Regular,
  Open20Regular,
  Send20Filled,
  ShieldLock20Filled,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { bridge } from "../bridge";
import type { SystemInfo, UpdateInfo } from "../types";

interface AboutPageProps {
  onNotify(
    title: string,
    body?: string,
    intent?: "success" | "error" | "warning" | "info",
  ): void;
}

function displayDate(value: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AboutPage({ onNotify }: AboutPageProps) {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let alive = true;
    void bridge.getSystemInfo().then((info) => {
      if (alive) setSystemInfo(info);
    });
    return () => {
      alive = false;
    };
  }, []);

  const checkUpdate = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const result = await bridge.checkForUpdate();
      setUpdate(result);
      onNotify(
        result.hasUpdate ? "发现新版本" : "当前已是最新版本",
        result.hasUpdate ? `v${result.latestVersion}` : `v${result.currentVersion}`,
        result.hasUpdate ? "info" : "success",
      );
    } catch (error) {
      onNotify(
        "检查更新失败",
        error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      await bridge.installUpdate();
      onNotify("更新程序已启动", "应用将关闭并继续安装", "success");
    } catch (error) {
      onNotify(
        "在线更新失败",
        error instanceof Error ? error.message : String(error),
        "error",
      );
      setInstalling(false);
    }
  };

  return (
    <section className="about-page" aria-labelledby="about-title">
      <header className="about-page__header">
        <div className="about-brand-mark">
          <Desktop20Regular />
        </div>
        <div>
          <span>ABOUT</span>
          <h1 id="about-title">Codex Account Manager</h1>
          <small>版本 {systemInfo?.appVersion || "读取中"}</small>
        </div>
      </header>

      <section className="about-section" aria-labelledby="runtime-heading">
        <div className="about-section__heading">
          <h2 id="runtime-heading">运行环境</h2>
          <Badge
            appearance="tint"
            color={systemInfo?.codexFound ? "success" : "warning"}
            size="small"
          >
            {systemInfo?.codexFound ? "Codex CLI 已连接" : "Codex CLI 未检测到"}
          </Badge>
        </div>
        <div className="runtime-grid">
          <div>
            <span>应用版本</span>
            <strong>v{systemInfo?.appVersion || "--"}</strong>
          </div>
          <div>
            <span>Codex CLI</span>
            <strong>{systemInfo?.codexVersion || "--"}</strong>
          </div>
          <div>
            <span>数据目录</span>
            <strong title={systemInfo?.dataDirectory}>
              {systemInfo?.dataDirectory || "--"}
            </strong>
            <Button
              appearance="subtle"
              size="small"
              icon={<FolderOpen20Regular />}
              aria-label="打开数据目录"
              onClick={() => void bridge.openDataDirectory()}
            >
              打开
            </Button>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="update-heading">
        <div className="about-section__heading">
          <h2 id="update-heading">软件更新</h2>
          {update ? (
            <Badge
              appearance="tint"
              color={update.hasUpdate ? "informative" : "success"}
              size="small"
            >
              {update.hasUpdate
                ? `新版本 v${update.latestVersion}`
                : "已是最新版本"}
            </Badge>
          ) : null}
        </div>
        <div className="update-panel">
          <div className="update-panel__status">
            <span
              className={`update-panel__icon${
                update && !update.hasUpdate ? " is-current" : ""
              }`}
            >
              {update && !update.hasUpdate ? (
                <CheckmarkCircle20Regular />
              ) : (
                <ArrowDownload20Regular />
              )}
            </span>
            <div>
              <strong>
                {update
                  ? update.hasUpdate
                    ? `v${update.currentVersion} → v${update.latestVersion}`
                    : `v${update.currentVersion}`
                  : "尚未检查更新"}
              </strong>
              <span>
                {update
                  ? update.hasUpdate
                    ? `发布于 ${displayDate(update.publishedAt)}`
                    : update.notes || "当前版本无需更新"
                  : ""}
              </span>
            </div>
          </div>
          <div className="update-panel__actions">
            <Button
              className="blue-action-button"
              appearance="primary"
              icon={
                checking ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />
              }
              aria-label="检查软件更新"
              disabled={checking || installing}
              onClick={() => void checkUpdate()}
            >
              {checking ? "检查中" : "检查更新"}
            </Button>
            {update?.hasUpdate ? (
              <>
                {update.downloadUrl ? (
                  <Button
                    className="blue-action-button"
                    appearance="primary"
                    icon={
                      installing ? (
                        <Spinner size="tiny" />
                      ) : (
                        <ArrowDownload20Regular />
                      )
                    }
                    aria-label="在线更新"
                    disabled={installing}
                    onClick={() => void installUpdate()}
                  >
                    {installing ? "下载中" : "在线更新"}
                  </Button>
                ) : null}
                <Button
                  className="blue-action-button"
                  appearance="primary"
                  icon={<Open20Regular />}
                  aria-label="打开更新下载页"
                  onClick={() => void bridge.openDownloads()}
                >
                  打开下载页
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="links-heading">
        <div className="about-section__heading">
          <h2 id="links-heading">相关入口</h2>
        </div>
        <div className="about-links">
          <button
            type="button"
            onClick={() => void bridge.openOfficialChannel()}
          >
            <Send20Filled />
            <span>
              <strong>官方频道</strong>
              <small>Telegram</small>
            </span>
            <Open20Regular />
          </button>
          <button type="button" onClick={() => void bridge.openVpnSponsor()}>
            <ShieldLock20Filled />
            <span>
              <strong>VPN 推荐</strong>
              <small>renminde.com</small>
            </span>
            <Open20Regular />
          </button>
          <button type="button" onClick={() => void bridge.openRepository()}>
            <Globe20Regular />
            <span>
              <strong>开源主页</strong>
              <small>GitHub</small>
            </span>
            <Open20Regular />
          </button>
        </div>
      </section>
    </section>
  );
}
