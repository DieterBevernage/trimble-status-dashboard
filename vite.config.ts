import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function authCallbackRedirect(): Plugin {
  return {
    name: "auth-callback-redirect",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const [path, query] = req.url.split("?");
        if (path === "/auth/callback") {
          const location = `/#/auth/callback${query ? `?${query}` : ""}`;
          res.statusCode = 302;
          res.setHeader("Location", location);
          res.end();
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const base = command === "serve" ? "/" : "/trimble-status-dashboard/";
  return {
    base,
    plugins: [react(), authCallbackRedirect()],
  };
});
