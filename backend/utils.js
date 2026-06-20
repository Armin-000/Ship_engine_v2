export function normalizeKey(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-./\\]+/g, " ")
    .replace(/[^\w\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleFromKey(key = "") {
  return (
    String(key || "Component")
      .replace(/^path:/, "")
      .replace(/^name:/, "")
      .replace(/^uuid:/, "")
      .split("/")
      .pop()
      .replace(/_/g, " ")
      .trim() || "Component"
  );
}

export function safeFileName(name = "") {
  return String(name || "document.pdf")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}