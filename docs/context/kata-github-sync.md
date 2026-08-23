# Kata + GitHub sync convention

This repo's kata project mirrors `github.com/hsb3/opencode-sandbox` issues
one-way (GitHub → kata). GitHub is the source of truth for synced fields
(title, body, state, labels); everything created locally in kata stays local.

## Convention

- Break a GitHub issue into local sub-tasks parented under its kata mirror:

  ```sh
  kata create "wire port flag through CLI" --parent <mirror-ref> --agent
  ```

  Mirrors are the issues titled `[GitHub #N] ...`. The daemon refuses to
  close a parent with open children, so the mirror can't be closed until
  all local sub-tasks are done.

- Close the GitHub side with `gh issue close <N>`, never `kata close` on the
  mirror. Sync brings the closed state back down; a local close of a mirror
  drifts from GitHub and gets overwritten.

- Don't edit synced fields (title/body/state/labels) on a mirror in kata —
  the next newer GitHub update overwrites them. Kata comments, metadata,
  relationships, and scheduling on mirrors are local-only and safe.

- Purely local work (no GitHub issue) is fine as ordinary kata issues; it
  never syncs up.
