const process = require('node:process');
const net = require('node:net');
const { loadProjectEnv } = require('@expo/env');
const { getConfig } = require('@expo/config');
const { DevServerManager } = require('@expo/cli/build/src/start/server/DevServerManager');
const { getPlatformBundlers } = require('@expo/cli/build/src/start/server/platformBundlers');
const {
  WebSupportProjectPrerequisite,
} = require('@expo/cli/build/src/start/doctor/web/WebSupportProjectPrerequisite');

async function findOpenPort(startPort) {
  const maxPort = startPort + 20;

  for (let port = startPort; port <= maxPort; port += 1) {
    const isOpen = await new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });

      server.listen(port);
    });

    if (isOpen) {
      return port;
    }
  }

  throw new Error(`Could not find an open port between ${startPort} and ${maxPort}.`);
}

async function main() {
  const projectRoot = process.cwd();
  loadProjectEnv(projectRoot);
  const { exp } = getConfig(projectRoot, {
    skipSDKVersionRequirement: true,
  });
  const platformBundlers = getPlatformBundlers(projectRoot, exp);
  const bundler = platformBundlers.web;

  if (!bundler) {
    throw new Error('No web bundler is configured for this Expo project.');
  }

  process.env.DARK_MODE = 'class';

  const port = await findOpenPort(Number(process.env.PORT) || 19006);

  const options = {
    mode: 'development',
    devClient: false,
    https: false,
    maxWorkers: 1,
    resetDevServer: false,
    minify: false,
    location: {
      hostType: 'localhost',
      scheme: null,
    },
    port,
  };

  const manager = new DevServerManager(projectRoot, options);
  await manager.ensureProjectPrerequisiteAsync(WebSupportProjectPrerequisite);
  await manager.startAsync([
    {
      type: bundler,
      options,
    },
  ]);

  const server = manager.getWebDevServer() || manager.getDefaultDevServer();
  const url = server.getDevServerUrl({ hostType: 'localhost' });

  console.log('');
  console.log(`FitFlight web dev server is running at: ${url}`);
  console.log('Logs for your project will appear below. Press Ctrl+C to exit.');

  const shutdown = async () => {
    await manager.stopAsync();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  setInterval(() => {}, 1 << 30);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
