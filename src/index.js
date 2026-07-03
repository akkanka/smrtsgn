import { getMenu } from "./menu.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/menu.json") {
      return getMenu(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};
