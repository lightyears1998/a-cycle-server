import fs from "fs-extra";
import Router from "koa-router";

export const setupRoutes = async (router: Router) => {
  const subModuleNames = fs
    .readdirSync(__dirname, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  for (const moduleName of subModuleNames) {
    const module = await import("./" + moduleName);
    if (typeof module.setupRoute !== "undefined") {
      module.setupRoute(router);
    }
  }
};
