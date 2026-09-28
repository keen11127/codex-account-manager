import { Home20Regular } from "@fluentui/react-icons";

export function SideNavigation() {
  return (
    <nav className="side-navigation" aria-label="应用导航">
      <div className="side-navigation__island">
        <button
          type="button"
          className="is-active"
          aria-current="page"
        >
          <Home20Regular />
          <span>账号</span>
        </button>
      </div>
    </nav>
  );
}
