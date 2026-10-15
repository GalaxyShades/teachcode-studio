/**
 * pm2 process file for TeachCode Content Studio.
 * Binds localhost only. nginx publishes https://codewithAI.hku.hk/studio/.
 */
const path = require("path");

const root = path.resolve(__dirname, "..");
const logDir = process.env.TEACHCODE_STUDIO_LOG_DIR || "/var/log/teachcode-studio";

const clearProxyEnv = {
  HTTP_PROXY: "",
  HTTPS_PROXY: "",
  ALL_PROXY: "",
  http_proxy: "",
  https_proxy: "",
  all_proxy: "",
  SOCKS_PROXY: "",
  SOCKS5_PROXY: "",
  socks_proxy: "",
  socks5_proxy: "",
};

module.exports = {
  apps: [
    {
      name: "teachcode-studio",
      cwd: root,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3010 -H 127.0.0.1",
      env: {
        NODE_ENV: "production",
        PORT: "3010",
        STUDIO_BASE_PATH: "/studio",
        ...clearProxyEnv,
      },
      out_file: path.join(logDir, "studio-out.log"),
      error_file: path.join(logDir, "studio-error.log"),
      merge_logs: true,
      max_memory_restart: "512M",
    },
  ],
};
