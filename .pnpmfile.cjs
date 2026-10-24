// astro check needs the TypeScript programmatic API, which TypeScript 7 does
// not ship yet. Give @astrojs/check and its language server their own
// TypeScript 6 in place of the project's TypeScript 7, which `pnpm typecheck`
// keeps. Remove this hook when @astrojs/check supports TypeScript 7.
const CHECKER = new Set(["@astrojs/check", "@astrojs/language-server"]);

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (CHECKER.has(pkg.name)) {
        delete pkg.peerDependencies?.typescript;
        pkg.dependencies = { ...pkg.dependencies, typescript: "^6.0.0" };
      }
      return pkg;
    },
  },
};
