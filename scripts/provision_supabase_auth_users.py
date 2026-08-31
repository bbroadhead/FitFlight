import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


SQUADRON_PASSWORD_SUFFIXES = {
    "hawks": "392",
    "krakens": "8",
    "tigers": "324",
    "warriors": "792",
    "knights": "692",
}
ROSTER_TABLES = {
    "hawks": "roster",
    "krakens": "krakens_roster",
    "tigers": "tigers_roster",
    "warriors": "warriors_roster",
    "knights": "knights_roster",
}
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


def build_default_password(full_name: str, squadron_suffix: str):
    last_name, first_middle = [part.strip() for part in full_name.split(",", 1)]
    name_parts = [part for part in first_middle.split() if part]
    first_initial = letters_only(name_parts[0])[:1] if name_parts else ""
    middle_initial = letters_only(name_parts[1])[:1] if len(name_parts) > 1 else ""
    last_name_root = letters_only(last_name)[:5]
    return f"{first_initial}{middle_initial}{last_name_root}{squadron_suffix}"


def find_column_index(header, candidates):
    normalized = {str(value).strip().lower(): index for index, value in enumerate(header)}
    for candidate in candidates:
        if candidate in normalized:
            return normalized[candidate]
    return None


def build_users(rows, squadron_suffix: str):
    if not rows:
        raise ValueError("The workbook does not contain a roster sheet.")

    header = rows[0]
    full_name_index = find_column_index(header, ["full_name", "full name", "last name, first name", "name"])
    email_index = find_column_index(header, ["email", "af email", "email address", "mail"])
    if full_name_index is None or email_index is None:
        raise ValueError(
            "Could not find a name and email column. Expected FULL_NAME/EMAIL or Last Name, First Name/AF Email."
        )

    users = []
    for row in rows[1:]:
        if not any(row):
            continue

        full_name = str(row[full_name_index]).strip() if full_name_index < len(row) else ""
        email = str(row[email_index]).strip().lower() if email_index < len(row) else ""
        if not full_name or not email:
            continue

        if "," not in full_name:
            print(f"SKIPPED {email} (name must use Last Name, First Middle format)")
            continue

        last_name, first_middle = [part.strip() for part in full_name.split(",", 1)]
        name_parts = [part for part in first_middle.split() if part]
        first_name = name_parts[0] if name_parts else ""

        users.append(
            {
                "email": email,
                "password": build_default_password(full_name, squadron_suffix),
                "email_confirm": True,
                "user_metadata": {
                    "firstName": first_name,
                    "lastName": last_name,
                    "provisionedByRoster": True,
                    "mustChangePassword": True,
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


def fetch_auth_users_by_email(supabase_url: str, service_role_key: str):
    users_by_email = {}
    for page in range(1, 101):
        url = f"{supabase_url.rstrip('/')}/auth/v1/admin/users?page={page}&per_page=1000"
        request = urllib.request.Request(
            url,
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(request) as response:
                payload = json.loads(response.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8")
            raise RuntimeError(f"Unable to list Supabase Auth users: {body or error.code}") from error

        users = payload.get("users", []) if isinstance(payload, dict) else []
        for user in users:
            email = str(user.get("email") or "").strip().lower()
            user_id = str(user.get("id") or "").strip()
            if email and user_id:
                users_by_email[email] = user_id
        if len(users) < 1000:
            return users_by_email

    raise RuntimeError("Unable to list Supabase Auth users: more than 100,000 users returned.")


def mark_roster_account_provisioned(
    supabase_url: str,
    service_role_key: str,
    squadron: str,
    email: str,
    auth_user_id: str | None,
):
    table = ROSTER_TABLES[squadron]
    encoded_email = urllib.parse.quote(email.lower(), safe="")
    url = f"{supabase_url.rstrip('/')}/rest/v1/{table}?EMAIL=eq.{encoded_email}"
    payload = {
        "MUST_CHANGE_PASSWORD": True,
        "HAS_LOGGED_INTO_APP": False,
    }
    if auth_user_id:
        payload["AUTH_USER_ID"] = auth_user_id

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="PATCH",
    )

    try:
        with urllib.request.urlopen(request) as response:
            body = response.read().decode("utf-8")
            rows = json.loads(body) if body else []
            return response.status, rows
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8")
        try:
            payload = json.loads(body) if body else {}
        except json.JSONDecodeError:
            payload = {"raw": body}
        return error.code, payload


def main():
    parser = argparse.ArgumentParser(description="Provision FitFlight Supabase Auth users from a roster workbook.")
    parser.add_argument("--workbook", required=True, type=Path, help="Path to the roster .xlsx file.")
    parser.add_argument(
        "--squadron",
        required=True,
        choices=sorted(SQUADRON_PASSWORD_SUFFIXES),
        help="Squadron whose password suffix should be used.",
    )
    parser.add_argument("--apply", action="store_true", help="Create the users. Omit for a safe dry run.")
    args = parser.parse_args()

    workbook_path = args.workbook.expanduser().resolve()
    if not workbook_path.exists():
        raise SystemExit(f"Workbook not found: {workbook_path}")

    supabase_url = os.environ.get("EXPO_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("BACKEND_SERVICE_ROLE_KEY")
    dry_run = not args.apply

    rows = load_workbook_rows(workbook_path)
    users = build_users(rows, SQUADRON_PASSWORD_SUFFIXES[args.squadron])

    print(f"Prepared {len(users)} {args.squadron.title()} users from {workbook_path.name}.")
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
    roster_updates_failed = 0
    repaired = 0
    auth_users_by_email = fetch_auth_users_by_email(supabase_url, service_role_key)

    for user in users:
        existing_auth_user_id = auth_users_by_email.get(user["email"])
        if existing_auth_user_id:
            skipped += 1
            roster_status, roster_payload = mark_roster_account_provisioned(
                supabase_url,
                service_role_key,
                args.squadron,
                user["email"],
                existing_auth_user_id,
            )
            if roster_status in (200, 201) and isinstance(roster_payload, list) and roster_payload:
                repaired += 1
                print(f"LINKED {user['email']} (existing account; password unchanged)")
            else:
                roster_updates_failed += 1
                print(f"SKIPPED {user['email']} but roster update failed -> {roster_payload}")
            continue

        status, payload = admin_request(create_url, service_role_key, user)
        if status in (200, 201):
            created += 1
            auth_user_id = payload.get("id") if isinstance(payload, dict) else None
            if isinstance(auth_user_id, str):
                auth_users_by_email[user["email"]] = auth_user_id
            roster_status, roster_payload = mark_roster_account_provisioned(
                supabase_url,
                service_role_key,
                args.squadron,
                user["email"],
                auth_user_id if isinstance(auth_user_id, str) else None,
            )
            if roster_status in (200, 201) and isinstance(roster_payload, list) and roster_payload:
                print(f"CREATED {user['email']} (password change required on first sign-in)")
            else:
                roster_updates_failed += 1
                print(f"CREATED {user['email']} but roster update failed -> {roster_payload}")
        elif status == 422 and isinstance(payload, dict) and "already been registered" in json.dumps(payload).lower():
            failed += 1
            print(f"FAILED {user['email']} -> account already exists but could not be linked. Re-run this command.")
        else:
            failed += 1
            print(f"FAILED {user['email']} -> {payload}")

    print(
        f"\nDone. created={created} skipped={skipped} failed={failed} "
        f"linked_existing={repaired} roster_updates_failed={roster_updates_failed}"
    )


if __name__ == "__main__":
    main()
