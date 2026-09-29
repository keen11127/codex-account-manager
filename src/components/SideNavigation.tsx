import {
  Apps20Regular,
  Code20Regular,
  DocumentText20Regular,
  History20Regular,
  Home20Regular,
  Info20Regular,
} from "@fluentui/react-icons";
import type { AppView } from "../types";

interface SideNavigationProps {
  activeView: AppView;
  onChange(view: AppView): void;
}

const primaryItems = [
  { id: "accounts", label: "账号", icon: Home20Regular },
  { id: "instructions", label: "指令", icon: DocumentText20Regular },
  { id: "config", label: "配置", icon: Code20Regular },
  { id: "extensions", label: "扩展", icon: Apps20Regular },
  { id: "sessions", label: "会话", icon: History20Regular },
] as const;

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
  return (
    <button
      type="button"
      className={active ? "is-active" : undefined}
      aria-current={active ? "page" : undefined}
      title={label}
      onClick={() => onChange(id)}
    >
      <Icon />
      <span>{label}</span>
    </button>
  );
}

export function SideNavigation({ activeView, onChange }: SideNavigationProps) {
  return (
    <nav className="side-navigation" aria-label="应用导航">
      <div className="side-navigation__island">
        {primaryItems.map((item) => (
          <NavigationButton
            key={item.id}
            {...item}
            activeView={activeView}
            onChange={onChange}
          />
        ))}
      </div>
      <div className="side-navigation__island side-navigation__island--footer">
        <NavigationButton
          id="about"
          label="关于"
          icon={Info20Regular}
          activeView={activeView}
          onChange={onChange}
        />
      </div>
    </nav>
  );
}
