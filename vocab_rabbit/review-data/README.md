# Photo Match Review State

`photo-match-review-selections.json` is the durable copy of the current review
state. The local review server writes it together with the runtime copy under
`design-output/photo-word-linking/review/`.

The `backups/` directory contains immutable point-in-time snapshots. Do not edit
those snapshots; restore one only if both live copies are damaged.

The files contain vocabulary IDs, photo IDs, timestamps, and rejected candidate
IDs. They do not contain the private source photos themselves.
