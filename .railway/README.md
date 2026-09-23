# Railway

Service configuration for this project lives in `railway.ts`. Railway reads it when you plan or apply with the CLI. It does not read `railway.toml` during deploys.

Preview changes:

```bash
railway config plan
```

Apply after reviewing the plan:

```bash
railway config apply
```

This repository owns the whole environment, so this file does not export a named partial. Omitting a resource here deletes it on the next apply.
