const DEFAULT_ACCOUNT_LABEL = "新账号";

function cleanLabel(value) {
  return String(value || "").trim().slice(0, 80);
}

function emailLocalPart(email) {
  const normalized = String(email || "").trim();
  const separator = normalized.indexOf("@");
  if (separator <= 0) return "";
  return cleanLabel(normalized.slice(0, separator));
}

function createAccountLabel(value) {
  const label = cleanLabel(value);
  return label
    ? { label, labelSource: "custom" }
    : { label: DEFAULT_ACCOUNT_LABEL, labelSource: "email" };
}

function isAutomaticLabel(account) {
  if (account?.labelSource === "email") return true;
  if (account?.labelSource === "custom") return false;

  const label = cleanLabel(account?.label);
  const email = cleanLabel(account?.account?.email);
  return (
    !label ||
    label === DEFAULT_ACCOUNT_LABEL ||
    (email && label.toLocaleLowerCase() === email.toLocaleLowerCase())
  );
}

function labelAfterLogin(account, email) {
  if (!isAutomaticLabel(account)) {
    return {
      label: cleanLabel(account?.label) || DEFAULT_ACCOUNT_LABEL,
      labelSource: "custom",
    };
  }

  return {
    label: emailLocalPart(email) || DEFAULT_ACCOUNT_LABEL,
    labelSource: "email",
  };
}

function renameAccountLabel(value, email) {
  const label = cleanLabel(value);
  if (label) return { label, labelSource: "custom" };
  return {
    label: emailLocalPart(email) || DEFAULT_ACCOUNT_LABEL,
    labelSource: "email",
  };
}

module.exports = {
  DEFAULT_ACCOUNT_LABEL,
  cleanLabel,
  createAccountLabel,
  emailLocalPart,
  isAutomaticLabel,
  labelAfterLogin,
  renameAccountLabel,
};
