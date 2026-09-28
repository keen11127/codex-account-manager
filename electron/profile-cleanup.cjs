const fsp = require("node:fs/promises");
const path = require("node:path");

const RETRYABLE_REMOVE_ERRORS = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);

function isManagedProfilePath(profilesRoot, profileRoot) {
  const resolvedProfilesRoot = path.resolve(profilesRoot);
  const resolvedProfileRoot = path.resolve(profileRoot);
  const relative = path.relative(resolvedProfilesRoot, resolvedProfileRoot);

  return (
    Boolean(relative) &&
    !path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !relative.includes(path.sep)
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function removeProfileDirectory(profilesRoot, profileRoot, options = {}) {
  if (!isManagedProfilePath(profilesRoot, profileRoot)) {
    const error = new Error("Profile path is outside the managed profiles directory");
    error.code = "EINVALIDPROFILE";
    throw error;
  }

  const remove = options.remove || fsp.rm;
  const sleep = options.sleep || wait;
  const retries = Math.max(0, Number(options.retries ?? 3));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? 200));

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await remove(path.resolve(profileRoot), {
        recursive: true,
        force: true,
      });
      return { removed: true, deferred: false };
    } catch (error) {
      if (error?.code === "ENOENT") {
        return { removed: true, deferred: false };
      }
      if (!RETRYABLE_REMOVE_ERRORS.has(error?.code)) throw error;
      if (attempt === retries) {
        return {
          removed: false,
          deferred: true,
          reason: error.code,
        };
      }
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  return { removed: false, deferred: true, reason: "UNKNOWN" };
}

module.exports = {
  isManagedProfilePath,
  removeProfileDirectory,
};
