/** @type {import('next').NextConfig} */
const nextConfig = {
  // The lint gate runs as an explicit CI step (npm run lint) so it fails fast
  // in the Data Integrity job, before the expensive Playwright build. Keeping
  // it out of `next build` avoids Next's eslint integration needing
  // eslint-config-next and keeps the gate deterministic and controllable.
  eslint: { ignoreDuringBuilds: true }
}
module.exports = nextConfig
