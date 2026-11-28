import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { IconContext } from "react-icons";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./api/query-client";
import "@fontsource-variable/inter";
import "@fontsource-variable/sora";
import "./styles/global.css";
import App from "./App";
import { AuthProvider } from "./common/auth";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <IconContext.Provider
            value={{
              size: "20",
              attr: { "aria-hidden": true, focusable: "false" },
            }}
          >
            <App />
          </IconContext.Provider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
