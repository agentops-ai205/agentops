import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { approvals, evidence, missions } from "../db/schema.js";

const riskWeight: Record<string, number> = {
  low: 0.12,
  medium: 0.32,
  high: 0.58,
  critical: 0.82
};

export async function evaluateMission(missionId: string) {
  const [mission] = await db.select().from(missions).where(eq(missions.id, missionId));
  if (!mission) throw new Error("Mission not found");

  const missionEvidence = await db
    .select()
    .from(evidence)
    .where(eq(evidence.missionId, missionId));
  const missionApprovals = await db
    .select()
    .from(approvals)
    .where(eq(approvals.missionId, missionId));

  const evidenceStrength = Math.min(1, missionEvidence.length / 4);
  const approvalStrength = missionApprovals.some((item) => item.decision === "approved")
    ? 1
    : 0.45;
  const risk = riskWeight[mission.riskLevel] ?? 0.4;
  const testEvidence = missionEvidence.some((item) =>
    ["test", "build", "execution", "test_result", "build_result", "command_output"].includes(
      item.type
    )
  )
    ? 1
    : 0.55;

  const scores = {
    quality: round(0.42 + evidenceStrength * 0.28 + testEvidence * 0.22),
    security: round(1 - risk * 0.62),
    confidence: round(evidenceStrength * 0.45 + approvalStrength * 0.35 + testEvidence * 0.2),
    risk: round(risk),
    cost_efficiency: round(0.74 - mission.autonomyLevel * 0.025 + evidenceStrength * 0.08),
    learning_yield: round(Math.min(1, missionEvidence.length / 6 + approvalStrength * 0.1))
  };

  const decision =
    scores.risk > 0.7
      ? "reject_until_risk_reduced"
      : scores.confidence >= 0.72
        ? "approve_with_notes"
        : "needs_more_evidence";

  const required_followups =
    decision === "needs_more_evidence"
      ? ["Attach test/build evidence", "Add reviewer approval before close"]
      : ["Capture reusable lesson in memory if pattern repeats"];

  return {
    scores,
    decision,
    findings: [
      `Evidence count: ${missionEvidence.length}`,
      `Human approvals: ${missionApprovals.length}`,
      `Risk level: ${mission.riskLevel}`
    ],
    required_followups
  };
}

function round(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}
