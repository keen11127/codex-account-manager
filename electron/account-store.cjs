const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

class AccountStoreRecoveryError extends Error {
  constructor(message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "AccountStoreRecoveryError";
    this.code = "EACCOUNTSTORE";
  }
}

async function readStoreDocument(filePath) {
  const parsed = JSON.parse(await fsp.readFile(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.accounts)) {
    throw new Error("账号数据格式异常");
  }
  return parsed;
}

async function hasProfileDirectories(profilesPath) {
  const entries = await fsp.readdir(profilesPath, { withFileTypes: true });
  return entries.some((entry) => entry.isDirectory());
}

async function writeTextThroughTemp(paths, data) {
  await fsp.writeFile(paths.temp, data, "utf8");
  try {
    await fsp.copyFile(paths.temp, paths.store);
  } finally {
    await fsp.rm(paths.temp, { force: true });
  }
}

async function restorePrimaryFromBackup(paths, document, quarantinePrimary) {
  if (quarantinePrimary && fs.existsSync(paths.store)) {
    const corruptPath = path.join(paths.root, "accounts.corrupt.json");
    await fsp.copyFile(paths.store, corruptPath);
  }
  await writeTextThroughTemp(paths, JSON.stringify(document, null, 2));
}

async function loadStoreDocument(paths) {
  await fsp.mkdir(paths.profiles, { recursive: true });

  const storeExists = fs.existsSync(paths.store);
  const backupExists = fs.existsSync(paths.backup);
  const pendingExists = fs.existsSync(paths.temp);

  if (!storeExists) {
    let backupError = null;
    if (backupExists) {
      try {
        const document = await readStoreDocument(paths.backup);
        await restorePrimaryFromBackup(paths, document, false);
        return { document, recoveredFromBackup: true, created: false };
      } catch (error) {
        backupError = error;
      }
    }

    let pendingError = null;
    if (pendingExists) {
      try {
        const document = await readStoreDocument(paths.temp);
        await fsp.copyFile(paths.temp, paths.store);
        await fsp.copyFile(paths.temp, paths.backup);
        await fsp.rm(paths.temp, { force: true });
        return { document, recoveredFromBackup: false, created: false };
      } catch (error) {
        pendingError = error;
      }
    }

    if (backupError || pendingError) {
      const errors = [backupError, pendingError].filter(Boolean);
      throw new AccountStoreRecoveryError(
        "账号主数据缺失，现有恢复文件均未通过校验。账号目录已保留，请检查数据文件。",
        errors.length > 1 ? new AggregateError(errors) : errors[0],
      );
    }

    if (await hasProfileDirectories(paths.profiles)) {
      throw new AccountStoreRecoveryError(
        "检测到账号登录目录，但账号索引文件缺失。已暂停自动清理，请恢复 accounts.json 或备份文件。",
      );
    }

    const document = { version: 2, accounts: [] };
    const data = JSON.stringify(document, null, 2);
    await writeTextThroughTemp(paths, data);
    await fsp.copyFile(paths.store, paths.backup);
    return { document, recoveredFromBackup: false, created: true };
  }

  try {
    const document = await readStoreDocument(paths.store);
    return { document, recoveredFromBackup: false, created: false };
  } catch (primaryError) {
    let backupError = null;
    if (backupExists) {
      try {
        const document = await readStoreDocument(paths.backup);
        await restorePrimaryFromBackup(paths, document, true);
        return { document, recoveredFromBackup: true, created: false };
      } catch (error) {
        backupError = error;
      }
    }

    let pendingError = null;
    if (pendingExists) {
      try {
        const document = await readStoreDocument(paths.temp);
        await fsp.copyFile(paths.store, path.join(paths.root, "accounts.corrupt.json"));
        await fsp.copyFile(paths.temp, paths.store);
        await fsp.copyFile(paths.temp, paths.backup);
        await fsp.rm(paths.temp, { force: true });
        return { document, recoveredFromBackup: false, created: false };
      } catch (error) {
        pendingError = error;
      }
    }

    const recoveryErrors = [primaryError, backupError, pendingError].filter(Boolean);
    throw new AccountStoreRecoveryError(
      backupExists || pendingExists
        ? "账号主数据及现有恢复文件均未通过校验。账号目录已保留，请从历史文件恢复。"
        : "账号主数据未通过校验且没有可用备份。账号目录已保留，请检查 accounts.json。",
      recoveryErrors.length > 1
        ? new AggregateError(recoveryErrors)
        : recoveryErrors[0],
    );
  }
}

async function writeStoreDocument(paths, document) {
  if (!document || !Array.isArray(document.accounts)) {
    throw new Error("账号数据格式异常");
  }

  await fsp.mkdir(paths.profiles, { recursive: true });
  const data = JSON.stringify(document, null, 2);
  await fsp.writeFile(paths.temp, data, "utf8");

  try {
    if (fs.existsSync(paths.store)) {
      try {
        await readStoreDocument(paths.store);
        await fsp.copyFile(paths.store, paths.backup);
      } catch {
        // Keep the last validated backup when the primary file is damaged.
      }
    }

    await fsp.copyFile(paths.temp, paths.store);
    if (!fs.existsSync(paths.backup)) {
      await fsp.copyFile(paths.temp, paths.backup);
    }
  } finally {
    await fsp.rm(paths.temp, { force: true });
  }
}

module.exports = {
  AccountStoreRecoveryError,
  loadStoreDocument,
  readStoreDocument,
  writeStoreDocument,
};
