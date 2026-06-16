/**
 * Server-side PDF rendering of a roster via @react-pdf/renderer.
 * Node runtime only (imported from a route handler with runtime = "nodejs").
 */
import * as React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { ScheduleDetail } from "@/lib/data/schedules";

export interface RosterPdfInput {
  configName: string;
  totalWeeks: number;
  version: number;
  status: string;
  generatedAt: Date;
  assignments: ScheduleDetail["assignments"];
  /**
   * FEEDBACK #8 — optional EPHEMERAL student-name mapping (intern index → name).
   * When present, intern labels are replaced by real names for this render only;
   * nothing is persisted. Absent ⇒ anonymous "Intern N" labels (default).
   */
  nameByIndex?: Record<number, string>;
}

interface DeptGroupEntry {
  internLabel: string;
  start: number;
  end: number;
}

/** Pivot assignments into a department-centric grouping for the "By department" page. */
function groupByDepartment(
  assignments: ScheduleDetail["assignments"],
): { deptName: string; entries: DeptGroupEntry[] }[] {
  const map = new Map<string, DeptGroupEntry[]>();
  const order: string[] = [];
  for (const a of assignments) {
    for (const b of a.rotation) {
      if (!map.has(b.deptName)) {
        map.set(b.deptName, []);
        order.push(b.deptName);
      }
      map.get(b.deptName)!.push({ internLabel: a.internLabel, start: b.start, end: b.end });
    }
  }
  return order.map((deptName) => ({
    deptName,
    entries: map
      .get(deptName)!
      .slice()
      .sort((x, y) => x.start - y.start || x.internLabel.localeCompare(y.internLabel)),
  }));
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  meta: { fontSize: 9, color: "#64748b", marginBottom: 12 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 3,
  },
  internCell: { width: 90, fontFamily: "Helvetica-Bold" },
  rotationCell: { flex: 1 },
  block: { color: "#334155" },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4 },
  deptName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 2, color: "#1e293b" },
  deptEntry: { flexDirection: "row", paddingVertical: 1.5 },
  deptInternCell: { width: 90 },
  deptWeeksCell: { flex: 1, color: "#475569" },
});

function rotationLine(rotation: ScheduleDetail["assignments"][number]["rotation"]): string {
  return rotation
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((b) => `${b.deptName} (wk ${b.start + 1}-${b.end + 1})`)
    .join("  •  ");
}

function RosterDoc({ input }: { input: RosterPdfInput }) {
  return (
    <Document
      title={`${input.configName} — roster v${input.version}`}
      author="RotationPlanner"
    >
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <Text style={styles.title}>{input.configName}</Text>
        <Text style={styles.meta}>
          Version {input.version} · {input.status} · {input.totalWeeks} weeks ·{" "}
          {input.assignments.length} interns · generated{" "}
          {new Date(input.generatedAt).toLocaleDateString()}
        </Text>
        {input.assignments.map((a) => (
          <View key={a.internIndex} style={styles.row} wrap={false}>
            <Text style={styles.internCell}>{a.internLabel}</Text>
            <Text style={[styles.rotationCell, styles.block]}>{rotationLine(a.rotation)}</Text>
          </View>
        ))}
      </Page>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <Text style={styles.title}>{input.configName} — by department</Text>
        <Text style={styles.meta}>
          Department-wise student lists · version {input.version} · {input.status}
        </Text>
        {groupByDepartment(input.assignments).map((g) => (
          <View key={g.deptName} wrap={false}>
            <Text style={styles.deptName}>
              {g.deptName} ({g.entries.length})
            </Text>
            {g.entries.map((e, ei) => (
              <View key={ei} style={styles.deptEntry}>
                <Text style={styles.deptInternCell}>{e.internLabel}</Text>
                <Text style={styles.deptWeeksCell}>
                  wk {e.start + 1}
                  {e.start !== e.end ? `-${e.end + 1}` : ""} ({e.end - e.start + 1}w)
                </Text>
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

/** Apply an ephemeral name map (if any) by overriding each intern's display label. */
function withNames(input: RosterPdfInput): RosterPdfInput {
  const map = input.nameByIndex;
  if (!map) return input;
  return {
    ...input,
    assignments: input.assignments.map((a) => ({
      ...a,
      internLabel: map[a.internIndex] ?? a.internLabel,
    })),
  };
}

export async function renderRosterPdf(input: RosterPdfInput): Promise<Buffer> {
  return renderToBuffer(<RosterDoc input={withNames(input)} />);
}
