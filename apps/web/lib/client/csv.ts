import { schedToBlocks, type InternSchedule, type Department } from "@rp/engine";

// Browser CSV export, ported from rotation_planner.jsx exportCSV.
// `nameById` (FEEDBACK #8) is an optional EPHEMERAL student-name mapping applied
// to this export only; when present a "Student" column is added. Nothing persisted.
export function exportScheduleCsv(
  internSchedules: InternSchedule[],
  departments: Department[],
  nameById?: Record<number, string>,
): void {
  const named = !!nameById;
  const header = named
    ? "Intern ID,Student,Block,Department,Start Week,End Week,Duration"
    : "Intern ID,Block,Department,Start Week,End Week,Duration";
  const rows = [header];
  for (const { id, schedule } of internSchedules) {
    schedToBlocks(schedule).forEach((b, i) => {
      const name = departments[b.dept]?.name ?? `Dept ${b.dept}`;
      const cols = named
        ? [id, `"${(nameById?.[id] ?? "").replace(/"/g, '""')}"`, i + 1, `"${name}"`, b.start + 1, b.end + 1, b.end - b.start + 1]
        : [id, i + 1, `"${name}"`, b.start + 1, b.end + 1, b.end - b.start + 1];
      rows.push(cols.join(","));
    });
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rotation_schedule_${internSchedules.length}_interns.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
