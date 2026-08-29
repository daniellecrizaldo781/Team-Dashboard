import openpyxl, json, datetime, os

# Hidden tabs are deliberately excluded: they are drafts, archives and old
# copies that the team has taken out of circulation. Filtering here means every
# downstream parser only ever sees live tabs, with no per-parser opt-out.

def grid(path, out):
    w = openpyxl.load_workbook(path, data_only=True)
    d = {}
    skipped = []
    for n in w.sheetnames:
        s = w[n]
        if s.sheet_state != "visible":
            skipped.append(n)
            continue
        rows = []
        for r in s.iter_rows(values_only=True):
            row = []
            for c in r:
                if isinstance(c, datetime.datetime):
                    row.append({"__d": c.strftime("%Y-%m-%d")})
                elif isinstance(c, datetime.date):
                    row.append({"__d": c.strftime("%Y-%m-%d")})
                elif isinstance(c, datetime.time):
                    row.append(c.strftime("%H:%M:%S"))
                elif isinstance(c, datetime.timedelta):
                    row.append(str(c))
                elif c is None:
                    row.append("")
                elif isinstance(c, (int, float, str, bool)):
                    row.append(c)
                else:
                    row.append(str(c))
            rows.append(row)
        d[n] = rows
    json.dump(d, open(out, "w"), ensure_ascii=False)
    print(out, len(d), "visible tabs")
    if skipped:
        print("   skipped %d hidden: %s" % (len(skipped), ", ".join(skipped)))

grid("qa.xlsx", "qa.json")
grid("sched.xlsx", "sched.json")
if os.path.exists("casc.xlsx"):
    grid("casc.xlsx", "casc.json")
