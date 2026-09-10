import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./app/App";
import "./app/app.css";
import { registerAppServiceWorker } from "./register-service-worker";

registerAppServiceWorker(registerSW);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
