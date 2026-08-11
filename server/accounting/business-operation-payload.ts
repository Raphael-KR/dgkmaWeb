import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

type JsonObject = Record<string, CanonicalValue>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID = /^[1-9][0-9]*$/;
const QUALIFIED_NAME = /^public\.[a-z][a-z0-9_]*$/;
const RESULT_KEYS = ["action_correlation_uid", "entity_action", "entity_key", "entity_type", "ordinal"];
const BASE_SLOT_KEYS = ["local_ordinal", "phase", "qualified_table_name", "reserved_id", "result_ordinal", "slot_kind", "slot_kind_order"];
const CATALOG_SLOT_KEYS = [...BASE_SLOT_KEYS, "sequence_name", "slot_ordinal"];
const BASE_KINDS = new Map<string, ReadonlySet<number>>([
  ["operation_receipt", new Set([0])],
  ["business_row", new Set([1, 10])],
  ["audit_row", new Set([2, 30])],
]);
const CATALOG_KINDS = new Map<string, ReadonlySet<number>>([
  ["receipt", new Set([0])],
  ["business", new Set([10])],
  ["audit", new Set([30])],
]);

function fail(code: string): never {
  throw new Error(code);
}

function exactKeys(value: JsonObject, expected: string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function object(value: CanonicalValue | undefined, code: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as JsonObject;
}

function safeInteger(value: CanonicalValue | undefined, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

export function validateBusinessOperationPayloadV2(value: CanonicalValue): {
  canonical: string;
  sha256: string;
  catalogBound: boolean;
} {
  const payload = object(value, "business_operation_payload_object_invalid");
  if (
    !exactKeys(payload, ["command", "expected_results", "inputs", "reservation_slots", "schema_version"])
    || payload.schema_version !== "business-operation-payload-v2"
    || typeof payload.command !== "string"
    || payload.command.trim() !== payload.command
    || payload.command.length === 0
  ) fail("business_operation_payload_shape_invalid");
  object(payload.inputs, "business_operation_payload_inputs_invalid");
  if (
    !Array.isArray(payload.expected_results)
    || payload.expected_results.length === 0
    || !Array.isArray(payload.reservation_slots)
    || payload.reservation_slots.length === 0
  ) fail("business_operation_payload_arrays_invalid");

  const resultOrdinals = new Set<number>();
  for (let index = 0; index < payload.expected_results.length; index += 1) {
    const result = object(payload.expected_results[index], "business_operation_result_invalid");
    if (
      !exactKeys(result, RESULT_KEYS)
      || result.ordinal !== index + 1
      || typeof result.entity_type !== "string"
      || result.entity_type.length === 0
      || typeof result.entity_key !== "string"
      || result.entity_key.length === 0
      || typeof result.entity_action !== "string"
      || result.entity_action.length === 0
      || typeof result.action_correlation_uid !== "string"
      || !UUID_V4.test(result.action_correlation_uid)
    ) fail("business_operation_result_invalid");
    resultOrdinals.add(index + 1);
  }

  const first = object(payload.reservation_slots[0], "business_operation_slot_invalid");
  const catalogBound = Object.hasOwn(first, "sequence_name") || Object.hasOwn(first, "slot_ordinal");
  const expectedSlotKeys = catalogBound ? CATALOG_SLOT_KEYS : BASE_SLOT_KEYS;
  const kinds = catalogBound ? CATALOG_KINDS : BASE_KINDS;
  const auditCount = new Map<number, number>();
  let prior: [number, number, number, string, number] | undefined;

  for (let index = 0; index < payload.reservation_slots.length; index += 1) {
    const slot = object(payload.reservation_slots[index], "business_operation_slot_invalid");
    if (
      !exactKeys(slot, expectedSlotKeys)
      || !safeInteger(slot.local_ordinal, 1)
      || !safeInteger(slot.phase, 0)
      || !safeInteger(slot.result_ordinal, 0)
      || !safeInteger(slot.slot_kind_order, 0)
      || typeof slot.qualified_table_name !== "string"
      || !QUALIFIED_NAME.test(slot.qualified_table_name)
      || typeof slot.reserved_id !== "string"
      || !ID.test(slot.reserved_id)
      || typeof slot.slot_kind !== "string"
      || !kinds.get(slot.slot_kind)?.has(slot.slot_kind_order)
      || slot.phase !== slot.slot_kind_order
      || (slot.result_ordinal !== 0 && !resultOrdinals.has(slot.result_ordinal))
    ) fail("business_operation_slot_invalid");
    if (catalogBound && (
      slot.slot_ordinal !== index + 1
      || typeof slot.sequence_name !== "string"
      || !QUALIFIED_NAME.test(slot.sequence_name)
    )) fail("business_operation_catalog_slot_invalid");

    const isReceipt = slot.slot_kind === (catalogBound ? "receipt" : "operation_receipt");
    const isAudit = slot.slot_kind === (catalogBound ? "audit" : "audit_row");
    if (index === 0) {
      if (!isReceipt || slot.result_ordinal !== 0 || slot.local_ordinal !== 1 || slot.qualified_table_name !== "public.business_operation_receipts") fail("business_operation_receipt_slot_invalid");
    } else if (isReceipt || slot.result_ordinal === 0) {
      fail("business_operation_receipt_slot_invalid");
    }
    if (isAudit) auditCount.set(slot.result_ordinal, (auditCount.get(slot.result_ordinal) ?? 0) + 1);

    const current: [number, number, number, string, number] = [slot.phase, slot.result_ordinal, slot.slot_kind_order, slot.qualified_table_name, slot.local_ordinal];
    if (prior && (
      current[0] < prior[0]
      || (current[0] === prior[0] && current[1] < prior[1])
      || (current[0] === prior[0] && current[1] === prior[1] && current[2] < prior[2])
      || (current[0] === prior[0] && current[1] === prior[1] && current[2] === prior[2] && current[3] < prior[3])
      || (current[0] === prior[0] && current[1] === prior[1] && current[2] === prior[2] && current[3] === prior[3] && current[4] <= prior[4])
    )) fail("business_operation_slot_order_invalid");
    prior = current;
  }
  for (const ordinal of resultOrdinals) if (auditCount.get(ordinal) !== 1) fail("business_operation_audit_bijection_invalid");

  const canonical = canonicalJson(payload as CanonicalValue);
  return { canonical, sha256: sha256(canonical), catalogBound };
}

export function assertBusinessOperationPayloadHash(value: CanonicalValue, expectedSha256: string): void {
  const validated = validateBusinessOperationPayloadV2(value);
  if (validated.sha256 !== expectedSha256) fail("business_operation_payload_hash_mismatch");
}
