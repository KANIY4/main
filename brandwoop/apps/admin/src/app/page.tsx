export default function HomePage() {
  return (
    <>
      <h1>BrandWoop administration portal</h1>
      <p className="muted">
        Foundation deployment. Authentication, tenant onboarding and the admin workspace land in the
        week 3-4 milestone.
      </p>
      <h2>Service endpoints</h2>
      <ul>
        <li>
          <a href="/api/v1/health">/api/v1/health</a> — liveness
        </li>
        <li>
          <a href="/api/v1/ready">/api/v1/ready</a> — dependency readiness
        </li>
      </ul>
    </>
  );
}
