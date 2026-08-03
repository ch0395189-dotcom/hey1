export interface ExportableContact {
  customer_name: string | null;
  customer_phone: string;
  platform: string;
  last_message_at: string;
  is_archived?: boolean;
  blocked_at?: string | null;
  tags?: { name: string }[];
  last_message?: { content: string | null } | null;
}

const escapeCsv = (value: unknown): string => {
  const str = value === null || value === undefined ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

export const buildContactsCsv = (contacts: ExportableContact[]): string => {
  const headers = [
    "Nombre",
    "Telefono",
    "Plataforma",
    "Ultimo mensaje (fecha)",
    "Ultimo mensaje (texto)",
    "Etiquetas",
    "Archivado",
    "Bloqueado",
  ];
  const rows = contacts.map((c) =>
    [
      c.customer_name ?? "",
      c.customer_phone,
      c.platform,
      c.last_message_at ? new Date(c.last_message_at).toLocaleString("es-CO") : "",
      c.last_message?.content ?? "",
      (c.tags ?? []).map((t) => t.name).join(" | "),
      c.is_archived ? "Si" : "No",
      c.blocked_at ? "Si" : "No",
    ]
      .map(escapeCsv)
      .join(","),
  );
  // BOM so Excel opens accents correctly
  return "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows].join("\r\n");
};

export const downloadContactsCsv = (
  contacts: ExportableContact[],
  filenamePrefix = "contactos-heyhey",
): number => {
  const csv = buildContactsCsv(contacts);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  link.href = url;
  link.download = `${filenamePrefix}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return contacts.length;
};

export const AUTO_CLEAN_LIMIT_KEY = "heyhey_autoclean_limit";

export const getAutoCleanLimit = (): number => {
  const raw = localStorage.getItem(AUTO_CLEAN_LIMIT_KEY);
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : 1000;
};

export const setAutoCleanLimit = (limit: number) => {
  localStorage.setItem(AUTO_CLEAN_LIMIT_KEY, String(limit));
};
