const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// The babel preset sets jsxImportSource: "nativewind", so Metro rewrites JSX in
// EVERY transformed module — including deep node_modules like @expo/log-box — to
// import from `nativewind/jsx-runtime`. Under pnpm's isolated store those nested
// packages can't resolve nativewind. Force all nativewind / css-interop imports
// to resolve from the mobile app root, where the single copy is linked.
// Only nativewind needs redirecting (deep packages like @expo/log-box import
// `nativewind/jsx-runtime`). Its own `react-native-css-interop` dep then resolves
// normally from nativewind's nested node_modules — do NOT alias css-interop, or
// it'd wrongly resolve from the app root where it isn't a top-level dep.
const FORCE_FROM_APP = ["nativewind"];
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
