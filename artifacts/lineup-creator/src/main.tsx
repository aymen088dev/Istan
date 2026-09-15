import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadTheme, applyTheme } from "./lib/themes";

// Le thème est appliqué AVANT le premier rendu : aucun flash de l'ancien
// thème au chargement, même avec un thème non standard mémorisé.
applyTheme(loadTheme());

createRoot(document.getElementById("root")!).render(<App />);
