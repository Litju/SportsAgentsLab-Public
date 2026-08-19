"use client";

import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable
} from "@tanstack/react-table";
import type { Column } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Check, Columns3, Inbox, Search } from "lucide-react";
import { useRef } from "react";
import type { MefStatus } from "../../mef-primitives";
import { MefStatusChip } from "../../mef-primitives";

export type MefTableRow = Readonly<{
  id: string;
  title: string;
  detail: string;
  status: MefStatus;
  href: string;
}>;

const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel()
});
const columnHelper = createColumnHelper<typeof features, MefTableRow>();
const columns = columnHelper.columns([
  columnHelper.display({
    id: "select",
    enableHiding: false,
    header: (info) => (
      <input
        aria-label="Select all visible records"
        aria-checked={info.table.getIsSomeRowsSelected() ? "mixed" : info.table.getIsAllRowsSelected()}
        checked={info.table.getIsAllRowsSelected()}
        onChange={info.table.getToggleAllRowsSelectedHandler()}
        type="checkbox"
      />
    ),
    cell: (info) => (
      <input
        aria-label={`Select ${info.row.original.title}`}
        checked={info.row.getIsSelected()}
        disabled={!info.row.getCanSelect()}
        onChange={info.row.getToggleSelectedHandler()}
        type="checkbox"
      />
    )
  }),
  columnHelper.accessor("title", {
    header: (info) => <SortableHeader label="Record" column={info.column} />,
    cell: (info) => <div className="mef-table-record"><strong>{info.row.original.title}</strong><span>{info.row.original.detail}</span></div>
  }),
  columnHelper.accessor("status", { header: (info) => <SortableHeader label="State" column={info.column} />, cell: (info) => <MefStatusChip compact status={info.row.original.status} /> }),
  columnHelper.display({ id: "action", header: () => <span className="sr-only">Actions</span>, cell: (info) => <a className="mef-row-action" href={info.row.original.href}>Open <ArrowUpRight aria-hidden="true" size={14} /></a> })
]);

const columnLabels: Record<string, string> = { title: "Record", status: "State", action: "Open" };

function SortableHeader<TValue>({ label, column }: Readonly<{ label: string; column: Column<typeof features, MefTableRow, TValue> }>) {
  const sorted = column.getIsSorted();
  const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button aria-label={`Sort by ${label}`} className="mef-table-sort" disabled={!column.getCanSort()} onClick={column.getToggleSortingHandler()} type="button">
      <span>{label}</span><SortIcon aria-hidden="true" size={13} />
    </button>
  );
}

export function MefDataTable({ rows, caption = "Governed records" }: Readonly<{ rows: MefTableRow[]; caption?: string }>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const table = useTable({ data: rows, columns, features, getRowId: (row) => row.id });
  const tableRows = table.getRowModel().rows;
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is used only for long, bounded tables.
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 58, overscan: 6 });
  const virtual = tableRows.length > 12 ? virtualizer.getVirtualItems() : [];
  const virtualByIndex = new Map(virtual.map((item) => [item.index, item]));

  if (!rows.length) {
    return <div className="mef-table-empty" role="status"><Inbox aria-hidden="true" size={20} /><strong>No governed records</strong><span>There is no source-linked record to show in this table.</span></div>;
  }

  return (
    <div className="mef-data-table-shell">
      <div className="mef-data-table-toolbar">
        <label className="mef-table-filter"><Search aria-hidden="true" size={14} /><span className="sr-only">Filter governed records</span><input aria-label="Filter governed records" onChange={(event) => table.setGlobalFilter(event.target.value)} placeholder="Filter records" type="search" value={table.state.globalFilter ?? ""} /></label>
        <details className="mef-table-columns"><summary><Columns3 aria-hidden="true" size={14} />Columns</summary><div className="mef-table-columns-menu">{table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => <label key={column.id}><input checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} type="checkbox" /><span>{columnLabels[column.id] ?? column.id}</span></label>)}</div></details>
        <span className="mef-table-selection" aria-live="polite">{table.getSelectedRowModel().rows.length ? <><Check aria-hidden="true" size={13} />{table.getSelectedRowModel().rows.length} selected</> : `${tableRows.length} shown`}</span>
      </div>
      <div className="mef-data-table-wrap" ref={scrollRef}>
      <table className="mef-data-table">
        <caption>{caption}</caption>
        <thead><tr>{table.getHeaderGroups()[0].headers.map((header) => <th key={header.id} scope="col">{header.isPlaceholder ? null : <table.FlexRender header={header} />}</th>)}</tr></thead>
        <tbody style={virtual.length ? { height: `${virtualizer.getTotalSize()}px`, position: "relative" } : undefined}>
          {(virtual.length ? virtual.map((item) => tableRows[item.index]) : tableRows).map((row) => {
            const virtualItem = virtualByIndex.get(row.index);
            return <tr key={row.id} style={virtualItem ? { position: "absolute", top: 0, transform: `translateY(${virtualItem.start}px)`, width: "100%" } : undefined}>
              {row.getVisibleCells().map((cell) => <td key={cell.id}><table.FlexRender cell={cell} /></td>)}
            </tr>
          })}
        </tbody>
      </table>
      {!tableRows.length && <div className="mef-table-filter-empty" role="status">No records match this filter.</div>}
      </div>
    </div>
  );
}
