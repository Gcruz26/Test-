export interface EquitiVoyceRow {
  [key: string]: string;
}

export interface EquitiVoyceWorkbook {
  source_platform: "Voyce";
  row_count: number;
  column_count: number;
  headers: string[];
  rows: EquitiVoyceRow[];
}
