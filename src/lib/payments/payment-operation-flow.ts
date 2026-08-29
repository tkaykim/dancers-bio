export type PaymentOperationExecutionMode = "two_person" | "direct";

export type InitialPaymentOperationState = {
  execution_mode: PaymentOperationExecutionMode;
  status: "requested" | "processing";
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  processed_at: string | null;
  version: 1 | 2;
};

export function buildInitialPaymentOperationState(input: {
  canExecuteDirectly: boolean;
  actorId: string;
  actorName: string;
  now: string;
}): InitialPaymentOperationState {
  if (!input.canExecuteDirectly) {
    return {
      execution_mode: "two_person",
      status: "requested",
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
      processed_at: null,
      version: 1,
    };
  }

  return {
    execution_mode: "direct",
    status: "processing",
    approved_by: input.actorId,
    approved_by_name: input.actorName,
    approved_at: input.now,
    processed_at: input.now,
    version: 2,
  };
}
