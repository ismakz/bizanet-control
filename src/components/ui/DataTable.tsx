import { ReactNode } from "react";

interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({ data, columns, keyExtractor, emptyMessage = "Aucune donnée disponible" }: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-[#0B131E]/80 backdrop-blur-md p-12 text-center">
        <p className="text-white/50">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0B131E]/80 backdrop-blur-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-white/[0.02] border-b border-white/5 text-xs uppercase tracking-wider text-white/50">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="px-6 py-4 font-medium">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.map((item) => (
              <tr key={keyExtractor(item)} className="hover:bg-white/[0.02] transition-colors">
                {columns.map((col, i) => (
                  <td key={i} className="px-6 py-4">
                    {col.cell ? col.cell(item) : col.accessorKey ? String(item[col.accessorKey]) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
