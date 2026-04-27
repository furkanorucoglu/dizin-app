import { apiFetch, apiFetchBlob, apiUrl } from "./backend-http";

type UploadedFileType = "en_pdf" | "tr_pdf" | "index_docx" | string;

type PageRef = {
  start: number;
  end?: number;
  italic?: boolean;
  raw?: string | null;
};

type Anchor = {
  en_page: number;
  tr_page: number;
  auto_detected?: boolean;
  confirmed?: boolean;
};

type Project = {
  id: string;
  title: string;
  status: string;
  status_detail?: string | null;
  created_at: string;
  updated_at: string;
  en_pdf_path?: string | null;
  tr_pdf_path?: string | null;
  index_docx_path?: string | null;
  en_offset?: number | null;
  tr_offset?: number | null;
};

type UploadResponse = {
  file_type: UploadedFileType;
  path: string;
};

type Analysis = {
  status: string;
  en_offset: number | null;
  tr_offset: number | null;
  anchors: Anchor[];
};

type ProjectRuntimeStatus = {
  status: string;
  status_detail: string | null;
  last_phase: string | null;
  last_progress: number | null;
  last_message: string | null;
};

type IndexEntry = {
  id: number;
  paragraph_index?: number;
  headword: string;
  aliases?: string[];
  is_proper_noun?: boolean;
  original_pages?: PageRef[];
  translated_pages?: PageRef[];
  confidence?: string;
  manually_edited?: boolean;
  raw_text?: string | null;
};

type EntriesPage = {
  total: number;
  items: IndexEntry[];
  offset: number;
  limit: number;
};

type HighlightResponse = {
  page_w: number;
  page_h: number;
  highlights: Array<{ x: number; y: number; w: number; h: number }>;
};

type ListEntriesParams = {
  q?: string;
  limit?: number;
  offset?: number;
};

function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function normalizePagesOrPayload(pagesOrPayload: PageRef[] | Record<string, unknown>) {
  if (Array.isArray(pagesOrPayload)) {
    return { translated_pages: pagesOrPayload };
  }

  return pagesOrPayload;
}

function uploadFile(
  projectId: string,
  fileType: UploadedFileType,
  file: File,
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file_type", fileType);
  formData.append("file", file);

  return apiFetch<UploadResponse>(`/api/projects/${projectId}/upload`, {
    method: "POST",
    body: formData,
  });
}

function analyzeProject(projectId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/api/projects/${projectId}/analyze`, {
    method: "POST",
  });
}

function processProject(projectId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/api/projects/${projectId}/process`, {
    method: "POST",
  });
}

function setAnchors(projectId: string, anchors: Pick<Anchor, "en_page" | "tr_page">[]) {
  return apiFetch<Analysis>(`/api/projects/${projectId}/anchors`, {
    method: "POST",
    body: JSON.stringify(anchors),
  });
}

function updateEntry(
  projectId: string,
  entryId: number,
  pagesOrPayload: PageRef[] | Record<string, unknown>,
): Promise<IndexEntry> {
  return apiFetch<IndexEntry>(`/api/projects/${projectId}/entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(normalizePagesOrPayload(pagesOrPayload)),
  });
}

async function downloadBlob(path: string, filename: string) {
  const blob = await apiFetchBlob(path);
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export const api = {
  listProjects: () => apiFetch<Project[]>("/api/projects"),

  getProject: (projectId: string) => apiFetch<Project>(`/api/projects/${projectId}`),

  createProject: (title: string) =>
    apiFetch<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),

  deleteProject: (projectId: string) =>
    apiFetch<void>(`/api/projects/${projectId}`, {
      method: "DELETE",
    }),

  upload: uploadFile,
  uploadFile,

  analyze: analyzeProject,
  runAnalysis: analyzeProject,
  analyzeProject,
  triggerAnalyze: analyzeProject,
  startAnalyze: analyzeProject,

  getAnalysis: (projectId: string) => apiFetch<Analysis>(`/api/projects/${projectId}/analysis`),

  confirmAnchors: setAnchors,
  setAnchors,
  updateAnchors: setAnchors,

  process: processProject,
  processProject,
  triggerProcess: processProject,
  startProcess: processProject,

  getStatus: (projectId: string) =>
    apiFetch<ProjectRuntimeStatus>(`/api/projects/${projectId}/status`),

  listEntries: (projectId: string, params: ListEntriesParams = {}) =>
    apiFetch<EntriesPage>(
      `/api/projects/${projectId}/entries${qs({
        q: params.q,
        offset: params.offset ?? 0,
        // Backend tarafında limit üst sınırı var. Frontend 1000 gönderirse 422 almamak için 500'e kırpıyoruz.
        limit: Math.min(params.limit ?? 50, 500),
      })}`,
    ),

  patchEntry: updateEntry,
  updateEntry,

  getPageImageUrl: (projectId: string, lang: "en" | "tr", page: number, dpi = 120) =>
    apiUrl(`/api/projects/${projectId}/pages/${lang}/${page}${qs({ dpi })}`),

  getPageImageBlob: (projectId: string, lang: "en" | "tr", page: number, dpi = 120) =>
    apiFetchBlob(`/api/projects/${projectId}/pages/${lang}/${page}${qs({ dpi })}`),

  getHighlights: (projectId: string, lang: "en" | "tr", page: number, term: string) =>
    apiFetch<HighlightResponse>(
      `/api/projects/${projectId}/pages/${lang}/${page}/highlight${qs({ term })}`,
    ),

  exportPdf: (projectId: string, comparison = false) =>
    apiFetchBlob(`/api/projects/${projectId}/export.pdf${qs({ comparison })}`),

  exportDocx: (projectId: string) => apiFetchBlob(`/api/projects/${projectId}/export.docx`),

  exportPdfUrl: (projectId: string, comparison = false) =>
    apiUrl(`/api/projects/${projectId}/export.pdf${qs({ comparison })}`),

  exportUrl: (projectId: string) => apiUrl(`/api/projects/${projectId}/export.pdf`),

  downloadPdf: (projectId: string, comparison = false) =>
    downloadBlob(
      `/api/projects/${projectId}/export.pdf${qs({ comparison })}`,
      comparison ? "dizin-karsilastirma.pdf" : "dizin.pdf",
    ),

  downloadDocx: (projectId: string) =>
    downloadBlob(`/api/projects/${projectId}/export.docx`, "dizin.docx"),
};
