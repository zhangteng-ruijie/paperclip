import { useState } from "react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TestItem {
  id: string;
  name: string;
  status: "passed" | "failed" | "pending";
  duration: number;
  date: string;
}

const sampleData: TestItem[] = [
  { id: "1", name: "Auth login flow", status: "passed", duration: 120, date: "2026-04-14" },
  { id: "2", name: "User profile update", status: "passed", duration: 85, date: "2026-04-14" },
  { id: "3", name: "DataTable sorting", status: "failed", duration: 0, date: "2026-04-13" },
  { id: "4", name: "Pagination navigation", status: "pending", duration: 0, date: "2026-04-13" },
  { id: "5", name: "Row selection", status: "passed", duration: 45, date: "2026-04-12" },
  { id: "6", name: "Search filtering", status: "passed", duration: 92, date: "2026-04-12" },
  { id: "7", name: "API integration", status: "failed", duration: 0, date: "2026-04-11" },
  { id: "8", name: "Error handling", status: "passed", duration: 67, date: "2026-04-11" },
  { id: "9", name: "Form validation", status: "passed", duration: 33, date: "2026-04-10" },
  { id: "10", name: "Modal dialogs", status: "pending", duration: 0, date: "2026-04-10" },
  { id: "11", name: "Keyboard shortcuts", status: "passed", duration: 28, date: "2026-04-09" },
  { id: "12", name: "Responsive layout", status: "passed", duration: 110, date: "2026-04-09" },
];

const columns: Column<TestItem>[] = [
  {
    key: "name",
    header: "Test Name",
    sortable: true,
    render: (row) => <span className="font-medium">{row.name}</span>,
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    width: "120px",
    render: (row) => (
      <Badge
        variant={
          row.status === "passed"
            ? "default"
            : row.status === "failed"
              ? "destructive"
              : "secondary"
        }
      >
        {row.status}
      </Badge>
    ),
  },
  {
    key: "duration",
    header: "Duration",
    sortable: true,
    width: "100px",
    render: (row) => (row.duration > 0 ? `${row.duration}ms` : "—"),
  },
  {
    key: "date",
    header: "Date",
    sortable: true,
    width: "120px",
    render: (row) => row.date,
  },
];

export function TestsDataTable() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleRowClick = (row: TestItem) => {
    console.log("Row clicked:", row.id);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Test Results</h2>
        <p className="text-sm text-muted-foreground">
          Example DataTable usage with sorting, pagination, and row selection.
        </p>
        {selectedIds.size > 0 && (
          <p className="text-sm text-muted-foreground">
            {selectedIds.size} item{selectedIds.size > 1 ? "s" : ""} selected
          </p>
        )}
      </div>

      <DataTable
        data={sampleData}
        columns={columns}
        pageSize={5}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={handleRowClick}
        emptyMessage="No tests found"
      />
    </div>
  );
}
