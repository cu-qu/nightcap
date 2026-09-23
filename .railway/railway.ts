import { defineRailway, github, project, service } from "railway/iac";

const source = github("cu-qu/nightcap", {
  branch: "main",
  rootDirectory: "/backend",
});

const build = {
  builder: "RAILPACK" as const,
  buildCommand: "bash ./build.sh",
};

export default defineRailway(() => {
  const api = service("api server", {
    source,
    build,
    start: "python -m gunicorn config.wsgi:application --bind 0.0.0.0:8000",
    preDeploy: "bash ./build.sh",
    deploy: {
      restartPolicyType: "NEVER",
    },
  });

  const worker = service("celery worker", {
    source,
    build,
    start: "celery -A config worker -Q celery -l info --autoscale 4,2",
    deploy: {
      restartPolicyType: "NEVER",
    },
  });

  const beat = service("celery beat", {
    source,
    build,
    start: "celery -A config beat -l info",
    deploy: {
      restartPolicyType: "NEVER",
    },
  });

  return project("sublime-elegance", {
    resources: [api, worker, beat],
  });
});
