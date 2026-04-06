import json
import os
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


WORKBOOK_PATH = Path(r"C:\Users\benja\Downloads\add_emails_to_column_completed.xlsx")
NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def load_workbook_rows(path: Path):
    with zipfile.ZipFile(path) as archive:
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


def letters_only(value: str):
    return "".join(char for char in value.lower() if char.isalpha())


def build_default_password(full_name: str):
    last_name, first_middle = [part.strip() for part in full_name.split(",", 1)]
    name_parts = [part for part in first_middle.split() if part]
    first_initial = letters_only(name_parts[0])[:1] if name_parts else ""
    middle_initial = letters_only(name_parts[1])[:1] if len(name_parts) > 1 else ""
    last_name_root = letters_only(last_name)[:5]
    return f"{first_initial}{middle_initial}{last_name_root}392"


def build_users(rows):
    header = rows[0]
    index = {name: header.index(name) for name in header}
    users = []
    for row in rows[1:]:
        if not any(row):
            continue

        full_name = row[index["FULL_NAME"]].strip()
        email = row[index["EMAIL"]].strip().lower()
        if not full_name or not email:
            continue

        last_name, first_middle = [part.strip() for part in full_name.split(",", 1)]
        name_parts = [part for part in first_middle.split() if part]
        first_name = name_parts[0] if name_parts else ""

        users.append(
            {
                "email": email,
                "password": build_default_password(full_name),
                "email_confirm": True,
                "user_metadata": {
                    "firstName": first_name,
                    "lastName": last_name,
                    "provisionedByRoster": True,
                },
            }
        )

    return users


def admin_request(url: str, service_role_key: str, payload: dict):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request) as response:
            body = response.read().decode("utf-8")
            return response.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8")
        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            payload = {"raw": body}
        return error.code, payload


def main():
    if not WORKBOOK_PATH.exists():
      raise SystemExit(f"Workbook not found: {WORKBOOK_PATH}")

    supabase_url = os.environ.get("EXPO_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("BACKEND_SERVICE_ROLE_KEY")
    dry_run = "--apply" not in sys.argv

    rows = load_workbook_rows(WORKBOOK_PATH)
    users = build_users(rows)

    print(f"Prepared {len(users)} users from {WORKBOOK_PATH.name}.")
    print("Sample:")
    for user in users[:5]:
        print(f"  {user['email']} -> {user['password']}")

    if dry_run:
        print("\nDry run only. Re-run with --apply after setting EXPO_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/BACKEND_SERVICE_ROLE_KEY.")
        return

    if not supabase_url or not service_role_key:
        raise SystemExit("Missing Supabase URL or service role key in environment variables.")

    create_url = supabase_url.rstrip("/") + "/auth/v1/admin/users"
    created = 0
    skipped = 0
    failed = 0

    for user in users:
        status, payload = admin_request(create_url, service_role_key, user)
        if status in (200, 201):
            created += 1
            print(f"CREATED {user['email']}")
        elif status == 422 and isinstance(payload, dict) and "already been registered" in json.dumps(payload).lower():
            skipped += 1
            print(f"SKIPPED {user['email']} (already exists)")
        else:
            failed += 1
            print(f"FAILED {user['email']} -> {payload}")

    print(f"\nDone. created={created} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
