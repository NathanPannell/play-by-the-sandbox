// Vercel "Ignored Build Step" (vercel.json ignoreCommand). Exit 1 means build,
// exit 0 means skip. Git deployments build only for staging and main, so there
// are no preview deployments. CLI deployments carry no git ref and still build.
import { fileURLToPath } from 'node:url';

export const DEPLOY_BRANCHES = ['main', 'staging'];

/** @param {string | undefined} ref */
export function shouldBuild(ref) {
  return !ref || DEPLOY_BRANCHES.includes(ref);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ref = process.env.VERCEL_GIT_COMMIT_REF;
  const build = shouldBuild(ref);
  console.log(
    build
      ? `Building ${ref || 'CLI deployment'}`
      : `Skipping branch ${ref}: only ${DEPLOY_BRANCHES.join(' and ')} deploy`,
  );
  process.exit(build ? 1 : 0);
}
