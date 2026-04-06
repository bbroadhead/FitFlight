import csv
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK_PATH = Path(r"C:\Users\benja\Downloads\add_emails_to_column_completed.xlsx")
NORMALIZED_ROSTER_PATH = ROOT / "local-data" / "roster.normalized.json"
OUTPUT_DIR = ROOT / "local-data"
MATCH_REPORT_PATH = OUTPUT_DIR / "roster_email_compare_report.json"
MATCHED_CSV_PATH = OUTPUT_DIR / "roster_email_matched.csv"


FLIGHT_TO_ROSTER = {
    "Apex": "A FLT",
    "Bomber": "B FLT",
    "Cryptid": "C FLT",
    "Doom": "D FLT",
    "Ewok": "E FLT",
    "Foxhound": "F FLT",
    "ADF": "ADF",
    "DET": "DET 1",
}

RANK_TO_ROSTER = {
    "AB": "AB",
    "Amn": "AMN",
    "A1C": "A1C",
    "SrA": "SRA",
    "SSgt": "SSG",
    "TSgt": "TSG",
    "MSgt": "MSG",
    "SMSgt": "SMS",
    "CMSgt": "CMS",
}

NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def load_normalized_roster():
    payload = json.loads(NORMALIZED_ROSTER_PATH.read_text(encoding="utf-8-sig"))
    return payload["members"]


def read_workbook_rows():
    with zipfile.ZipFile(WORKBOOK_PATH) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", NS):
                shared_strings.append("".join(node.text or "" for node in item.findall(".//a:t", NS)))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        sheet = workbook.find("a:sheets/a:sheet", NS)
        sheet_target = "xl/" + rel_map[sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]]
        worksheet = ET.fromstring(archive.read(sheet_target))

        rows = []
        for row in worksheet.findall("a:sheetData/a:row", NS):
            values = []
            for cell in row.findall("a:c", NS):
                cell_type = cell.attrib.get("t")
                value = cell.find("a:v", NS)
                if value is None:
                    inline = cell.find("a:is", NS)
                    values.append("".join(node.text or "" for node in inline.findall(".//a:t", NS)) if inline is not None else "")
                else:
                    raw = value.text or ""
                    values.append(shared_strings[int(raw)] if cell_type == "s" else raw)
            rows.append(values)
        return rows


def build_json_key(member):
    return (
        member["lastName"].strip().upper(),
        member["firstName"].strip().split()[0].upper(),
        RANK_TO_ROSTER.get(member["rank"], member["rank"].upper()),
        FLIGHT_TO_ROSTER[member["flight"]].upper(),
    )


def build_workbook_key(full_name, rank, flight):
    last_name, first_middle = [part.strip() for part in full_name.split(",", 1)]
    first_name = first_middle.split()[0] if first_middle else ""
    return (last_name.upper(), first_name.upper(), rank.strip().upper(), flight.strip().upper())


def main():
    normalized_members = load_normalized_roster()
    workbook_rows = read_workbook_rows()
    header = workbook_rows[0]
    index = {name: header.index(name) for name in header}

    workbook_by_key = {}
    for row in workbook_rows[1:]:
        if not any(row):
            continue
        full_name = row[index["FULL_NAME"]].strip()
        rank = row[index["RANK"]].strip()
        email = row[index["EMAIL"]].strip()
        flight = row[index["FLT-DET"]].strip()
        workbook_by_key[build_workbook_key(full_name, rank, flight)] = {
            "FULL_NAME": full_name,
            "RANK": rank,
            "EMAIL": email,
            "FLT-DET": flight,
        }

    matched = []
    missing_from_workbook = []
    for member in normalized_members:
        key = build_json_key(member)
        workbook_row = workbook_by_key.get(key)
        if workbook_row:
            matched.append(
                {
                    "FULL_NAME": workbook_row["FULL_NAME"],
                    "RANK": workbook_row["RANK"],
                    "EMAIL": workbook_row["EMAIL"],
                    "FLT-DET": workbook_row["FLT-DET"],
                }
            )
        else:
            missing_from_workbook.append(
                {
                    "rank": member["rank"],
                    "firstName": member["firstName"],
                    "lastName": member["lastName"],
                    "flight": member["flight"],
                }
            )

    normalized_keys = {build_json_key(member) for member in normalized_members}
    extra_in_workbook = [
        row for key, row in workbook_by_key.items() if key not in normalized_keys
    ]

    with MATCHED_CSV_PATH.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=["FULL_NAME", "RANK", "EMAIL", "FLT-DET"])
        writer.writeheader()
        writer.writerows(sorted(matched, key=lambda item: (item["FLT-DET"], item["FULL_NAME"])))

    report = {
        "normalizedRosterCount": len(normalized_members),
        "workbookCount": len(workbook_by_key),
        "matchedCount": len(matched),
        "missingFromWorkbookCount": len(missing_from_workbook),
        "extraInWorkbookCount": len(extra_in_workbook),
        "missingFromWorkbook": missing_from_workbook,
        "extraInWorkbook": extra_in_workbook,
        "matchedCsv": str(MATCHED_CSV_PATH),
    }
    MATCH_REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
