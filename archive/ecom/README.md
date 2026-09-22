# Archived ECOM code

These toolkit modules came from Sara's ECOM repository but are not used by this
table or its backend:

- `toolkit/save_community_json.py`: optional community serializer.
- `toolkit/visualize_dispatch.py`: standalone Matplotlib animation script.
- `toolkit/result.py`: deprecated result class, replaced by `analysis/data.py`.

They are outside `ECOMToolkit` so the running API does not import them. The
unused owner, minimum flow, and minimum capacity view filters were removed from
`animations/ecom-energy.js`; their previous implementation remains in Git
history at commit `8754bd3`.

The ECOM API endpoints remain in place because they may be used outside the
table controller.
