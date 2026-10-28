import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./app/App";
import "./app/app.css";
import { registerAppServiceWorker } from "./register-service-worker";

const root = createRoot(document.getElementById("root")!);
if (import.meta.env.DEV && import.meta.env.VITE_SITE_PREVIEW === "1") {
  void import("./preview/PreviewApp").then(({ PreviewApp }) => root.render(<StrictMode><PreviewApp /></StrictMode>));
} else {
  registerAppServiceWorker(registerSW);
  root.render(<StrictMode><App /></StrictMode>);
}
