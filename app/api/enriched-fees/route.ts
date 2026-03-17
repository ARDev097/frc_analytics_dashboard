import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function normalizeYear(year: string): string {
  if (!year) return year;
  if (year.includes("-")) return year;
  const yearNum = parseInt(year, 10);
  if (Number.isNaN(yearNum)) return year;
  const startYear = yearNum - 1;
  const nextYear = yearNum % 100;
  return `${startYear}-${nextYear.toString().padStart(2, "0")}`;
}

function normalizeBoard(raw: string): string {
  const value = (raw || "").trim();
  const upper = value.toUpperCase();

  if (upper.includes("CBSE")) return "CBSE";
  if (upper.includes("GSHSEB")) return "GSHSEB";
  if (upper.includes("ICSE") || upper.includes("CISCE")) return "ICSE";
  return "Other";
}

export async function GET() {
  try {
    const { rows } = await getDbPool().query<{
      fee_key: string;
      school_key: string;
      school_name: string;
      index_number: string | null;
      district: string | null;
      medium: string | null;
      board: string | null;
      standard_id: number;
      academic_year: string | number | null;
      approved_fee: number | null;
    }>(`
      select
        f.fee_key::text as fee_key,
        f.school_key::text as school_key,
        s.school_name::text as school_name,
        s.index_number::text as index_number,
        s.district::text as district,
        s.medium::text as medium,
        s.board::text as board,
        f.standard_id::int as standard_id,
        f.academic_year::text as academic_year,
        f.approved_fee::float8 as approved_fee
      from fact_school_fees f
      join dim_school s on s.school_key = f.school_key
    `);

    const enrichedFees = rows.map((r) => ({
      fee_key: r.fee_key ?? "",
      school_key: r.school_key ?? "",
      school_name: r.school_name ?? "",
      index_number: r.index_number ?? "",
      district: r.district ?? "",
      medium: r.medium ?? "",
      board: normalizeBoard(r.board ?? ""),
      source_url: "",
      standard_id: Number(r.standard_id) || 0,
      academic_year: normalizeYear(String(r.academic_year ?? "")),
      approved_fee: r.approved_fee === null ? null : Number(r.approved_fee),
    }));

    return NextResponse.json(enrichedFees, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("Failed to query enriched fees:", err);
    return NextResponse.json(
      { error: "Failed to load data" },
      { status: 500 }
    );
  }
}

