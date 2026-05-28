import { describe, expect, it } from "vitest";
import { parseCsv, parseFeeSchedule } from "./parseFeeSchedule";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"]
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const out = parseCsv('payer,code\n"AETNA, INC.",99213\n"He said ""hi""",99214');
    expect(out[1]).toEqual(["AETNA, INC.", "99213"]);
    expect(out[2]).toEqual(['He said "hi"', "99214"]);
  });

  it("handles CRLF and trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });

  it("strips a leading BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")[0]).toEqual(["a", "b"]);
  });
});

describe("parseFeeSchedule", () => {
  it("parses a per-payer file using the default payer", () => {
    const csv = "procedure_code,modifier,allowed_amount\n99213,,130\n29881,,1100";
    const r = parseFeeSchedule(csv, { defaultPayer: "AETNA" });
    expect(r.errors).toEqual([]);
    expect(r.rates).toEqual([
      { payerName: "AETNA", procedureCode: "99213", modifier: null, allowedAmount: 130 },
      { payerName: "AETNA", procedureCode: "29881", modifier: null, allowedAmount: 1100 }
    ]);
    expect(r.payers).toEqual([{ payerName: "AETNA", count: 2 }]);
  });

  it("uses a per-row payer column when present", () => {
    const csv = "payer,cpt,rate\nAETNA,99213,130\nBCBS,99214,210";
    const r = parseFeeSchedule(csv);
    expect(r.errors).toEqual([]);
    expect(r.rates.map((x) => x.payerName)).toEqual(["AETNA", "BCBS"]);
    expect(r.payers).toHaveLength(2);
  });

  it("matches header aliases (cpt, rate) and normalizes case/modifier", () => {
    const csv = "CPT,Mod,Rate\n99213,25,130.50";
    const r = parseFeeSchedule(csv, { defaultPayer: "Aetna" });
    expect(r.rates[0]).toEqual({
      payerName: "Aetna",
      procedureCode: "99213",
      modifier: "25",
      allowedAmount: 130.5
    });
  });

  it("strips $ and commas from amounts", () => {
    const csv = "code,amount\n29881,\"$1,100.00\"";
    const r = parseFeeSchedule(csv, { defaultPayer: "AETNA" });
    expect(r.rates[0].allowedAmount).toBe(1100);
  });

  it("errors when the code column is missing", () => {
    const csv = "payer,amount\nAETNA,130";
    const r = parseFeeSchedule(csv);
    expect(r.rates).toEqual([]);
    expect(r.errors[0].message).toMatch(/procedure-code column/);
  });

  it("errors when the amount column is missing", () => {
    const csv = "payer,cpt\nAETNA,99213";
    const r = parseFeeSchedule(csv);
    expect(r.errors[0].message).toMatch(/allowed-amount column/);
  });

  it("errors when no payer is resolvable", () => {
    const csv = "cpt,rate\n99213,130";
    const r = parseFeeSchedule(csv); // no default payer, no column
    expect(r.errors[0].message).toMatch(/payer/i);
  });

  it("skips invalid and negative amounts with per-row errors", () => {
    const csv =
      "code,amount\n99213,130\n99214,abc\n99215,-5";
    const r = parseFeeSchedule(csv, { defaultPayer: "AETNA" });
    expect(r.rates).toHaveLength(1);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatchObject({ line: 3 });
    expect(r.errors[1]).toMatchObject({ line: 4 });
  });

  it("flags duplicate code+modifier within the file", () => {
    const csv = "code,amount\n99213,130\n99213,140";
    const r = parseFeeSchedule(csv, { defaultPayer: "AETNA" });
    expect(r.rates).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/duplicate/i);
  });

  it("treats same code with different modifier as distinct", () => {
    const csv = "code,modifier,amount\n99213,,130\n99213,25,160";
    const r = parseFeeSchedule(csv, { defaultPayer: "AETNA" });
    expect(r.rates).toHaveLength(2);
    expect(r.errors).toEqual([]);
  });

  it("skips fully blank lines", () => {
    const csv = "code,amount\n99213,130\n\n\n29881,1100\n";
    const r = parseFeeSchedule(csv, { defaultPayer: "AETNA" });
    expect(r.rates).toHaveLength(2);
  });
});
