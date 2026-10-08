# Land-KM deployment MCP connector (local stdio)

This is a minimal **optional** Model Context Protocol server. It is not hosted by GitHub Pages and cannot be used from a ChatGPT conversation until an MCP-capable client has been configured to run it. The currently connected GitHub tool does not automatically gain these methods.

## Tools

- `deploy_land_km`: explicitly dispatch only `lnwlawyer/Land-KM` / `publish-pages.yml` / `main`. This requests a run; it **does not** mean deployment succeeded.
- `get_deploy_status`: list the latest five runs or inspect a specified run.
- `verify_live_site`: check the public GitHub Pages HTML, manifest scope and service worker URL (read-only); does not verify a deployed commit SHA.
- `get_deploy_logs`: return job status and failed step names for a specified run; detailed GitHub web logs remain available at the run's `html_url`.

## Local configuration

Requires Node.js 22+ and a GitHub fine-grained personal access token with **Actions: Read and write** permission scoped **only** to `lnwlawyer/Land-KM`. Repository administrators may need to approve the token. Store the token in the MCP client's **secret environment configuration** as `LAND_KM_GITHUB_TOKEN`; do not put it in a repository file, commit, command-line argument, ChatGPT message, or frontend JavaScript.

MCP client example (replace the local path and supply the secret via the client's secret manager):

```json
{
  "mcpServers": {
    "land-km-deploy": {
      "command": "node",
      "args": ["C:/Land-KM/tools/land-km-deploy-mcp.mjs"]
    }
  }
}
```

The client must be able to launch a **local stdio MCP server**. Some hosted ChatGPT custom connectors require a remote HTTPS MCP endpoint instead; this local server alone does not meet that requirement. Do not expose this process as a public HTTP service or paste the token into a chat. A remote connector requires separate secure hosting, OAuth, and access controls and may introduce costs.

Run isolated tests:

```sh
node --test tests/land-km-deploy-mcp.test.mjs
```

## Security boundaries

No Firebase operations, no workflow edits, no arbitrary branch or repository selection, no workflow reruns, no arbitrary shell commands, and no automatic production deployment. Call `deploy_land_km` **only after explicit user approval**. The GitHub Actions workflow itself gates deployment to `main` and runs release tests. GitHub API failures return status codes, not response bodies that could contain secrets. The token is never included in tool output.

GitHub Pages URL: https://lnwlawyer.github.io/Land-KM/

## Verifying push-triggered deployments

The built-in ChatGPT GitHub connector's `fetch_commit_workflow_runs` currently filters to pull-request runs, so it cannot discover `push` runs on `main`. The MCP `get_deploy_status` uses GitHub's workflow-specific runs endpoint with `branch=main`, which includes `push` and `workflow_dispatch` runs. Once the MCP is installed in a compatible client, inspect `get_deploy_status`, then `get_deploy_logs` for any failed run, and `verify_live_site` for public site availability. An HTTP success alone does not prove the new commit was deployed; compare the workflow run's `head_sha` with the merged commit and its `conclusion=success`.
