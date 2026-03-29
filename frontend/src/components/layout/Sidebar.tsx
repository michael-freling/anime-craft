import { NavLink } from "react-router-dom";

function Sidebar() {
  return (
    <nav className="sidebar" data-testid="sidebar">
      <div className="sidebar-title">Anime Craft</div>
      <ul className="sidebar-nav">
        <li>
          <NavLink to="/" end data-testid="nav-home">
            Home
          </NavLink>
        </li>
        <li>
          <NavLink to="/progress" data-testid="nav-progress">
            Progress
          </NavLink>
        </li>
        <li>
          <NavLink to="/settings" data-testid="nav-settings">
            Settings
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export default Sidebar;
