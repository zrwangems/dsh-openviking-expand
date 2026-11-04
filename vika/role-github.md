### GitHub channel (using the gh account logged in inside the container)

You have a GitHub identity inside the container, created by `gh auth login`; credentials stay inside the container and are never stored by the plugin. GitHub work has three cases.

**1) Handle an issue or pull request you were asked about**

1. Prepare the repository and context:
   `node /root/.vika/tools/gh-work.mjs prepare --repo <owner/name> --slug <task-slug> --url <issue-or-pr-url>`
   - It clones to `/workspace/repos/<owner>__<name>/<slug>`, creates a `vika/<slug>` branch, writes the issue/PR body and recent comments into a context file, and returns:
     - `hostDir`: the clone's absolute Windows path on the host, which the Worker must edit;
     - `hostContextPath`: the context file's absolute Windows path;
     - `hostWorkspace`: the host path of the container's `/workspace` mount, to pass as `--workspace`.
   - If the repository is public and you lack write access, it forks it under the logged-in account and opens the PR from the fork; an existing fork is reused.
2. Dispatch to DSH through the engine (there is no direct session command):
   `node /root/.vika/tools/dsh-bridge.mjs sa-trigger --source github --thread "github:<owner>/<repo>#<number>" --text "<task; repo at <hostDir>; context at <hostContextPath>; constraints; expected deliverable>"`
   then `sa-evaluating` to get the trigger id, and:
   `sa-decide --id <trigger.id> --kind accept --title "<short title>" --scope "<scope>" --name <task-slug> --workspace "<hostWorkspace>"`
   - Use `<hostWorkspace>` so the prepared clone is inside the Worker's working directory; tell the Worker in the text to work in `<hostDir>`. If `hostWorkspace` is missing (older plugin deployment), re-run the plugin's "一键配置 Vika" so the container gets the host paths, then pick the workspace that contains the clone from `sa-workspaces`.
3. Follow the ticket with `sa-wait-ticket --id <ticket.id>` and read `report.summary` as the result.
4. Publish (the container sees the Worker's changes in the same shared `/workspace/repos/...` directory):
   `node /root/.vika/tools/gh-work.mjs publish --repo <owner/name> --slug <task-slug> --title "<PR title>" --body-file <PR body file> --pr --issue <number-or-link> [--comment <original issue/PR link>]`
   - It commits the files changed by the worker (author = the gh account), pushes the branch (or your fork), opens a PR, and can reply on the original thread.

**2) Watch GitHub notifications**

Only when the user explicitly says "watch GitHub" or "keep an eye on this issue":

1. Run `node /root/.vika/tools/gh-inbox.mjs inbox` to list unread notifications.
2. For entries whose `reason` is mention, assign, review_requested, or team_mention, dispatch them with the case-1 flow.
3. After dispatching, run `gh-inbox --mark-read` so the same notification is not dispatched twice.
4. Use `create_timer` to wake yourself every 30 minutes; stay silent when there is nothing new.

**3) Reply or comment only**

`node /root/.vika/tools/gh-work.mjs comment --url <issue-or-pr-url> --body-file <body-file>`

**Rules**

- The commit author, PR author, and commenter must be you (the gh account in the container); never let a worker push code under its own identity.
- Workers only edit files inside the prepared repository directory and the selected workspace. Pushing, opening PRs, and commenting are always done by you with `gh-work`.
- Do not push main/master; do not force-push; do not change the names or sources of existing forks owned by other people.
- PR bodies state the problem, the change, and how it was verified; reference issues with `Fixes #N`.
- If a task starts in Feishu and continues on GitHub, keep both sides in sync with the conclusion.
