/** Types for document-to-form extraction (aligned with backend ai-extract API). */

export type FieldConfidence = "high" | "medium" | "low";

export interface ExtractedFieldValue<T = string | number | null> {
  value: T;
  confidence: number;
  source_text?: string | null;
  /** Backend attribution: uploaded_document | website | ai_inference | … */
  source?: string | null;
}

export interface DuplicateWarning {
  field: string;
  existing_value: string;
  existing_id: number;
}

export interface CustomerExtractionResponse {
  success: boolean;
  document_type: string;
  fields: Record<string, ExtractedFieldValue>;
  unmapped_text: string[];
  warnings: string[];
  duplicate_warnings: DuplicateWarning[];
}

/** Supplier/vendor master extraction — same shape as customer extraction. */
export type VendorExtractionResponse = CustomerExtractionResponse;

export interface InquiryItemExtractedRow {
  item_name: string;
  description: string;
  quantity?: number | null;
  confidence: number;
}

export interface CandidateMatch {
  id: number;
  name: string;
  score: number;
}

export interface InquiryExtractionResponse {
  success: boolean;
  document_type: string;
  fields: Record<string, ExtractedFieldValue>;
  items: InquiryItemExtractedRow[];
  candidate_matches: {
    customer?: CandidateMatch[];
    style?: CandidateMatch[];
  };
  unmapped_text: string[];
  warnings: string[];
}

export type ExtractionStatus = "idle" | "uploading" | "extracted" | "partial" | "failed";

export type ConflictResolutionChoice = "keep" | "use_extracted" | "merge";

export interface FieldApplyState {
  fieldKey: string;
  label: string;
  extractedValue: string;
  extractedDisplay: string;
  currentValue: string;
  applied: boolean;
  skipped: boolean;
  hasConflict: boolean;
  confidence: number;
  confidenceLevel: FieldConfidence;
  conflictResolution?: ConflictResolutionChoice;
}
