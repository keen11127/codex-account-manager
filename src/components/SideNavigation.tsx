import {
  Apps20Regular,
  Archive20Regular,
  Board20Regular,
  Code20Regular,
  Desktop20Regular,
  DocumentText20Regular,
  History20Regular,
  Home20Regular,
  Info20Regular,
  Key20Regular,
  PlugConnected20Regular,
  Settings20Regular,
  ShieldCheckmark20Regular,
} from "@fluentui/react-icons";
import type { AppView } from "../types";
import { useEffect, useState } from "react";
import { bridge } from "../bridge";
import type { SystemInfo } from "../types";

interface SideNavigationProps {
  activeView: AppView;
  onChange(view: AppView): void;
  preview?: boolean;
}

const groups = [
  {
    label: "账号",
    items: [{ id: "accounts", label: "账号概览", icon: Home20Regular }],
  },
  {
    label: "工作区",
    items: [
      { id: "workspace", label: "工作区概览", icon: Board20Regular },
      { id: "prompts", label: "指令提示词", icon: DocumentText20Regular },
      { id: "providers", label: "供应商与路由", icon: PlugConnected20Regular },
      { id: "extensions", label: "技能和 MCP", icon: Apps20Regular },
      { id: "sessions", label: "会话管理", icon: History20Regular },
    ],
  },
  {
    label: "维护",
    items: [
      { id: "config", label: "TOML 配置", icon: Code20Regular },
      { id: "auth", label: "登录凭据", icon: Key20Regular },
      { id: "backups", label: "备份与恢复", icon: Archive20Regular },
      { id: "diagnostics", label: "环境诊断", icon: ShieldCheckmark20Regular },
    ],
  },
] as const;

const footerItems = [
  { id: "settings", label: "设置", icon: Settings20Regular },
  { id: "about", label: "关于与更新", icon: Info20Regular },
] as const;

export function SideNavigation({ activeView, onChange, preview = false }: SideNavigationProps) {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    let alive = true;
    void bridge.getSystemInfo().then((info) => {
      if (alive) setSystemInfo(info);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  return (
    <aside className="side-navigation">
      <div className="side-brand">
        <span className="side-brand__mark"><Desktop20Regular /></span>
        <div><strong>Codex Manager</strong><small>{preview ? "界面预览" : "本地账号工作台"}</small></div>
      </div>
      <nav aria-label="应用导航">
        {groups.map((group) => <section className="side-nav-group" key={group.label}>
          <span>{group.label}</span>
          {group.items.map((item) => <NavigationButton key={item.id} {...item} activeView={activeView} onChange={onChange} />)}
        </section>)}
      </nav>
      <div className="side-navigation__footer">
        <div className="side-cli-status" title={systemInfo?.codexVersion || "正在读取 Codex CLI"}>
          <Code20Regular />
          <div>
            <span>Codex CLI</span>
            <strong>{systemInfo?.codexFound ? systemInfo.codexVersion || "已连接" : systemInfo ? "未检测到" : "读取中"}</strong>
          </div>
        </div>
        {footerItems.map((item) => <NavigationButton key={item.id} {...item} activeView={activeView} onChange={onChange} />)}
        <div className="side-local-note"><span className="status-dot" /><div><strong>数据保存在本机</strong><small>D 盘独立账号目录</small></div></div>
      </div>
    </aside>
  );
}

function NavigationButton({
  id,
  label,
  icon: Icon,
  activeView,
  onChange,
}: {
  id: AppView;
  label: string;
  icon: typeof Home20Regular;
  activeView: AppView;
  onChange(view: AppView): void;
}) {
  const active = activeView === id;
  return <button type="button" className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} onClick={() => onChange(id)}><Icon /><span>{label}</span></button>;
}
