export type ProjectStatus =
  | "draft"
  | "analyzing"
  | "ready"
  | "processing"
  | "done"
  | "error"
  | string;

export type UploadedFileType = "en_pdf" | "tr_pdf" | "index_docx";

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  status_detail: string | null;
  created_at: string;
  updated_at: string;
  en_pdf_path: string | null;
  tr_pdf_path: string | null;
  index_docx_path: string | null;
  en_offset: number | null;
  tr_offset: number | null;
}

export interface UploadResponse {
  file_type: UploadedFileType | string;
  path: string;
}

export interface Anchor {
  en_page: number;
  tr_page: number;
  auto_detected?: boolean;
  confirmed?: boolean;
}

export interface Analysis {
  status: string;
  en_offset: number | null;
  tr_offset: number | null;
  anchors: Anchor[];
}

export interface Status {
  status: string;
  status_detail: string | null;
  last_phase: string | null;
  last_progress: number | null;
  last_message: string | null;
}

export type ProjectRuntimeStatus = Status;

export interface PageRef {
  start: number;
  end?: number;
  italic?: boolean;
  raw?: string | null;
}

export interface Entry {
  id: number;
  paragraph_index: number;
  headword: string;
  aliases: string[];
  is_proper_noun: boolean;
  original_pages: PageRef[];
  translated_pages: PageRef[];
  confidence: "high" | "medium" | "low" | string;
  manually_edited: boolean;
  raw_text: string | null;
}

// Yeni review ekranı bazı yerlerde IndexEntry adını kullanıyor.
export type IndexEntry = Entry;

export interface EntriesPage {
  total: number;
  items: Entry[];
  offset: number;
  limit: number;
}

export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HighlightResponse {
  page_w: number;
  page_h: number;
  highlights: HighlightRect[];
}
