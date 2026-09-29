const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");

const REPOSITORY = "keen11127/codex-account-manager";
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const MAX_UPDATE_BYTES = 400 * 1024 * 1024;

function versionParts(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .slice(0, 4)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(first, second) {
  const a = versionParts(first);
  const b = versionParts(second);
  const length = Math.max(a.length, b.length, 3);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

function selectWindowsAsset(assets) {
  const candidates = (Array.isArray(assets) ? assets : []).filter((asset) => {
    const name = String(asset?.name || "").toLowerCase();
    return name.endsWith(".exe") && (name.includes("setup") || name.includes("portable"));
  });
  return (
    candidates.find((asset) => String(asset.name).toLowerCase().includes("setup")) ||
    candidates.find((asset) => String(asset.name).toLowerCase().includes("portable")) ||
    null
  );
}

function findChecksum(manifest, assetName) {
  const expectedName = path.basename(String(assetName || "")).toLowerCase();
  for (const line of String(manifest || "").split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f\d]{64})\s+\*?(.+)$/i);
    if (!match) continue;
    if (path.basename(match[2].trim()).toLowerCase() === expectedName) {
      return match[1].toUpperCase();
    }
  }
  return null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Codex-Account-Manager-Updater",
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkForUpdate(currentVersion) {
  const response = await fetchWithTimeout(API_URL);
  if (response.status === 404) {
    return {
      currentVersion,
      latestVersion: currentVersion,
      hasUpdate: false,
      publishedAt: null,
      notes: "当前仓库尚未发布 Release",
      downloadUrl: null,
      assetName: null,
      checksumUrl: null,
      releaseUrl: RELEASES_URL,
    };
  }
  if (!response.ok) throw new Error(`检查更新失败（HTTP ${response.status}）`);
  const release = await response.json();
  const latestVersion = String(release.tag_name || release.name || currentVersion).replace(/^v/i, "");
  const asset = selectWindowsAsset(release.assets);
  const checksumAsset = (Array.isArray(release.assets) ? release.assets : []).find(
    (entry) => /^(sha256sums|checksums)\.txt$/i.test(String(entry?.name || "")),
  );
  return {
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    publishedAt: release.published_at || null,
    notes: typeof release.body === "string" ? release.body.slice(0, 4000) : null,
    downloadUrl: asset?.browser_download_url || null,
    assetName: asset?.name || null,
    checksumUrl: checksumAsset?.browser_download_url || null,
    releaseUrl: release.html_url || RELEASES_URL,
  };
}

async function downloadUpdate(updateRoot, updateInfo) {
  if (!updateInfo?.hasUpdate || !updateInfo.downloadUrl || !updateInfo.assetName) {
    throw new Error("当前没有可在线安装的新版");
  }
  const response = await fetchWithTimeout(
    updateInfo.downloadUrl,
    { headers: { Accept: "application/octet-stream" } },
    120_000,
  );
  if (!response.ok || !response.body) {
    throw new Error(`下载更新失败（HTTP ${response.status}）`);
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPDATE_BYTES) {
    throw new Error("更新文件体积异常，已停止下载");
  }
  const versionRoot = path.join(updateRoot, `v${updateInfo.latestVersion}`);
  await fsp.mkdir(versionRoot, { recursive: true });
  const destination = path.join(versionRoot, path.basename(updateInfo.assetName));
  const temporary = `${destination}.download`;
  const handle = await fsp.open(temporary, "w");
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  let writeError = null;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_UPDATE_BYTES) throw new Error("更新文件体积异常，已停止下载");
      hash.update(chunk);
      await handle.write(chunk);
    }
  } catch (error) {
    writeError = error;
  } finally {
    await handle.close();
  }
  if (writeError) {
    await fsp.rm(temporary, { force: true });
    throw writeError;
  }
  const sha256 = hash.digest("hex").toUpperCase();
  if (updateInfo.checksumUrl) {
    const checksumResponse = await fetchWithTimeout(
      updateInfo.checksumUrl,
      { headers: { Accept: "text/plain" } },
    );
    if (!checksumResponse.ok) {
      await fsp.rm(temporary, { force: true });
      throw new Error("更新校验文件读取失败");
    }
    const expected = findChecksum(await checksumResponse.text(), updateInfo.assetName);
    if (!expected || expected !== sha256) {
      await fsp.rm(temporary, { force: true });
      throw new Error("更新文件 SHA-256 校验失败");
    }
  }
  await fsp.rename(temporary, destination);
  return {
    filePath: destination,
    fileName: path.basename(destination),
    bytes,
    sha256,
    isInstaller: destination.toLowerCase().includes("setup"),
  };
}

module.exports = {
  API_URL,
  RELEASES_URL,
  checkForUpdate,
  compareVersions,
  downloadUpdate,
  findChecksum,
  selectWindowsAsset,
};
