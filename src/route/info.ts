import Router from "koa-router";
import fs from "fs-extra";
import type { PackageJson } from "type-fest";

const router = new Router();

let appName = "";
let appDescription = "";
let appVersion = "";

(function () {
  const packageFile = fs.readFileSync(`${__dirname}/../../package.json`, {
    encoding: "utf8",
  });
  const packageJSON = JSON.parse(packageFile) as PackageJson;
  appName = String(packageJSON.name);
  appDescription = String(packageJSON.description);
  appVersion = String(packageJSON.version);
})();

router.all("/", (ctx) => {
  ctx.body = {
    name: appName,
    description: appDescription,
    version: appVersion,
  };
});

export default router;
