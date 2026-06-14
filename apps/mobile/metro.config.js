const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// The babel preset sets jsxImportSource: "nativewind", so Metro rewrites JSX in
// EVERY transformed module — including deep node_modules like @expo/log-box — to
// import from `nativewind/jsx-runtime`. Under pnpm's isolated store those nested
// packages can't resolve nativewind. Force all nativewind / css-interop imports
// to resolve from the mobile app root, where the single copy is linked.
const FORCE_FROM_APP = ["nativewind", "react-native-css-interop"];
const origin = path.join(__dirname, "index.js");
const baseResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolver = baseResolveRequest || context.resolveRequest;
  if (FORCE_FROM_APP.some((m) => moduleName === m || moduleName.startsWith(m + "/"))) {
    return resolver({ ...context, originModulePath: origin }, moduleName, platform);
  }
  return resolver(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: "./global.css",
  forceWriteFileSystem: true,
});
