/** Chain step status from GET /production/planning/pipeline/.../readiness */
export type ChainStepStatus = "ready" | "warning" | "blocked" | "not_started";

export interface ChainStep {
  status: ChainStepStatus;
  detail?: string;
}

export interface CustomerApprovalChain extends ChainStep {
  total: number;
  completed: number;
  items: Array<{
    id: number;
    action: string;
    phase: string;
    status: string;
    approval_status: string | null;
    mandatory: boolean;
    done: boolean;
  }>;
}

export interface MaterialReadinessChain {
  status: ChainStepStatus;
  total: number;
  ready_count: number;
  items: Array<{
    item_id: number;
    item_name: string;
    category: string;
    required: number;
    on_hand: number;
    short: number;
    ready: boolean;
  }>;
}

export interface OrderReadinessPayload {
  order_id: number;
  style_id: number | null;
  style_code?: string | null;
  style_name?: string | null;
  bom_id: number | null;
  lines: MaterialReadinessChain["items"];
  all_ready: boolean;
  overall_status?: string;
  chain?: {
    style_linked: ChainStep;
    ob_ready: ChainStep;
    customer_approval: CustomerApprovalChain;
    material_readiness: MaterialReadinessChain;
    line_allocated: ChainStep;
  };
  message?: string;
}

export interface PipelineOrderRow {
  order_id: number;
  order_code: string;
  status: string;
  quantity: number | null;
  delivery_date: string | null;
  style_ref: string | null;
  readiness: OrderReadinessPayload;
}

export interface PipelineStyleGroup {
  style_id: number | null;
  style_code: string | null;
  style_name: string | null;
  orders: PipelineOrderRow[];
}
