import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

function Layout() {
  return (
    <div className="app-layout" data-testid="app-layout">
      <Sidebar />
      <main className="content" data-testid="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
