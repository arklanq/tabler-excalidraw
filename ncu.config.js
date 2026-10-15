/**
 * @typedef ExceptionsMap
 * @type {object}
 * @property {string[]} major Packages for which major upgrades are blocked (minor/patch still allowed).
 * @property {string[]} minor Packages for which minor upgrades are blocked (patch still allowed).
 * @property {string[]} patch Packages for which patch upgrades are blocked (currently unused — ncu has no target for this).
 */

/**
 * @type {ExceptionsMap}
 */
const exceptions = {
  // Add project-specific compatibility constraints here when needed.
  major: [],
  minor: [],
  patch: []
};

/**
 * Maps blocked upgrade levels to the highest allowed ncu targets.
 * ncu has no target for blocking patch upgrades only.
 *
 * @type {Record<"major" | "minor", "minor" | "patch">}
 */
const targetForBlockedLevel = {
  major: "minor",
  minor: "patch"
};

/**
 * @type {import("npm-check-updates").RunOptions}
 */
const config = {
  packageManager: "bun",
  target(packageName, _semver) {
    for (const level of ["major", "minor"]) {
      if (exceptions[level].includes(packageName)) {
        return targetForBlockedLevel[level];
      }
    }

    return "latest";
  }
};

export default config;
