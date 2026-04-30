
  import { createRoot } from "react-dom/client";
  import { initTelegramAnalytics } from "./app/analytics";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  // Must run before first render (tganalytics requirement)
  initTelegramAnalytics();

  createRoot(document.getElementById("root")!).render(<App />);
  