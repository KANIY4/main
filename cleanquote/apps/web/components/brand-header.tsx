import { publicEnv } from '@cleanquote/config';
import Link from 'next/link';

// The brand is configuration, not a hard-coded string. An organisation on a
// white-label plan changes one environment variable, not the source.
const appName = publicEnv().NEXT_PUBLIC_APP_NAME;

export function BrandHeader({ children }: { children?: React.ReactNode }) {
  const initials = appName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <header className="site-header">
      <div className="wrap">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            {initials}
          </span>
          {appName}
        </Link>
        <span className="spacer" />
        {children}
      </div>
    </header>
  );
}
