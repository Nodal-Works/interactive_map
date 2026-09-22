# ECOM layer backend

This is the ECOM API used by `controller/ecom-controls.js` in this repository.
The initial map reads `media/ecom/*.geojson`; changing a controller setting
calls `POST /api/mr/layer` for a new layer.

Put the campus demand CSVs in `media/ecom/energy_data/` at the repository root.
That folder is ignored by Git. The saved scenario keeps portable relative paths;
the API resolves them when it loads the scenario.

From the repository root, start the backend on port 8000:

```bash
cd Dashboard/backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Serve the map separately, for example with Live Server on port 5500–5599 or
`python3 -m http.server 8090` from the repository root. The API allows those
local origins.

Every flow uses `media/street-network.geojson`. If a live flow cannot reach the
street network, the API responds with HTTP 422 and the controller shows the
error. Run `python -m unittest discover -s tests -p 'test_street_only.py'` from
this directory to check that behavior. To refresh the committed initial layer,
run `python scripts/export_mr_layer.py` while the backend is running.
