# SemVer releases (learn by shipping)

How **this** repo publishes to Docker Hub. Same ritual as the other `headless-*` images.

## Why SemVer exists

```text
MAJOR.MINOR.PATCH   →   e.g. 1.0.0
```

| Part | Bump when | Example |
| --- | --- | --- |
| **MAJOR** | Breaking for anyone already running the image | Remove `/fetch`, change default port, rename body fields |
| **MINOR** | New capability, old usage still works | Add `/pdf` while `/fetch` stays compatible |
| **PATCH** | Fix or image-only tweak, same client contract | Bug in `/pdf`, Playwright pin for a security fix |

Think from the puller’s point of view. Spec: [semver.org](https://semver.org/).

## How *our* pipeline uses SemVer

You choose the version. GitHub Actions does **not**.

```text
git tag v1.0.1  ──push──►  Actions build  ──►  Docker Hub
                                              1.0.1
                                              1.0
                                              latest
```

| You create (git) | Hub gets |
| --- | --- |
| `v1.0.0` | `harianto/headless-playwright:1.0.0`, `:1.0`, `:latest` |

- Git tag has a leading **`v`**; Hub tags do **not**.
- Pushing `main` alone publishes **nothing**.
- Keep `package.json` `"version"` aligned when you cut a release (same major.minor.patch, without the `v`).
- Pin compose to `1.0.0` in production; treat `latest` as lab-only.

Workflow: [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml) (root `Dockerfile`, amd64 + arm64).

## Decide the next version

```bash
git fetch --tags
git tag -l 'v*' | sort -V | tail -5
git log v1.0.0..HEAD --oneline
```

| Since last tag you… | Next tag |
| --- | --- |
| Only fixed bugs / deps | `v1.0.1` |
| Added compatible features | `v1.1.0` |
| Broke the HTTP contract | `v2.0.0` |
| Docs-only | **no tag** |

## Release checklist

```bash
git status
git fetch origin && git pull --ff-only origin main
# optional: bump "version" in package.json to match (e.g. 1.0.1)
NEXT=v1.0.1
git tag -a "$NEXT" -m "$NEXT"
git push origin "$NEXT"
docker pull harianto/headless-playwright:1.0.1
```

## Habits

- Tag clean `main`; prefer annotated tags.
- Never force-move a published tag — ship `v1.0.2` instead.
- Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

## Sibling images

Same SemVer rules: `headless-oxider`, `headless-camoufox`, `headless-obscura`, `headless-tunnel`.

## Quick self-test

1. Fix `/pdf` crash, last tag `v1.0.0` → `v1.0.1`
2. Add `/screenshot`, keep `/fetch` → `v1.1.0`
3. Rename `/fetch` → `/html` and remove `/fetch` → `v2.0.0`
4. README only → no tag
