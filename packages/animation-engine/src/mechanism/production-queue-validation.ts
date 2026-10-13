import {
  MechanismProductionQueueProductVersionsSchema as MechanismProductionQueueProductSchema,
  type MechanismProductionQueueAny as MechanismProductionQueue,
  type MechanismProductionQueueItemAny as MechanismProductionQueueItem,
  type MechanismProductionQueueState,
  type MechanismProductionQueueRow,
  type MechanismProductionQueueProductAny as MechanismProductionQueueProduct,
  type MechanismProductionAttempt,
} from "./production-queue-contract.ts";
import { productionFailure } from "./production-queue-files.ts";
import { freezeMechanismPack, mechanismPackHash } from "./pack-support.ts";
import { inspectMechanismProductionDisposition } from "./production-report.ts";
export const productionQueueItemIdentity = (
  item: MechanismProductionQueueItem,
) =>
  mechanismPackHash({
    id: item.id,
    question: item.question,
    family: item.family,
    designVariant: item.designVariant,
    ...("backend" in item ? { backend: item.backend } : {}),
  });
export const productionQueueItemRequest = (
  item: MechanismProductionQueueItem,
  queue: MechanismProductionQueue,
) =>
  mechanismPackHash({
    item,
    codeSha256: queue.codeSha256,
    profileSha256: queue.profileSha256,
  });
export function assertProductionJournal(
  queue: MechanismProductionQueue,
  hash: string,
  prior: MechanismProductionQueueState,
): void {
  if (
    prior.manifestHash !== hash ||
    prior.id !== queue.id ||
    prior.revision !== queue.revision ||
    prior.codeSha256 !== queue.codeSha256 ||
    prior.profileSha256 !== queue.profileSha256 ||
    prior.rows.length !== queue.items.length ||
    queue.items.some((item) => {
      const row = prior.rows.find((r) => r.id === item.id);
      return (
        !row ||
        row.identityHash !== productionQueueItemIdentity(item) ||
        row.requestHash !== productionQueueItemRequest(item, queue)
      );
    })
  )
    productionFailure(
      "production-journal-binding",
      "Stored journal differs from its queued manifest",
      "queue-state.json",
    );
}
export function assertProductionProduct(
  queue: MechanismProductionQueue,
  item: MechanismProductionQueueItem,
  row: MechanismProductionQueueRow,
  value: unknown,
): MechanismProductionQueueProduct {
  const product = MechanismProductionQueueProductSchema.parse(value),
    report = product.report;
  if (
    (queue.schemaVersion === "mechanism-production-queue-2") !==
      (product.schemaVersion === "mechanism-production-queue-product-2") ||
    product.requestHash !== row.requestHash ||
    report.binding.inputSha256 !== row.requestHash ||
    report.id !== item.id ||
    report.question !== item.question ||
    report.family !== item.family ||
    report.designVariant !== item.designVariant ||
    report.binding.codeSha256 !== queue.codeSha256 ||
    report.binding.profileSha256 !== queue.profileSha256 ||
    report.clock.outputFrames !== item.clock.outputFrames ||
    report.clock.sourceSamples !== item.clock.sourceSamples
  )
    productionFailure(
      "production-product-binding",
      "Worker product differs from its queue request",
      item.id,
    );
  if (
    inspectMechanismProductionDisposition(report).statuses.technical !==
    "passed"
  )
    productionFailure(
      "production-technical-incomplete",
      "Worker must complete current technical checks before publication",
      item.id,
    );
  return freezeMechanismPack(product);
}
export function productionReportAttempts(
  attempts: MechanismProductionAttempt[],
) {
  return attempts.map((a) => ({
    number: a.number,
    inputSha256: a.requestHash,
    status: a.status,
    stage: a.stage,
    seconds: a.seconds,
    diagnostic: a.diagnostic,
    ...(a.finding ? { finding: a.finding } : {}),
  }));
}
