import { ShieldedSite, SiteCredit } from '@vanamalix/ui';
import './credit.css';

/** The vananomad credit and Shielded button (hub docs/platform/SITE-CREDIT.md). */
export function SiteFoot() {
  return (
    <footer className="site-foot">
      <SiteCredit />
      <ShieldedSite />
    </footer>
  );
}
