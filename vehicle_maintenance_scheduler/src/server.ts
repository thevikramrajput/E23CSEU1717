import { initLogger, Log } from "logging-middleware";
import { authCredentials, serverConfig } from "./config";
import app from "./app";

initLogger(authCredentials);

const PORT = serverConfig.port;

app.listen(PORT, async () => {
  await Log(
    "backend",
    "info",
    "config",
    `Vehicle maintenance scheduler started on port ${PORT}`
  );
});
