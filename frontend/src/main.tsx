import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ReferenceWindowPage from "./pages/ReferenceWindowPage";
import { windowTargetFrom } from "./windowTarget";
import "./index.css";

function rootElement() {
  const target = windowTargetFrom(window.location.search);
  if (target.kind === "reference") {
    // No router: this window is one view and never navigates.
    return <ReferenceWindowPage referenceId={target.referenceId} />;
  }

  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{rootElement()}</React.StrictMode>
);
