import { defineRailway, github, postgres, project, redis, service } from "railway/iac";

const source = github("cu-qu/nightcap", {
  branch: "main",
  rootDirectory: "/backend",
});

const build = {
  builder: "RAILPACK" as const,
  buildCommand: "bash ./build.sh",
};

const region = "europe-west4-drams3a";

export default defineRailway(() => {
  const db = postgres("Postgres", { region });
  const cache = redis("Redis", { region });

  const appEnv = {
    DATABASE_URL: db.env.DATABASE_URL,
    DJANGO_DB_HOST: db.env.PGHOST,
    DJANGO_DB_PORT: db.env.PGPORT,
    DJANGO_DB_NAME: db.env.PGDATABASE,
    DJANGO_DB_USER: db.env.PGUSER,
    DJANGO_DB_PASSWORD: db.env.PGPASSWORD,
    REDIS_URL: cache.env.REDIS_URL,
    CELERY_BROKER_URL: cache.env.REDIS_URL,
    CELERY_RESULT_BACKEND: cache.env.REDIS_URL,
    DJANGO_SETTINGS_MODULE: "config.settings.production",
    ALLOWED_HOSTS: ".up.railway.app",
  };

  const api = service("nightcap api", {
    source,
    build,
    start: "python -m gunicorn config.wsgi:application --bind 0.0.0.0:8000",
    preDeploy: "bash ./build.sh",
    deploy: {
      restartPolicyType: "NEVER",
    },
    env: appEnv,
  });

  const worker = service("celery worker", {
    source,
    build,
    start: "celery -A config worker -Q celery -l info --autoscale 4,2",
    deploy: {
      restartPolicyType: "NEVER",
    },
    env: appEnv,
  });

  const beat = service("celery beat", {
    source,
    build,
    start: "celery -A config beat -l info",
    deploy: {
      restartPolicyType: "NEVER",
    },
    env: appEnv,
  });

  return project("nightcap api", {
    resources: [db, cache, api, worker, beat],
  });
});
