import openpyxl
w = openpyxl.load_workbook("qa.xlsx", data_only=True)
s = w["WEEKLY SCORECARD"]
# find the last block whose Overall % has non-zero values
rows = list(s.iter_rows(values_only=True))
blocks = [i for i, r in enumerate(rows) if r and str(r[0] or "").strip().upper() == "OVERALL %"]
print("Overall % rows at:", blocks[-4:])
for bi in blocks[-2:]:
    # walk up to the agent-name header
    hdr = None
    for up in range(bi, max(0, bi - 40), -1):
        r = rows[up]
        names = [str(c).strip() for c in r[1:9] if c and isinstance(c, str) and len(str(c).split()) <= 4]
        if len(names) >= 3 and not any("week" in n.lower() for n in names):
            hdr = (up, names); break
    wk = None
    for up in range(bi, max(0, bi - 40), -1):
        j = " ".join(str(c) for c in rows[up] if c)
        if "WEEK:" in j.upper():
            wk = j[:60]; break
    print("\n=== block at row", bi + 1, "| week:", wk)
    print("agents:", hdr[1] if hdr else "?")
    print("Overall %:", [rows[bi][c] for c in range(1, 9)])
    for lbl in ["QA Score", "Productivity %", "Attendance %", "TOTAL SCORE (out of 100)", "TEAM RANKING"]:
        for up in range(bi - 30, bi + 6):
            if 0 <= up < len(rows) and str(rows[up][0] or "").strip() == lbl:
                print(f"{lbl:26}", [rows[up][c] for c in range(1, 9)])
                break
