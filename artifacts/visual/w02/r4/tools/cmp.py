import json,sys
B=sys.argv[1]; name=sys.argv[2]; tags=sys.argv[3:]
ds=[json.load(open(f"{B}/rd/{t}/{name}.json")) for t in tags]
print("region".ljust(26), " ".join(t.rjust(14) for t in tags))
for i,r in enumerate(ds[0]["all"]):
    print(str(r["design"]).ljust(26), " ".join((f'{d["all"][i]["drift"]:5.1f} dy{d["all"][i]["dy"]} dh{d["all"][i]["dh"]}').rjust(14) for d in ds))
print("wtd".ljust(26), " ".join(str(d["weighted_drift"]).rjust(14) for d in ds), " pass", [d["passed"] for d in ds])
